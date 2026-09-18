#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

DEFAULT_MAX_BYTES = 24_000_000


def q(value: Any) -> str:
    if value is None: return "NULL"
    if isinstance(value, bool): return "1" if value else "0"
    if isinstance(value, (int, float)): return str(value)
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def address_hash(address: Any) -> str:
    return hashlib.sha256(str(address).encode("utf-8", errors="replace")).hexdigest()


def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024), b""): h.update(block)
    return h.hexdigest()


def read_gzip_json(path: Path) -> Any:
    with gzip.open(path,"rt",encoding="utf-8") as f: return json.load(f)


def iter_observations(root: Path) -> Iterable[dict[str, Any]]:
    for path in sorted(root.rglob("*.ndjson.gz")):
        if "/observations/" not in path.as_posix(): continue
        with gzip.open(path,"rt",encoding="utf-8") as f:
            for line in f:
                line=line.strip()
                if line:
                    row=json.loads(line)
                    if isinstance(row,dict): yield row


def iter_node_states(root: Path) -> Iterable[tuple[dict[str, Any], str, Any]]:
    for path in sorted(root.rglob("nodes-*.json.gz")):
        if "/snapshots/" not in path.as_posix(): continue
        payload=read_gzip_json(path)
        nodes=payload.get("nodes") if isinstance(payload,dict) else None
        if isinstance(nodes,dict):
            for address,state in nodes.items(): yield payload,str(address),state


def iter_cycles(root: Path) -> Iterable[dict[str, Any]]:
    # v3 cycle manifests exist for every probe cycle; fall back to v2 snapshot
    # manifests when importing older private archives.
    found=False
    for path in sorted(root.rglob("*.json")):
        if "/manifests/" not in path.as_posix(): continue
        try: payload=json.loads(path.read_text(encoding="utf-8"))
        except Exception: continue
        if isinstance(payload,dict) and payload.get("schema") in {"zzx-bitnodes-history-v3","zzx-bitnodes-history-v2"}:
            found=True; yield payload
    if found: return
    for path in sorted(root.rglob("manifest.json")):
        if "/snapshots/" not in path.as_posix(): continue
        try: payload=json.loads(path.read_text(encoding="utf-8"))
        except Exception: continue
        if isinstance(payload,dict) and payload.get("schema")=="zzx-bitnodes-history-snapshot-v2": yield payload


class SqlShardWriter:
    def __init__(self,out:Path,prefix:str,header:str,insert_prefix:str,rows_per_shard:int,max_bytes:int):
        self.out=out; self.prefix=prefix; self.header=header; self.insert_prefix=insert_prefix
        self.rows_per_shard=max(1,int(rows_per_shard)); self.max_bytes=int(max_bytes); self.rows=[]; self.shard_no=0; self.files=[]; self.total=0
    def add(self,row:str)->None:
        self.rows.append(row); self.total+=1
        if len(self.rows)>=self.rows_per_shard: self.flush()
    def flush(self)->None:
        if not self.rows:return
        path=self.out/f"{self.prefix}_{self.shard_no:05d}.sql.gz"
        with gzip.open(path,"wt",encoding="utf-8",compresslevel=6) as f:
            f.write(self.header); f.write(self.insert_prefix); f.write("\n"); f.write(",\n".join(self.rows)); f.write(";\n")
        size=path.stat().st_size
        if size>self.max_bytes:
            path.unlink(missing_ok=True); raise RuntimeError(f"{self.prefix} shard exceeds {self.max_bytes} bytes; reduce --rows-per-shard")
        self.files.append({"path":path.name,"rows":len(self.rows),"bytes":size,"sha256":sha256(path)})
        self.shard_no+=1; self.rows=[]
    def close(self)->None:self.flush()


def main()->int:
    ap=argparse.ArgumentParser(description="Build bounded idempotent MariaDB SQL shards from private Bitnodes history.")
    ap.add_argument("--history-root",required=True); ap.add_argument("--output-dir",required=True)
    ap.add_argument("--rows-per-shard",type=int,default=5000); ap.add_argument("--max-bytes",type=int,default=DEFAULT_MAX_BYTES)
    args=ap.parse_args(); root=Path(args.history_root); out=Path(args.output_dir); out.mkdir(parents=True,exist_ok=True)

    cycle_header="""CREATE TABLE IF NOT EXISTS bitnodes_history_cycles (\n  cycle_id VARCHAR(96) NOT NULL,\n  observed_at DATETIME NOT NULL,\n  observed_ts BIGINT NOT NULL,\n  source VARCHAR(64) NOT NULL,\n  node_count BIGINT NOT NULL,\n  manifest_json LONGTEXT NOT NULL,\n  PRIMARY KEY (cycle_id),\n  KEY idx_bitnodes_cycle_ts (observed_ts)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n"""
    state_header="""CREATE TABLE IF NOT EXISTS bitnodes_history_nodes (\n  cycle_id VARCHAR(96) NOT NULL,\n  address_hash CHAR(64) NOT NULL,\n  observed_ts BIGINT NOT NULL,\n  source VARCHAR(64) NOT NULL,\n  address VARCHAR(512) NOT NULL,\n  state_json LONGTEXT NOT NULL,\n  PRIMARY KEY (cycle_id,address_hash),\n  KEY idx_bitnodes_history_address_ts (address(191), observed_ts),\n  KEY idx_bitnodes_history_ts (observed_ts)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n"""
    obs_header="""CREATE TABLE IF NOT EXISTS bitnodes_observations (\n  cycle_id VARCHAR(96) NOT NULL,\n  address_hash CHAR(64) NOT NULL,\n  observed_at DATETIME NOT NULL,\n  observed_ts BIGINT NOT NULL,\n  source VARCHAR(64) NOT NULL,\n  address VARCHAR(512) NOT NULL,\n  reachable TINYINT(1) NOT NULL,\n  raw_json LONGTEXT NULL,\n  PRIMARY KEY (cycle_id,address_hash),\n  KEY idx_bitnodes_observed_ts (observed_ts),\n  KEY idx_bitnodes_address_ts (address(191), observed_ts)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n"""
    cycles=SqlShardWriter(out,"bitnodes_history_cycles",cycle_header,"INSERT IGNORE INTO bitnodes_history_cycles (cycle_id,observed_at,observed_ts,source,node_count,manifest_json) VALUES",args.rows_per_shard,args.max_bytes)
    states=SqlShardWriter(out,"bitnodes_history_nodes",state_header,"INSERT IGNORE INTO bitnodes_history_nodes (cycle_id,address_hash,observed_ts,source,address,state_json) VALUES",args.rows_per_shard,args.max_bytes)
    observations=SqlShardWriter(out,"bitnodes_observations",obs_header,"INSERT IGNORE INTO bitnodes_observations (cycle_id,address_hash,observed_at,observed_ts,source,address,reachable,raw_json) VALUES",args.rows_per_shard,args.max_bytes)

    for row in iter_cycles(root):
        ts=int(row.get("timestamp") or 0); observed=str(row.get("observed_at") or row.get("generated_at") or "").replace("T"," ").replace("Z","")
        cycles.add("("+",".join([q(row.get("cycle_id")),q(observed),q(ts),q(row.get("source")),q(int(row.get("nodes") or row.get("node_count") or 0)),q(json.dumps(row,ensure_ascii=False,separators=(",",":"),sort_keys=True,default=str))])+")")
    for envelope,address,state in iter_node_states(root):
        states.add("("+",".join([q(envelope.get("cycle_id")),q(address_hash(address)),q(int(envelope.get("timestamp") or 0)),q(envelope.get("source")),q(address),q(json.dumps(state,ensure_ascii=False,separators=(",",":"),sort_keys=True,default=str))])+")")
    for row in iter_observations(root):
        observed=str(row.get("observed_at") or "").replace("T"," ").replace("Z",""); raw=row.get("raw")
        raw_json=None if raw is None else json.dumps(raw,ensure_ascii=False,separators=(",",":"),sort_keys=True,default=str); address=row.get("address")
        observations.add("("+",".join([q(row.get("cycle_id")),q(address_hash(address)),q(observed),q(int(row.get("timestamp") or 0)),q(row.get("source")),q(address),q(bool(row.get("reachable"))),q(raw_json)])+")")
    cycles.close(); states.close(); observations.close()
    manifest={"schema":"zzx-bitnodes-history-mariadb-v3","max_bytes":int(args.max_bytes),"idempotent":True,"cycles":{"rows":cycles.total,"files":cycles.files},"node_states":{"rows":states.total,"files":states.files},"observations":{"rows":observations.total,"files":observations.files}}
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(manifest,indent=2)); return 0

if __name__=="__main__": raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import gzip, json, subprocess, sys, tempfile
from pathlib import Path
TOOLS=Path(__file__).resolve().parent; sys.path.insert(0,str(TOOLS))
from history_archive import record_cycle

def main()->int:
  with tempfile.TemporaryDirectory() as tmp_s:
    tmp=Path(tmp_s); history=tmp/'history'; state=tmp/'state'; sql=tmp/'sql'
    nodes={f"198.51.{i//250}.{(i%250)+1}:8333":[70016,f"/Satoshi:selftest-{i}/",0,1,900000+i,None,None,None,None,None,None,None,None,None,None,None,None,None,None,{"success_count":i+1,"first_seen":1700000000,"last_success":1789747000}] for i in range(2500)}
    first=record_cycle(history,source='zzxbitnodes',timestamp=1789747000,payload={'nodes':nodes,'timestamp':1789747000,'generated_at':'2026-09-18T15:56:40Z'},successes={'203.0.113.1:8333':[70016,'/Satoshi:selftest/',0]},failures=['203.0.113.2:8333'],changes={'schema':'zzx-bitnodes-change-set-v4'},max_shard_bytes=60000,nodes_per_shard=1000,full_snapshot_interval_seconds=900)
    second=record_cycle(history,source='zzxbitnodes',timestamp=1789747060,payload={'nodes':nodes,'timestamp':1789747060},successes={'203.0.113.3:8333':[70016,'/Satoshi:selftest2/',0]},failures=['203.0.113.4:8333'],changes={'schema':'zzx-bitnodes-change-set-v4'},max_shard_bytes=60000,nodes_per_shard=1000,full_snapshot_interval_seconds=900)
    if not first.get('full_snapshot') or second.get('full_snapshot'): raise SystemExit('periodic full snapshot policy failed')
    sm=history/first['files']['snapshot_manifest']['path']; snap=json.loads(sm.read_text())
    if snap.get('node_count')!=len(nodes): raise SystemExit('node count mismatch')
    shards=snap.get('node_shards') or []
    if len(shards)<2 or any(int(x.get('bytes') or 0)>60000 for x in shards): raise SystemExit('sharding bound failed')
    cycle_manifests=list(history.rglob('manifests/*.json'))
    if len(cycle_manifests)!=2: raise SystemExit('every cycle must have a manifest')
    latest=tmp/'latest-state'; latest.mkdir()
    for src in sm.parent.iterdir():
      if src.is_file(): (latest/src.name).write_bytes(src.read_bytes())
    subprocess.run([sys.executable,str(TOOLS/'restore_private_state.py'),'--manifest',str(latest/'manifest.json'),'--state-dir',str(state)],check=True,stdout=subprocess.DEVNULL)
    if len(json.loads((state/'nodes.json').read_text()))!=len(nodes): raise SystemExit('restore count mismatch')
    subprocess.run([sys.executable,str(TOOLS/'history_mariadb.py'),'--history-root',str(history),'--output-dir',str(sql),'--rows-per-shard','500','--max-bytes','24000000'],check=True,stdout=subprocess.DEVNULL)
    m=json.loads((sql/'manifest.json').read_text())
    if m.get('schema')!='zzx-bitnodes-history-mariadb-v3' or not m.get('idempotent'): raise SystemExit('MariaDB v3/idempotence contract failed')
    if int(m['cycles']['rows'])!=2 or int(m['node_states']['rows'])!=len(nodes) or int(m['observations']['rows'])!=4: raise SystemExit('MariaDB row counts failed')
    for path in sql.glob('*.sql.gz'):
      with gzip.open(path,'rt',encoding='utf-8') as f: text=f.read()
      if 'CREATE TABLE' not in text or 'INSERT IGNORE' not in text: raise SystemExit(f'non-idempotent SQL shard: {path}')
  print('history_archive_selftest: PASS'); return 0
if __name__=='__main__': raise SystemExit(main())

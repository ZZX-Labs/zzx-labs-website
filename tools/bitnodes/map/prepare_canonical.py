#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping

THIS=Path(__file__).resolve()
REPO_ROOT=THIS.parents[3]
TOOLS=REPO_ROOT/'tools'/'bitnodes'
if str(TOOLS) not in sys.path:
    sys.path.insert(0,str(TOOLS))

import geo_contract  # noqa: E402
import merge_sources  # noqa: E402


def read_json(path: Path) -> Any:
    with path.open('r',encoding='utf-8') as h:
        return json.load(h)


def node_count(payload: Any) -> int:
    if not isinstance(payload,Mapping): return 0
    rows=payload.get('nodes')
    if isinstance(rows,Mapping): return len(rows)
    if isinstance(rows,list): return sum(1 for row in rows if isinstance(row,(Mapping,list)))
    return 0


def usable(path: Path) -> tuple[bool,str,int]:
    if not path.is_file() or path.stat().st_size<=0: return False,'',0
    try: payload=read_json(path)
    except Exception: return False,'',0
    return node_count(payload)>0,str(payload.get('schema') or '') if isinstance(payload,Mapping) else '',node_count(payload)


def first_usable(paths: list[Path]) -> Path|None:
    for path in paths:
        if usable(path)[0]: return path
    return None


def discover(repo_root: Path, include_original: bool=False) -> list[tuple[str,Path]]:
    api=repo_root/'bitcoin'/'bitnodes'/'api'; snapshot=api/'snapshots'/'latest.json'
    inputs=[]
    zzx=first_usable([api/'enriched'/'zzxbitnodes'/'latest.geo.json',api/'enriched'/'zzxbitnodes'/'latest.json',api/'zzxbitnodes'/'latest.json'])
    if zzx: inputs.append(('zzxbitnodes',zzx))
    btc=first_usable([api/'enriched'/'btcnodes'/'latest.geo.json',api/'enriched'/'btcnodes'/'latest.json',api/'btcnodes'/'normalized'/'latest.json',api/'btcnodes'/'latest.json'])
    if btc: inputs.append(('btcnodes.io',btc))
    if not inputs and usable(snapshot)[0]: inputs.append(('published-snapshot-fallback',snapshot))
    if not inputs:
        data=first_usable([api/'data'/'latest.json',api/'latest.json'])
        if data: inputs.append(('published-data-fallback',data))
    if include_original:
        original=first_usable([api/'enriched'/'originalbitnodes'/'latest.geo.json',api/'enriched'/'originalbitnodes'/'latest.json',api/'originalbitnodes'/'latest.json'])
        if original: inputs.append(('originalbitnodes-compat',original))
    return inputs


def geo_counts(payload: Mapping[str,Any]) -> dict[str,int]:
    rows=payload.get('nodes')
    if isinstance(rows,Mapping): rows=list(rows.values())
    if not isinstance(rows,list): return {k:0 for k in ('country','city','county','coordinates')}
    out={k:0 for k in ('country','city','county','coordinates')}
    for row in rows:
        if isinstance(row,list):
            country=str(row[7] if len(row)>7 else '').upper(); city=row[6] if len(row)>6 else None; county=row[14] if len(row)>14 else None; lat=row[8] if len(row)>8 else None; lon=row[9] if len(row)>9 else None
        elif isinstance(row,Mapping):
            country=str(row.get('country') or row.get('country_code') or '').upper(); city=row.get('city'); county=row.get('county'); lat=row.get('latitude'); lon=row.get('longitude')
        else: continue
        if len(country)==2: out['country']+=1
        if city and len(country)==2: out['city']+=1
        if county and len(country)==2: out['county']+=1
        try:
            lat=float(lat); lon=float(lon)
            if -90<=lat<=90 and -180<=lon<=180: out['coordinates']+=1
        except Exception: pass
    return out


def enrich_source(source: str, path: Path, *, lookup: Any, work_dir: Path, compact: bool) -> tuple[Path,dict[str,Any]]:
    payload=read_json(path)
    if not isinstance(payload,Mapping): raise RuntimeError(f'{source}: payload must be object')
    before=geo_counts(payload)
    enriched, report=geo_contract.build(payload,lookup)
    out=work_dir/f'{source.replace("/","_").replace(".","_")}.geo.json'
    geo_contract.write_json(out,enriched,compact)
    return out,{"source":source,"input":str(path),"before":before,"after":{k:int(report.get(k) or 0) for k in ('country','city','county','coordinates')},"public_ip":int(report.get('public_ip') or 0),"overlay_or_non_ip":int(report.get('overlay_or_non_ip') or 0),"non_public_ip":int(report.get('non_public_ip') or 0)}


def prepare(repo_root: Path, output: Path, report_path: Path|None, include_original: bool, compact: bool, *, geoip_dir: Path, geo_root: Path, minimum_country: int=1, minimum_coordinates: int=1) -> dict[str,Any]:
    inputs=discover(repo_root,include_original=include_original)
    if not inputs: raise RuntimeError('Map Host found no usable full-node source to canonicalize')
    for required in (geoip_dir/'dbip-city-lite.mmdb',geoip_dir/'dbip-country-lite.mmdb',geoip_dir/'dbip-asn-lite.mmdb'):
        if not required.is_file() or required.stat().st_size<=0:
            raise RuntimeError(f'Map Host geolocation database missing: {required}')

    source_details=[]
    with tempfile.TemporaryDirectory(prefix='zzx-maphost-geo-') as td:
        work=Path(td)
        enriched_inputs=[]
        with geo_contract.Lookup(geoip_dir/'dbip-city-lite.mmdb',geoip_dir/'dbip-country-lite.mmdb',geoip_dir/'dbip-asn-lite.mmdb',geo_root) as lookup:
            for source,path in inputs:
                enriched_path, detail=enrich_source(source,path,lookup=lookup,work_dir=work,compact=True)
                detail['path']=str(path.relative_to(repo_root)) if path.is_relative_to(repo_root) else str(path)
                detail['schema']=usable(path)[1]; detail['node_rows']=usable(path)[2]
                source_details.append(detail); enriched_inputs.append((source,enriched_path))
        payload=merge_sources.build(enriched_inputs)

    schema=str(payload.get('schema') or ''); rows=payload.get('nodes')
    if not schema.startswith('zzx-bitnodes-canonical-v'): raise RuntimeError(f'canonical preparation produced wrong schema: {schema!r}')
    if not isinstance(rows,list) or not rows: raise RuntimeError('canonical preparation produced zero node rows')
    geo=payload.get('geolocation') if isinstance(payload.get('geolocation'),Mapping) else {}
    counts={k:int(geo.get(k) or 0) for k in ('country','city','county','coordinates')}
    if counts['country']<max(0,int(minimum_country)): raise RuntimeError(f'canonical preparation has too few country rows: {counts["country"]} < {minimum_country}')
    if counts['coordinates']<max(0,int(minimum_coordinates)): raise RuntimeError(f'canonical preparation has too few coordinate rows: {counts["coordinates"]} < {minimum_coordinates}')

    output.parent.mkdir(parents=True,exist_ok=True)
    kwargs={"ensure_ascii":False,"separators":(',',':')} if compact else {"ensure_ascii":False,"indent":2}
    output.write_text(json.dumps(payload,**kwargs)+'\n',encoding='utf-8')
    report={"schema":"zzx-bitnodes-maphost-canonical-prep-v2","mode":"enriched-canonical","output_schema":schema,"node_rows":len(rows),"sources":source_details,"geolocation":counts}
    if report_path:
        report_path.parent.mkdir(parents=True,exist_ok=True); report_path.write_text(json.dumps(report,**kwargs)+'\n',encoding='utf-8')
    return report


def main()->int:
    ap=argparse.ArgumentParser(description='Enrich current Bitnodes sources from public IPs and prepare canonical v2 for Map Host.')
    ap.add_argument('--repo-root',default=str(REPO_ROOT)); ap.add_argument('--output',required=True); ap.add_argument('--report',default=''); ap.add_argument('--include-original',action='store_true'); ap.add_argument('--minimum-nodes',type=int,default=1); ap.add_argument('--minimum-country',type=int,default=1); ap.add_argument('--minimum-coordinates',type=int,default=1); ap.add_argument('--geoip-dir',default=str(REPO_ROOT/'bitcoin'/'bitnodes'/'data'/'geoip')); ap.add_argument('--geo-root',default=str(REPO_ROOT/'bitcoin'/'bitnodes'/'data'/'geo')); ap.add_argument('--compact',action='store_true')
    args=ap.parse_args()
    report=prepare(Path(args.repo_root).resolve(),Path(args.output),Path(args.report) if args.report else None,bool(args.include_original),bool(args.compact),geoip_dir=Path(args.geoip_dir),geo_root=Path(args.geo_root),minimum_country=args.minimum_country,minimum_coordinates=args.minimum_coordinates)
    if int(report['node_rows'])<max(1,int(args.minimum_nodes)): raise SystemExit(f'prepared canonical snapshot has too few nodes: {report["node_rows"]}')
    print(json.dumps(report,ensure_ascii=False)); return 0

if __name__=='__main__': raise SystemExit(main())

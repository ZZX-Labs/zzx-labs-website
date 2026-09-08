#!/usr/bin/env python3
from __future__ import annotations
import json, tempfile
from pathlib import Path
import prepare_canonical as pc

class FakeLookup:
    def lookup(self, ip: str):
        if ip=='8.8.8.8': return {"ip":ip,"country_code":"US","country_name":"United States","country_flag":"🇺🇸","region":"California","admin1_code":"CA","county":"Santa Clara County","admin2_code":"085","city":"Mountain View","latitude":37.4,"longitude":-122.1,"asn":"AS15169","organization":"Google","geo_source":"fixture"}
        if ip=='1.1.1.1': return {"ip":ip,"country_code":"AU","country_name":"Australia","country_flag":"🇦🇺","region":"New South Wales","admin1_code":"NSW","county":"","admin2_code":"","city":"Sydney","latitude":-33.86,"longitude":151.2,"asn":"AS13335","organization":"Cloudflare","geo_source":"fixture"}
        return {}

def main():
    with tempfile.TemporaryDirectory() as td:
        root=Path(td); api=root/'bitcoin'/'bitnodes'/'api'; (api/'zzxbitnodes').mkdir(parents=True); (api/'btcnodes'/'normalized').mkdir(parents=True)
        zzx={"schema":"zzx-bitnodes-normalized-v4","nodes":{"8.8.8.8:8333":[70016,"/Satoshi:27.0/",0,1,900000],"abc.onion:8333":[70016,"/Knots:27.1/",0,1,900000]}}
        btc={"schema":"zzx-bitnodes-normalized-v5","nodes":{"1.1.1.1:8333":[70016,"/Satoshi:26.0/",0,1,900000],"10.0.0.1:8333":[70016,"/Satoshi:25.0/",0,1,900000]}}
        (api/'zzxbitnodes'/'latest.json').write_text(json.dumps(zzx),encoding='utf-8'); (api/'btcnodes'/'normalized'/'latest.json').write_text(json.dumps(btc),encoding='utf-8')
        inputs=pc.discover(root)
        assert len(inputs)==2
        with tempfile.TemporaryDirectory() as wd:
            out=[]; details=[]
            fake=FakeLookup()
            for source,path in inputs:
                p,d=pc.enrich_source(source,path,lookup=fake,work_dir=Path(wd),compact=True); out.append((source,p)); details.append(d)
            payload=pc.merge_sources.build(out)
        assert payload['schema']=='zzx-bitnodes-canonical-v2'
        assert payload['geolocation']['country']==2
        assert payload['geolocation']['coordinates']==2
        rows={r['address']:r for r in payload['nodes']}
        assert rows['8.8.8.8:8333']['country']=='US'
        assert rows['1.1.1.1:8333']['country']=='AU'
        assert rows['abc.onion:8333']['country'] is None
        assert rows['10.0.0.1:8333']['country'] is None
    print('prepare_canonical_selftest: PASS')
    return 0
if __name__=='__main__': raise SystemExit(main())

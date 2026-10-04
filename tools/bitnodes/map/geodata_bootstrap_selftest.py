#!/usr/bin/env python3
from __future__ import annotations

import tempfile
from pathlib import Path

import prepare_canonical as pc


class FakeEnsure:
    @staticmethod
    def ensure_dbip(geoip_dir, **kwargs):
        geoip_dir.mkdir(parents=True, exist_ok=True)
        rows=[]
        for name in ("city","country","asn"):
            p=geoip_dir/f"dbip-{name}-lite.mmdb"
            p.write_bytes(b"x"*70000)
            rows.append({"name":name,"path":str(p),"mode":"fixture"})
        return rows

    @staticmethod
    def ensure_geonames(geo_root, **kwargs):
        src=geo_root/"sources"
        src.mkdir(parents=True, exist_ok=True)
        rows=[]
        for name,size in (
            ("admin1CodesASCII.txt",2000),
            ("admin2Codes.txt",2000),
            ("cities500.txt",12000),
        ):
            p=src/name
            p.write_bytes(b"x"*size)
            rows.append({"name":name,"path":str(p),"mode":"fixture"})
        return rows

    @staticmethod
    def verify(geoip_dir, geo_root):
        paths=pc.required_geodata(geoip_dir,geo_root)
        missing=[str(p) for p in paths if not p.is_file() or p.stat().st_size<=0]
        if missing:
            raise RuntimeError(missing)
        return {"files":[str(p) for p in paths]}


def main():
    with tempfile.TemporaryDirectory() as td:
        root=Path(td)
        geoip=root/"geoip"
        geo=root/"geo"

        original=pc.ensure_geo_data
        pc.ensure_geo_data=FakeEnsure
        try:
            assert not pc.geodata_ready(geoip,geo)
            report=pc.bootstrap_geodata(geoip,geo,months_back=6,timeout=5,retries=1)
            assert report["mode"]=="download"
            assert pc.geodata_ready(geoip,geo)

            report2=pc.bootstrap_geodata(geoip,geo,months_back=6,timeout=5,retries=1)
            assert report2["mode"]=="existing"
        finally:
            pc.ensure_geo_data=original

    print("geodata_bootstrap_selftest: PASS")
    return 0


if __name__=="__main__":
    raise SystemExit(main())

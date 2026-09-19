#!/usr/bin/env python3
"""Finalize completed UTC BPI hours from the persistent collector database."""
from __future__ import annotations
import argparse, json, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent

def hour_floor(ms:int)->int: return (ms//3_600_000)*3_600_000

def run(cmd:list[str], root:Path)->None:
    p=subprocess.run(cmd,cwd=root)
    if p.returncode: raise SystemExit(p.returncode)

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument('--root',default=str(HERE.parents[1]))
    p.add_argument('--history-db',default='/var/lib/zzx-bpi/history.sqlite3')
    p.add_argument('--orderbook-db',default='/var/lib/zzx-bpi/orderbooks.sqlite3')
    p.add_argument('--hours-back',type=int,default=1,help='Number of completed hours to (re)finalize.')
    p.add_argument('--chunk-rows',type=int,default=50000)
    a=p.parse_args(); root=Path(a.root).resolve()
    now=int(time.time()*1000); end=hour_floor(now)
    manifests=[]
    for n in range(max(1,a.hours_back),0,-1):
        start=end-n*3_600_000; stop=start+3_600_000
        cmd=[sys.executable,str(HERE/'bpi_hourly_shard.py'),'--root',str(root),'--start',str(start),'--end',str(stop),'--chunk-rows',str(a.chunk_rows),'--db',str(Path(a.history_db).resolve()),'--orderbook-db',str(Path(a.orderbook_db).resolve())]
        run(cmd,root)
        dt=datetime.fromtimestamp(start/1000,timezone.utc)
        manifests.append((Path('bitcoin/bpi/archive/hourly')/dt.strftime('%Y/%m/%d/%H')/'manifest.json').as_posix())
    run([sys.executable,str(HERE/'update_latest.py')],root)
    run([sys.executable,str(HERE/'bpi_hourly_validate.py'),'--root',str(root),'--allow-empty-current'],root)
    print(json.dumps({'schema':'zzx-bpi-completed-hour-finalizer-v1','manifests':manifests}))
    return 0
if __name__=='__main__': raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, time
from datetime import datetime
from pathlib import Path

def next_time(a, now=None):
    now = now or datetime.now()
    typ = a.get("type","once")
    if not a.get("enabled", True): return None
    if typ == "once":
        try:
            d=datetime.fromisoformat(a["when"])
            return d if d > now else None
        except Exception: return None
    hh,mm=map(int,a.get("time","07:00").split(":"))
    for i in range(8):
        d=now.replace(hour=hh,minute=mm,second=0,microsecond=0)
        from datetime import timedelta
        d += timedelta(days=i)
        if d <= now: continue
        if typ=="daily" or d.weekday() in [((int(x)+6)%7) for x in a.get("days",[])]:
            return d
    return None

def launch_vlc(a, vlc):
    media=a.get("media")
    if not media: return
    cmd=[vlc,"--play-and-exit",f'--volume={int(a.get("volume",100)*256/100)}']
    fade=int(a.get("fadeSeconds",0) or 0)
    if fade: cmd += ["--volume-step=8"]
    cmd.append(media)
    subprocess.Popen(cmd)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--vlc",default="vlc")
    ap.add_argument("--poll",type=float,default=.5)
    args=ap.parse_args()
    cfg=json.loads(Path(args.config).read_text(encoding="utf-8"))
    alarms=cfg.get("alarms",[])
    fired=set()
    while True:
        now=datetime.now()
        for a in alarms:
            n=next_time(a,now)
            if n and 0 <= (n-now).total_seconds() <= args.poll+0.5:
                key=(a.get("id"),n.isoformat())
                if key not in fired:
                    launch_vlc(a,args.vlc)
                    fired.add(key)
        time.sleep(max(.1,args.poll))
if __name__=="__main__": main()

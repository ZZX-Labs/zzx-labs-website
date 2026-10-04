#!/usr/bin/env python3
"""ZZX-KLD read-only defensive process/startup inventory.

No key events are captured or stored.
"""
from __future__ import annotations
import argparse, hashlib, json, os, platform
from pathlib import Path
import psutil

def proc_inventory():
    rows=[]
    for p in psutil.process_iter(["pid","name","exe","username","create_time"]):
        try: rows.append(p.info)
        except (psutil.NoSuchProcess,psutil.AccessDenied): pass
    return rows

def startup_paths():
    sys=platform.system().lower()
    paths=[]
    if sys=="windows":
        app=os.environ.get("APPDATA")
        if app: paths.append(Path(app)/"Microsoft/Windows/Start Menu/Programs/Startup")
    elif sys=="linux":
        paths.extend([Path.home()/".config/autostart",Path("/etc/xdg/autostart")])
    elif sys=="darwin":
        paths.extend([Path.home()/"Library/LaunchAgents",Path("/Library/LaunchAgents")])
    return [str(p) for p in paths if p.exists()]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",default="zzxkld-inventory.json")
    a=ap.parse_args()
    report={"schema":"zzx.kld.inventory.v1","defensive_only":True,"keystroke_capture":False,"system":platform.platform(),"processes":proc_inventory(),"startup_locations":startup_paths()}
    Path(a.out).write_text(json.dumps(report,indent=2,default=str),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

CHILDREN=[]

def stop(_signum=None,_frame=None):
    for child in CHILDREN:
        try:
            child.terminate()
        except Exception:
            pass

def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--proxy",default=os.environ.get("ZZX_BPI_PROXY"))
    args=parser.parse_args()

    signal.signal(signal.SIGINT,stop)
    signal.signal(signal.SIGTERM,stop)

    here=Path(__file__).resolve().parent
    common=["--root",str(Path(args.root).resolve())]
    if args.proxy:
        common+=["--proxy",args.proxy]

    CHILDREN.append(subprocess.Popen([sys.executable,str(here/"collector.py"),*common]))
    CHILDREN.append(subprocess.Popen([sys.executable,str(here/"reference_updater.py"),*common]))
    CHILDREN.append(subprocess.Popen([sys.executable,str(here/"history_api.py")]))

    try:
        while CHILDREN:
            for child in list(CHILDREN):
                code=child.poll()
                if code is not None:
                    CHILDREN.remove(child)
                    if code!=0:
                        stop()
                        return code
            time.sleep(.5)
    finally:
        stop()

    return 0

if __name__=="__main__":
    raise SystemExit(main())

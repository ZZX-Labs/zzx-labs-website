#!/usr/bin/env python3
"""Minimal native audio capture scaffold for ZZX-OSC."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
import sounddevice as sd

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--seconds",type=float,default=3.0)
    ap.add_argument("--rate",type=int,default=48000)
    ap.add_argument("--channels",type=int,default=1)
    ap.add_argument("--out",default="zzxosc-capture.npz")
    a=ap.parse_args()
    frames=int(a.seconds*a.rate)
    data=sd.rec(frames,samplerate=a.rate,channels=a.channels,dtype="float32")
    sd.wait()
    np.savez_compressed(a.out,samples=data,sample_rate=a.rate)
    print(json.dumps({"out":a.out,"frames":len(data),"sample_rate":a.rate,"channels":a.channels}))
if __name__=="__main__":main()

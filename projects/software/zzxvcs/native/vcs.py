#!/usr/bin/env python3
from __future__ import annotations
import argparse,numpy as np,sounddevice as sd
from scipy.signal import butter,lfilter
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--rate",type=int,default=48000);ap.add_argument("--gain",type=float,default=1.0);ap.add_argument("--low",type=float,default=180.0);ap.add_argument("--high",type=float,default=5000.0);a=ap.parse_args()
    b,aa=butter(2,[a.low/(a.rate/2),a.high/(a.rate/2)],btype="band")
    zi=np.zeros(max(len(aa),len(b))-1,dtype=np.float32)
    def cb(indata,outdata,frames,time,status):
        nonlocal zi
        x=indata[:,0];y,zi=lfilter(b,aa,x,zi=zi);outdata[:,0]=np.clip(y*a.gain,-1,1)
    with sd.Stream(channels=1,samplerate=a.rate,dtype="float32",callback=cb):
        input("ZZX-VCS generic live filter running. Press Enter to stop.\n")
if __name__=="__main__":main()

#!/usr/bin/env python3
"""Experimental ZZX-MSP encoder.

This is not BIP39 and must not be treated as wallet-compatible without a finalized,
reviewed specification and fixed canonical wordlist.
"""
from __future__ import annotations
import argparse, hashlib, json, secrets
from pathlib import Path

def load_words(path):
    words=[x.strip() for x in Path(path).read_text(encoding="utf-8").splitlines() if x.strip()]
    if len(words)<256 or len(set(words))!=len(words):
        raise SystemExit("wordlist must contain >=256 unique lines")
    return words

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("wordlist")
    ap.add_argument("--words",type=int,default=16)
    ap.add_argument("--out",default="zzxmsp-experimental.json")
    a=ap.parse_args()
    wl=load_words(a.wordlist)
    n=max(8,min(32,a.words))
    raw=secrets.token_bytes(n*2)
    ids=[int.from_bytes(raw[i:i+2],"big")%len(wl) for i in range(0,len(raw),2)]
    obj={"schema":"zzx.msp.experimental.v1","entropy_hex":raw.hex(),"indices":ids,"phrase":[wl[i] for i in ids],"checksum32":hashlib.sha256(raw).hexdigest()[:8],"bip39_compatible":False,"production_wallet_compatible":False}
    Path(a.out).write_text(json.dumps(obj,indent=2),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()

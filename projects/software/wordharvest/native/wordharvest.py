#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re
from collections import Counter
from pathlib import Path

def norm(tok,lower=True,alpha=True):
    tok=tok.strip()
    if lower: tok=tok.lower()
    tok=re.sub(r"^\W+|\W+$","",tok,flags=re.UNICODE)
    if alpha: tok="".join(ch for ch in tok if ch.isalpha())
    return tok

def h(seed,word):
    return hashlib.sha256((seed+"\0"+word).encode("utf-8")).digest()

def dice_code(i):
    out=[]
    for _ in range(5):
        out.append(str(i%6+1));i//=6
    return "".join(reversed(out))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("inputs",nargs="+")
    ap.add_argument("--min-len",type=int,default=3)
    ap.add_argument("--max-len",type=int,default=24)
    ap.add_argument("--seed",default="ZZX-WordHarvest-1")
    ap.add_argument("--out",default="wordharvest-out")
    a=ap.parse_args()
    text=" ".join(Path(p).read_text(encoding="utf-8",errors="ignore") for p in a.inputs)
    words=[]
    for raw in text.split(" "):
        w=norm(raw)
        if a.min_len<=len(w)<=a.max_len: words.append(w)
    counts=Counter(words)
    uniq=sorted(counts,key=lambda w:(h(a.seed,w),w))
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    z108=uniq[:108000]
    d=sorted(z108,key=lambda w:(h(a.seed+"-7776",w),w))[:7776]
    (out/"ZZX-108K.txt").write_text("\n".join(z108)+"\n",encoding="utf-8")
    (out/"ZZX-7776-diceware.txt").write_text("\n".join(f"{dice_code(i)} {w}" for i,w in enumerate(d))+"\n",encoding="utf-8")
    (out/"audit.json").write_text(json.dumps({"tokens":len(words),"unique":len(uniq),"zzx108k":len(z108),"diceware":len(d),"seed":a.seed},indent=2),encoding="utf-8")
if __name__=="__main__": main()

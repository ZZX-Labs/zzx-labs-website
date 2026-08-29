#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path

def whisper_transcribe(path,model_name,language):
    import whisper
    model=whisper.load_model(model_name)
    r=model.transcribe(str(path),language=None if language=="auto" else language)
    return [{"start":s["start"],"end":s["end"],"text":s["text"].strip(),"speaker":"unknown"} for s in r.get("segments",[])]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("media");ap.add_argument("--engine",choices=["whisper"],default="whisper")
    ap.add_argument("--model",default="base");ap.add_argument("--language",default="auto");ap.add_argument("--out",default="transcript.json")
    a=ap.parse_args()
    seg=whisper_transcribe(Path(a.media),a.model,a.language)
    Path(a.out).write_text(json.dumps({"schema":"zzx.stt.transcript.v1","engine":a.engine,"segments":seg},indent=2),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()

#!/usr/bin/env python3
from __future__ import annotations
import json, os
from pathlib import Path
from flask import Flask, jsonify

CONFIG=Path(os.environ.get("ZZXCORE_CONFIG","stack.json"))
app=Flask(__name__)

def load():
    if not CONFIG.exists():
        return {"schema":"zzx.core.stack.v1","docker":False,"containers":False,"services":[]}
    data=json.loads(CONFIG.read_text(encoding="utf-8"))
    # Defensive contract: configuration is data only; no remote shell/command fields are executed.
    data["docker"]=False
    data["containers"]=False
    return data

@app.get("/api/status")
def status():
    cfg=load()
    return jsonify({"ok":True,"service":"ZZX-Core","services":len(cfg.get("services",[])),"docker":False})

@app.get("/api/services")
def services():
    return jsonify(load().get("services",[]))

@app.get("/api/services/<service_id>")
def service(service_id):
    for s in load().get("services",[]):
        if s.get("id")==service_id:
            return jsonify(s)
    return jsonify({"error":"not found"}),404

if __name__=="__main__":
    app.run(host="127.0.0.1",port=int(os.environ.get("ZZXCORE_PORT","8787")),debug=False)

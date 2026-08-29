#!/usr/bin/env python3
from __future__ import annotations
from flask import Flask, jsonify
from sqlalchemy import create_engine, text
app=Flask(__name__)
db=create_engine("sqlite:///zzxcex-research.sqlite",future=True)
with db.begin() as c:
    c.execute(text("create table if not exists runs(id integer primary key, created text default current_timestamp, label text, payload text)"))
@app.get("/api/health")
def health(): return jsonify(ok=True,mode="simulation-only",live_trading=False,custody=False)
@app.get("/api/runs")
def runs():
    with db.connect() as c:
        return jsonify([dict(r._mapping) for r in c.execute(text("select id,created,label from runs order by id desc limit 100"))])
if __name__=="__main__": app.run("127.0.0.1",8761,debug=False)

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from history_store import HistoryStore

def json_bytes(obj):
    return json.dumps(obj,separators=(",",":"),allow_nan=False).encode("utf-8")

class Handler(BaseHTTPRequestHandler):
    store: HistoryStore

    def do_GET(self):
        u=urlparse(self.path)
        q=parse_qs(u.query)

        try:
            if u.path in ("/health","/bitcoin/bpi/history/health"):
                return self.send_json({"ok":True,"time":int(time.time()*1000)})

            if u.path in ("/sources","/bitcoin/bpi/history/sources"):
                return self.send_json({"sources":self.store.sources()})

            if u.path in ("/bounds","/bitcoin/bpi/history/bounds"):
                source=(q.get("source") or [None])[0]
                return self.send_json(self.store.bounds(source))

            if u.path in ("/series","/bitcoin/bpi/history/series"):
                source=(q.get("source") or ["global-bpi"])[0]
                market=(q.get("market") or [None])[0]
                resolution=(q.get("resolution") or ["auto"])[0]
                start=(q.get("from") or [None])[0]
                end=(q.get("to") or [None])[0]
                max_points=(q.get("max_points") or ["5000"])[0]
                result=self.store.query(
                    source=source,
                    market=market,
                    start_ms=int(start) if start else None,
                    end_ms=int(end) if end else None,
                    resolution=resolution,
                    max_points=int(max_points),
                )
                return self.send_json(result)

            self.send_error(404)
        except Exception as exc:
            self.send_json({"error":str(exc)},status=400)

    def send_json(self,obj,status=200):
        body=json_bytes(obj)
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-store")
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self,fmt,*args):
        pass

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",default=str(Path(__file__).resolve().parents[2]/"bitcoin/bpi/history.sqlite3"))
    p.add_argument("--host",default="127.0.0.1")
    p.add_argument("--port",type=int,default=8765)
    args=p.parse_args()

    Handler.store=HistoryStore(Path(args.db))
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__=="__main__":
    raise SystemExit(main())

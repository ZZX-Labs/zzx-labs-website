#!/usr/bin/env python3
"""Read-only JSON and cleared-media service for locally mirrored private yearly archives."""
from __future__ import annotations
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import threading
from urllib.parse import unquote, urlsplit
import year_archive as archive

LOCK = threading.RLock()
CLEARED = {'public domain','public-domain','redistribution cleared'}


def approved_media(root):
    approved=set()
    def visit(value):
        if isinstance(value,dict):
            path=value.get('path','')
            if isinstance(path,str) and path.startswith('media/') and str(value.get('rights','')).strip().lower() in CLEARED:
                try: approved.add(archive.safe_relative(path).as_posix())
                except ValueError: pass
            for child in value.values():visit(child)
        elif isinstance(value,list):
            for child in value:visit(child)
    for path in (root/'worldfactbook/api').rglob('*.json'):
        if path.stat().st_size < 20*1024*1024:visit(archive.read(path))
    return approved


class Store:
    def __init__(self, archives, indexes):
        self.archives=archives.resolve();self.indexes=indexes.resolve();self.media={};self.verified_years=set()
        self.refresh()
    def refresh(self):
        media={};errors={}
        for root in self.archives.iterdir():
            if not root.is_dir() or not root.name.isdigit() or not (root/'archive-manifest.json').exists():continue
            year=int(root.name)
            try:
                archive.verify(root,year);media[year]=approved_media(root)
            except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
                errors[year]=type(error).__name__
        self.media=media;self.verified_years=set(media);self.errors=errors
    def resolve(self,url):
        raw=urlsplit(url).path
        value=unquote(raw)
        if '%' in value or '\\' in value or '\x00' in value:return None
        prefix='/worldfactbook-data/'
        if not value.startswith(prefix):return None
        value=value[len(prefix):]
        index=re.fullmatch(r'indexes/worldfactbook/((?:api|boundaries)/[A-Za-z0-9_./-]+\.json)',value)
        if index:
            relative=archive.safe_relative(index[1])
            if relative.as_posix() not in {'api/'+name for name in archive.CATALOGS}|set(archive.BOUNDARY_CATALOGS)|{'api/year-archives.json','api/electricity-history.json','api/reference-index.json'}:return None
            return self.indexes/relative
        match=re.fullmatch(r'years/(\d{4})/worldfactbook/(.+)',value)
        if not match:return None
        year=archive.checked_year(match[1])
        if year not in self.verified_years:return None
        relative=archive.safe_relative(match[2]);name=relative.as_posix()
        root=self.archives/str(year)/'worldfactbook'
        allowed=(name.startswith('api/') and name.endswith('.json')) or (
            name.startswith('media/') and name in self.media.get(year,set())) or bool(
            re.fullmatch(r'boundaries/(?:water/)?editions/\d{4}/[A-Za-z0-9_./-]+\.(json|png)',name))
        if not allowed or '.git' in relative.parts:return None
        target=(root/relative).resolve()
        if not target.is_relative_to(root.resolve()) or target.is_symlink():return None
        return target


class Handler(BaseHTTPRequestHandler):
    server_version='WorldFactbookReadout/1'
    def do_HEAD(self):self.respond(False)
    def do_GET(self):self.respond(True)
    def respond(self,body):
        with LOCK:
            try:path=self.server.store.resolve(self.path)
            except (ValueError,TypeError):path=None
            if path is None or not path.is_file():self.send_error(404,'Readout unavailable');return
            if path.stat().st_size>50*1024*1024:self.send_error(413,'Readout exceeds service limit');return
            data=path.read_bytes();etag='"'+hashlib.sha256(data).hexdigest()+'"'
        self.send_response(304 if self.headers.get('If-None-Match')==etag else 200)
        self.send_header('ETag',etag);self.send_header('Cache-Control','public, max-age=60')
        self.send_header('X-Content-Type-Options','nosniff')
        if self.server.allowed_origin:
            self.send_header('Access-Control-Allow-Origin',self.server.allowed_origin);self.send_header('Vary','Origin')
        if self.headers.get('If-None-Match')!=etag:
            self.send_header('Content-Type',mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        if body and self.headers.get('If-None-Match')!=etag:self.wfile.write(data)
    def log_message(self,format,*args):
        # URLs may include user query strings. Log only response status.
        if format.startswith('"%s"') and len(args)>1:print('Readout HTTP '+str(args[1]),flush=True)


def mirror_loop(args,store,stop):
    while not stop.is_set():
        try:
            with LOCK:
                for year in args.years:
                    try:
                        root=args.archives/str(archive.checked_year(year))
                        archive.checkout(root,archive.repository(year,args.owner,args.template,args.mapping),os.environ.get('PRIVATE_TOKEN',''))
                        archive.verify(root,year)
                    except Exception as error:
                        print(f'Archive {year} mirror unavailable: {type(error).__name__}',flush=True)
                store.refresh()
                archive.catalogs(args.archives,args.indexes,years=store.verified_years)
                from publish_archive_indexes import merge_power
                merge_power(args.archives,args.indexes.parent,years=store.verified_years)
        except Exception as error:print('Archive mirror refresh failed: '+type(error).__name__,flush=True)
        stop.wait(max(60,args.interval))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archives',type=Path,required=True);p.add_argument('--indexes',type=Path,required=True)
    p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=8784)
    p.add_argument('--allowed-origin',default='');p.add_argument('--mirror',action='store_true')
    p.add_argument('--owner');p.add_argument('--template');p.add_argument('--mapping',type=Path)
    p.add_argument('--years',nargs='+',type=int,default=list(range(1962,2028)));p.add_argument('--interval',type=int,default=900)
    args=p.parse_args();args.archives.mkdir(parents=True,exist_ok=True);args.indexes.mkdir(parents=True,exist_ok=True)
    if args.allowed_origin and not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::\d+)?',args.allowed_origin):p.error('CORS origin must be one HTTPS origin')
    if args.mirror and (not args.owner or not os.environ.get('PRIVATE_TOKEN')):p.error('Mirror requires owner and server-only PRIVATE_TOKEN')
    store=Store(args.archives,args.indexes);server=ThreadingHTTPServer((args.host,args.port),Handler)
    server.store=store;server.allowed_origin=args.allowed_origin;stop=threading.Event()
    if args.mirror:threading.Thread(target=mirror_loop,args=(args,store,stop),daemon=True).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:stop.set();server.server_close()

if __name__=='__main__':main()

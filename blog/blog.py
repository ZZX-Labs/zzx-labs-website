"""Optional replacement for blog/blog.py; register blog_api Blueprint in Flask.
GET serves verified catalog. POST is explicitly disabled until a random secret
is configured; creates a plaintext draft, never auto-publishes HTML.
"""
from __future__ import annotations
import os, json, hmac, re
from pathlib import Path
from datetime import datetime, timezone
from flask import Blueprint, current_app, jsonify, request

blog_api=Blueprint('blog_api',__name__)
MAX_POST_BYTES=128*1024

def root(): return Path(current_app.config.get('ZZX_SITE_ROOT') or current_app.root_path)

def posts():
    path=root()/'blog/catalog.json'
    try: return json.loads(path.read_text(encoding='utf-8')).get('posts',[])
    except (OSError,ValueError): return []

def ok_auth():
    token=os.environ.get('ZZX_BLOG_WRITE_TOKEN','')
    header=request.headers.get('X-ZZX-Token','')
    return len(token)>=32 and hmac.compare_digest(header,token)

@blog_api.get('/blog/api/health')
def health():return jsonify({'ok':True,'date':datetime.now(timezone.utc).isoformat()})

@blog_api.get('/blog/api/posts')
def get_posts():
    include_drafts=request.args.get('drafts')=='1' and ok_auth()
    entries=posts()
    return jsonify({'posts':entries if include_drafts else [p for p in entries if p.get('published') is True]})

@blog_api.get('/blog/api/post/<path:slug>')
def get_post(slug):
    tail='/'+slug.strip('/')+'/'
    for p in posts():
        if p.get('published') and str(p.get('url','')).endswith(tail): return jsonify(p)
    return jsonify({'error':'Not found'}),404

@blog_api.post('/blog/api/post')
def create_draft():
    if not ok_auth():return jsonify({'error':'Publishing API disabled or unauthorized'}),403
    if request.content_length is not None and request.content_length>MAX_POST_BYTES:
        return jsonify({'error':'Request too large'}),413
    if len(request.get_data(cache=True))>MAX_POST_BYTES:
        return jsonify({'error':'Request too large'}),413
    data=request.get_json(silent=True)
    if not isinstance(data,dict):return jsonify({'error':'Expected JSON object'}),400
    title=str(data.get('title','')).strip()[:180]
    content=data.get('content')
    if not title or not isinstance(content,str) or not content.strip() or len(content)>100000:
        return jsonify({'error':'A nonempty title and draft body are required'}),400
    slug=re.sub(r'[^a-z0-9-]+','-',title.lower().replace('&','and').replace(' ','-')).strip('-')
    folder=root()/'blog/blog-posts/.tank'
    folder.mkdir(parents=True,exist_ok=True)
    target=folder/f'{slug}.txt'
    if target.exists():return jsonify({'error':'Draft already exists'}),409
    # Exclusive create blocks accidental overwrite. Content is plain text,
    # explicitly not trusted HTML; reviewed publication uses a separate tool.
    with target.open('x',encoding='utf-8') as fp:fp.write(content)
    return jsonify({'draft':slug,'status':'pending_review'}),201

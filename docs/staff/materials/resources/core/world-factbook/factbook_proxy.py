# server/factbook_proxy.py
import os, re, json
from urllib.parse import urlparse, urljoin
import requests
from flask import Flask, request, abort, Response
from lxml import html, etree
import bleach

app = Flask(__name__)
TIMEOUT = (5, 20)
WHITELIST = {"cia.gov", "www.cia.gov"}

# bleach policy
ALLOWED_TAGS = bleach.sanitizer.ALLOWED_TAGS.union({
    'p','div','span','section','article','header','footer','nav',
    'h1','h2','h3','h4','h5','h6','ul','ol','li','table','thead','tbody','tr','th','td',
    'strong','em','b','i','u','small','sup','sub','blockquote','pre','code','hr','br','img','a'
})
ALLOWED_ATTRS = {
    **bleach.sanitizer.ALLOWED_ATTRIBUTES,
    'a': ['href','title'],
    'img': ['src','alt','title','width','height'],
    '*': ['class']
}

def is_whitelisted(u:str)->bool:
    try:
        host = urlparse(u).hostname or ""
        host = host.lower()
        return host == "www.cia.gov" or host.endswith(".cia.gov") or host == "cia.gov"
    except:
        return False

def absolutize(doc, base):
    for el in doc.xpath('//*[@href]'):
        el.set('href', urljoin(base, el.get('href')))
    for el in doc.xpath('//*[@src]'):
        el.set('src', urljoin(base, el.get('src')))

def strip_unsafe(doc):
    # remove script-like elements
    etree.strip_elements(doc, 'script','iframe','object','embed','form','link','noscript', with_tail=False)
    # remove inline event handlers
    for el in doc.xpath('//*'):
        for a in list(el.attrib):
            if a.lower().startswith('on'):
                del el.attrib[a]
    # allow only body subtree for clarity
    body = doc.find('body')
    return body if body is not None else doc

@app.after_request
def cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    return resp

@app.route("/factbook-proxy/render")
def render():
    url = request.args.get("url","").strip()
    if not url or not is_whitelisted(url): abort(400, "Bad or non-whitelisted url")
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent":"ZZX-Factbook/1.0"}, allow_redirects=True)
        r.raise_for_status()
        doc = html.fromstring(r.content)
        absolutize(doc, r.url)
        safe_root = strip_unsafe(doc)
        raw_html = html.tostring(safe_root, encoding="unicode", method="html")
        clean = bleach.clean(raw_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
        # Optional: rewrite images to proxy (uncomment if you want to proxy images)
        # clean = re.sub(r'(<img[^>]+src=")([^"]+)(")',
        #                lambda m: f'{m.group(1)}/factbook-proxy/img?src={bleach.clean(m.group(2))}{m.group(3)}',
        #                clean)
        return Response(clean, status=200, mimetype="text/html; charset=utf-8")
    except Exception as e:
        abort(502, f"Upstream error: {e}")

# Optional: image passthrough
@app.route("/factbook-proxy/img")
def img():
    src = request.args.get("src","").strip()
    if not src or not is_whitelisted(src): abort(400, "Bad or non-whitelisted src")
    r = requests.get(src, timeout=TIMEOUT, headers={"User-Agent":"ZZX-Factbook/1.0"}, stream=True)
    ct = r.headers.get('Content-Type','image/jpeg')
    return Response(r.content, status=r.status_code, mimetype=ct)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8089)

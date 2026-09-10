from pathlib import Path
import re, sys
root=Path(__file__).resolve().parents[2]
pairs=[
("node-health","data-node-health-"),
("node-latency","data-node-latency-"),
("node-network-mix","data-node-network-mix-"),
("nodes-by-asn","data-nba-"),
]
for name,prefix in pairs:
    html=(root/"__partials/widgets"/name/"widget.html").read_text(encoding="utf-8")
    js=(root/"__partials/widgets"/name/"widget.js").read_text(encoding="utf-8")
    attrs=set(re.findall(r'(data-[a-z0-9-]+)',html))
    refs=set(re.findall(r'\[(data-[a-z0-9-]+)\]',js))
    missing=sorted(a for a in refs if a not in attrs)
    if missing:
        raise SystemExit(f"{name}: JS selectors absent from HTML: {missing}")
print("widget_dom_contract_selftest: PASS")

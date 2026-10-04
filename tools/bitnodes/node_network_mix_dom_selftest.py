from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
html=(root/"__partials/widgets/node-network-mix/widget.html").read_text(encoding="utf-8")
js=(root/"__partials/widgets/node-network-mix/widget.js").read_text(encoding="utf-8")
attrs=set(re.findall(r'(data-[a-z0-9-]+)',html))
refs=set(re.findall(r'\[(data-[a-z0-9-]+)\]',js))
missing=sorted(refs-attrs)
if missing:
    raise SystemExit(f"node-network-mix missing selectors: {missing}")
print("node_network_mix_dom_selftest: PASS")

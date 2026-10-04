from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
html=(root/"__partials/widgets/node-health/widget.html").read_text(encoding="utf-8")
js=(root/"__partials/widgets/node-health/widget.js").read_text(encoding="utf-8")
attrs=set(re.findall(r'(data-[a-z0-9-]+)',html))
refs=set(re.findall(r'\[(data-[a-z0-9-]+)\]',js))
missing=sorted(refs-attrs)
if missing:
    raise SystemExit(f"node-health missing selectors: {missing}")
print("node_health_dom_selftest: PASS")

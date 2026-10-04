from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
html=(root/"__partials/widgets/nodes/widget.html").read_text(encoding="utf-8")
js=(root/"__partials/widgets/nodes/widget.js").read_text(encoding="utf-8")
attrs=set(re.findall(r'(data-[a-z0-9-]+)',html))
refs=set(re.findall(r'\[(data-[a-z0-9-]+)\]',js))
missing=sorted(refs-attrs)
if missing:
    raise SystemExit(f"nodes missing selectors: {missing}")
print("nodes_dom_selftest: PASS")

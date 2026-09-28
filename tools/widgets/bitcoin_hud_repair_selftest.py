#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
R=Path(__file__).resolve().parents[2]
def req(ok,msg):
    if not ok: raise AssertionError(msg)
html=(R/'__partials/bitcoin-ticker-widget.html').read_text()
slots=re.findall(r'data-widget="([^"]+)"',html)
manifest=json.loads((R/'__partials/widgets/manifest.json').read_text())['widgets']
manifest_ids={x['id'] for x in manifest}
integ=json.loads((R/'__partials/widgets/bitcoin-ticker/widget-integrations.json').read_text())['widgets']
planned={x['id'] for x in integ if x.get('available') is False}
implemented={p.parent.name for p in (R/'__partials/widgets').glob('*/widget.js')}
req('high-low-24h' in implemented,'high-low implementation missing')
hl=(R/'__partials/widgets/high-low-24h/widget.js').read_text()
req('ID="high-low-24h"' in hl,'high-low registers wrong ID')
req('ZZXHighLow24HModel' in hl and 'ZZXHighLow24HChart' in hl,'high-low dedicated model/chart not wired')
for x in ('mempool-stats','btc-tainted','bitrng-visualizer'):
    req(x in planned,f'{x} must be explicitly planned until implemented')
req('savePreset' in (R/'__partials/widgets/bitcoin-ticker/js/widget-modules.js').read_text(),'preset support missing')
refs=json.loads((R/'bitcoin/bpi/api/reference_prices.json').read_text())
cat=json.loads((R/'__partials/widgets/bitcoin-ticker/reference-catalog.json').read_text())
req(len(refs['prices'])==len(cat['items']),'reference placeholder coverage mismatch')
req(refs['reference_year']==2025,'reference standardization year must be 2025')
print(f'bitcoin_hud_repair_selftest.py: PASS ({len(slots)} slots; {len(refs["prices"])} reference items)')

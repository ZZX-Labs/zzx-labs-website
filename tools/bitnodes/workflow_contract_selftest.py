#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

TOOLS=Path(__file__).resolve().parent
ROOT=TOOLS.parents[1]
WF=ROOT/'.github'/'workflows'

def require(cond: bool, msg: str) -> None:
    if not cond: raise SystemExit(msg)

def main()->int:
    wrapper=(WF/'zzx-bitnodes-crawler.yml').read_text(encoding='utf-8')
    global_wf=(WF/'bitnodes-global-crawler.yml').read_text(encoding='utf-8')
    service=(ROOT/'server/systemd/zzx-bitnodes-crawler.service').read_text(encoding='utf-8')
    timer=(ROOT/'server/systemd/zzx-bitnodes-snapshot.timer').read_text(encoding='utf-8')
    cli=(TOOLS/'bitnodes-cli.py').read_text(encoding='utf-8')
    gui=(TOOLS/'bitnodes-gui.py').read_text(encoding='utf-8')
    config=json.loads((TOOLS/'config.example.json').read_text(encoding='utf-8'))

    require('- cron: "*/15 * * * *"' in wrapper, 'continuous 15-minute redundant GitHub schedule missing')
    gc=wrapper.split('  global_crawler:',1)[1].split('\n  map_host:',1)[0]
    require('snapshot_mirror' not in gc, 'native global crawler must not depend on external snapshot mirror')
    require('needs:\n      - plan' in gc, 'global crawler planning dependency missing')
    require('Native node acquisition/history completed' in wrapper, 'wrapper acquisition status contract missing')

    order=['Mirror btcnodes.io as optional compatibility seed','Run ZZX Bitnodes crawler window','Backup raw history and history MariaDB shards to private repo','Publish raw native latest independently of enrichment','Resolve geodata cache period']
    positions=[global_wf.index(x) for x in order]
    require(positions==sorted(positions), 'acquisition must execute before optional geodata/presentation work')
    for flag in ('--history-output-dir','--history-full-snapshot-interval-seconds 900','--recrawl-reachable-seconds 300','--recrawl-unreachable-seconds 900','--disable-geoip'):
        require(flag in global_wf, f'global crawler missing {flag}')
    require('mode=native-only' in global_wf, 'external-seed-free native fallback missing')
    require('zzx-bitnodes-history-mariadb-v3' in global_wf, 'idempotent history MariaDB v3 gate missing')
    require('--monotonic-json-path "${BITNODES_API}/zzxbitnodes/latest.json"' in global_wf, 'final public publication is not monotonic')
    require('Private latest-state already newer/equal' in global_wf, 'private restore-point monotonic guard missing')
    require('Raw public latest is already newer/equal' in global_wf, 'raw public monotonic guard missing')
    require('Preserve history as workflow artifact when private backup is unavailable' in global_wf, 'history artifact fallback missing')
    require('Maps are a' in wrapper and 'derived presentation layer' in wrapper, 'map failures are not documented as noncritical')

    require('ExecStart=/usr/bin/python3 /srv/zzx-labs/tools/bitnodes/bitnodes.py daemon run' in service, 'systemd daemon command is not runnable')
    require('Restart=always' in service and 'StartLimitIntervalSec=0' in service, 'systemd restart-forever contract missing')
    require('RuntimeDirectory=zzx-bitnodes' in service and 'StateDirectory=zzx-bitnodes' in service and 'LogsDirectory=zzx-bitnodes' in service, 'systemd managed runtime/state/log dirs missing')
    require('OnUnitActiveSec=15min' in timer, 'derived snapshot timer cadence missing')

    stale=('zzx_crawl.py','TOOLS_DIR / "maps.py"','TOOLS_DIR / "asn.py"','TOOLS_DIR / "isp.py"','TOOLS_DIR / "aptattribution.py"')
    for token in stale:
        require(token not in cli and token not in gui, f'stale flat-path control reference remains: {token}')
    for rel in ('zzxbitnodes.py','map/maps.py','network/asn.py','geoclass/isp.py','threat-detection/aptattribution.py'):
        require((TOOLS/rel).is_file(), f'required nested tool missing: {rel}')

    crawler=config.get('crawler') or {}; export=config.get('export') or {}
    require(int(crawler.get('recrawl_reachable_seconds') or 0)==300, 'resident reachable recrawl policy mismatch')
    require(int(crawler.get('recrawl_unreachable_seconds') or 0)==900, 'resident unreachable recrawl policy mismatch')
    require(int(crawler.get('history_full_snapshot_interval_seconds') or 0)==900, 'resident full-history baseline interval mismatch')
    require(str(export.get('history_output_dir') or '').startswith('/var/lib/zzx-bitnodes/'), 'resident private history is not on durable state storage')
    print('workflow_contract_selftest: PASS'); return 0

if __name__=='__main__': raise SystemExit(main())

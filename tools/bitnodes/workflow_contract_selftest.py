#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

TOOLS=Path(__file__).resolve().parent
ROOT=TOOLS.parents[1]
WF=ROOT/'.github'/'workflows'


def require(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(msg)


def main()->int:
    wrapper=(WF/'zzx-bitnodes-crawler.yml').read_text(encoding='utf-8')
    latest_wf=(WF/'bitnodes-latest.yml').read_text(encoding='utf-8')
    original_wf=(WF/'bitnodes-original-crawler.yml').read_text(encoding='utf-8')
    maphost_wf=(WF/'bitnodes-maphost.yml').read_text(encoding='utf-8')
    collector=(TOOLS/'collector.py').read_text(encoding='utf-8')
    canonical=(TOOLS/'map'/'prepare_canonical.py').read_text(encoding='utf-8')
    service=(ROOT/'server/systemd/zzx-bitnodes-crawler.service').read_text(encoding='utf-8')
    timer=(ROOT/'server/systemd/zzx-bitnodes-snapshot.timer').read_text(encoding='utf-8')
    cli=(TOOLS/'bitnodes-cli.py').read_text(encoding='utf-8')
    gui=(TOOLS/'bitnodes-gui.py').read_text(encoding='utf-8')
    config=json.loads((TOOLS/'config.example.json').read_text(encoding='utf-8'))
    sources=json.loads((ROOT/'bitcoin/bitnodes/api/sources.json').read_text(encoding='utf-8'))

    require('- cron: "*/5 * * * *"' in wrapper, 'continuous five-minute GitHub snapshot schedule missing')
    require('- cron: "2,17,32,47 * * * *"' in wrapper, 'decoupled 15-minute map schedule missing')
    require('uses: ./.github/workflows/bitnodes-latest.yml' in wrapper, 'primary snapshot workflow missing')
    require('uses: ./.github/workflows/bitnodes-original-crawler.yml' in wrapper, 'original fallback workflow missing')
    require("needs.snapshot_mirror.result != 'success'" in wrapper, 'original fallback is not gated by primary failure/deep request')
    require("needs.plan.outputs.build_maps == 'true'" in wrapper, 'map build is not decoupled from fast snapshot path')
    require('Fast snapshots are independent from map generation and private backup.' in wrapper, 'wrapper status does not describe independent publication tiers')

    require('api/zzxbitnodes/latest.json' in collector, 'btcnodes collector does not own zzxbitnodes public latest')
    require('upstream_mirror' in collector and 'btcnodes.io' in collector, 'zzxbitnodes provenance is missing')
    require('originalbitnodes' in collector and 'never written here' in collector, 'originalbitnodes namespace ownership guard missing')
    mirrors=sources.get('mirrors') or []
    require(any(isinstance(x,dict) and x.get('id')=='bitnodes.io' for x in mirrors), 'legacy bitnodes.io snapshot API fallback missing')

    for token in (
        'Build complete zzxbitnodes public API from btcnodes.io snapshot',
        '--output bitcoin/bitnodes/api/zzxbitnodes',
        '--source zzxbitnodes',
        '--path bitcoin/bitnodes/api/zzxbitnodes',
        '--path bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json',
    ):
        require(token in latest_wf, f'primary snapshot workflow missing contract: {token}')

    for token in (
        'tools/bitnodes/originalbitnodes.py',
        '--original-mode classic',
        '--output bitcoin/bitnodes/api/originalbitnodes',
        '--source originalbitnodes',
        '--allowed-prefix bitcoin/bitnodes/api/originalbitnodes',
    ):
        require(token in original_wf, f'original crawler workflow missing contract: {token}')

    zzx_pos=canonical.index("return [('zzxbitnodes',zzx)]")
    btc_pos=canonical.index("return [('zzxbitnodes-btcnodes-alias',btc)]")
    original_pos=canonical.index("return [('originalbitnodes-fallback',original)]")
    require(zzx_pos < btc_pos < original_pos, 'Map Host source priority must be zzxbitnodes -> raw btcnodes alias -> originalbitnodes')
    require('- btcnodes.io Snapshot Mirror' in maphost_wf, 'standalone snapshot refresh does not trigger Map Host')
    require('frontend_contract_selftest.py' in maphost_wf, 'Map Host workflow does not validate frontend contracts')

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
    daemon=(TOOLS/'bitnodesd.py').read_text(encoding='utf-8')
    require(str(crawler.get('mode') or '') == 'btcnodes_mirror', 'resident daemon does not default to btcnodes.io-backed zzxbitnodes')
    require('SNAPSHOT_COLLECTOR = TOOLS_DIR / "collector.py"' in daemon, 'resident daemon lacks btcnodes snapshot collector')
    require('return SNAPSHOT_COLLECTOR if SNAPSHOT_COLLECTOR.exists() else CRAWLER' in daemon, 'resident daemon can still default to native zzx crawler')
    require(int(crawler.get('crawl_interval_seconds') or 0)==5, 'resident mirror poll policy mismatch')
    require(str(export.get('history_output_dir') or '').startswith('/var/lib/zzx-bitnodes/'), 'resident private history is not on durable state storage')
    print('workflow_contract_selftest: PASS')
    return 0


if __name__=='__main__':
    raise SystemExit(main())

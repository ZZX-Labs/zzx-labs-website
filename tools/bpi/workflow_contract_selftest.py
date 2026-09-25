#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
WF=ROOT/'.github'/'workflows'/'zzx-bpi-crawler.yml'
RESIDENT_WF=ROOT/'.github'/'workflows'/'bpi-resident.yml'
SERVICE=ROOT/'server'/'systemd'/'zzx-bpi.service'
COLLECTOR=ROOT/'tools'/'bpi'/'collector.py'
DAEMON=ROOT/'tools'/'bpi'/'master_daemon.py'
PUBLISHER=ROOT/'tools'/'bpi'/'bpi_live_publish.py'
HEALTHCHECK=ROOT/'tools'/'bpi'/'bpi_runtime_healthcheck.py'
PROVIDERS=ROOT/'bitcoin'/'bpi'/'api'/'provider_urls.json'
CONFIG=ROOT/'tools'/'bpi'/'collector-config.json'
NGINX=ROOT/'__server'/'nginx.conf'


def require(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(msg)


def main() -> int:
    wf=WF.read_text(encoding='utf-8')
    resident=RESIDENT_WF.read_text(encoding='utf-8')
    service=SERVICE.read_text(encoding='utf-8')
    collector=COLLECTOR.read_text(encoding='utf-8')
    daemon=DAEMON.read_text(encoding='utf-8')
    publisher=PUBLISHER.read_text(encoding='utf-8')
    healthcheck=HEALTHCHECK.read_text(encoding='utf-8')
    nginx=NGINX.read_text(encoding='utf-8')
    provider_data=json.loads(PROVIDERS.read_text(encoding='utf-8'))
    cfg=json.loads(CONFIG.read_text(encoding='utf-8'))

    require('- cron: "*/5 * * * *"' in wf, 'five-minute BPI fallback schedule missing')
    require('default: "480"' in wf, 'overlapping BPI capture default missing')
    require('default: "2500"' in wf, '2.5-second GitHub fallback default missing')
    require('--cycle-ms "${BPI_POLL_CYCLE_MS}"' in wf, 'GitHub fallback cycle override missing')
    require('2500 <= value <= 5000' in wf, 'GitHub fallback 2.5-5 second guard missing')
    require('bpi_live_publish.py' in wf, 'race-safe live publisher missing from workflow')
    require('concurrency:' not in wf, 'workflow-level serialization would destroy overlap continuity')

    require('runs-on: ubuntu-24.04' in resident, 'resident workflow must use hosted Linux control plane')
    require('self-hosted' not in resident, 'resident workflow must not require a self-hosted Actions runner')
    require('ZZX_HOST:' in resident and 'ZZX_SSH_KEY:' in resident and 'StrictHostKeyChecking=yes' in resident, 'resident workflow must use hardened SSH deployment')
    require('uses: actions/' not in resident, 'resident workflow must not use Node-backed GitHub actions')
    require('systemctl enable zzx-bpi.service' in resident, 'resident workflow does not enable perpetual service')
    require('systemctl restart zzx-bpi.service' in resident, 'resident workflow does not restart deployed service')
    require('bpi_runtime_healthcheck.py' in resident, 'resident workflow does not verify live cadence')

    require('--cycle-ms' in collector and '--market-stale-after-ms' in collector, 'collector runtime overrides missing')
    require('MIN_CYCLE_MS = 2500' in collector and 'MAX_CYCLE_MS = 5000' in collector, 'collector cycle clamp missing')
    require('self.provider_due[key] = now + interval_ms / 1000.0' in collector, 'fixed-rate provider scheduling missing')
    require('ThreadPoolExecutor' in collector and 'discover_provider' in collector, 'concurrent provider discovery missing')
    require('weighted_average' in collector, 'BitAvg-compatible weighted_average publication missing')
    require('merge_history' in publisher and 'newest_payload' in publisher, 'live publication merge guards missing')
    require('Restart=always' in service and 'StartLimitIntervalSec=0' in service, 'resident BPI restart-forever contract missing')
    require('ZZX_BPI_CYCLE_MS=2500' in service, 'resident service cycle contract missing')
    require('run-bpi-master.py --root /srv/zzx-labs --cycle-ms 2500' in service, 'resident BPI service does not launch 2.5-second master daemon')
    require('ceiling = 5.0 if self.critical else 60.0' in daemon, 'critical collector restart ceiling missing')
    require('observed_max_gap_seconds' in healthcheck, 'runtime cadence observer missing')
    require('Cache-Control "no-store, no-cache, must-revalidate, max-age=0"' in nginx, 'BPI API no-store cache contract missing')

    require(int(cfg.get('exchange_cycle_ms') or 0)==2500, 'collector-config exchange_cycle_ms must be 2500')
    require(2500 <= int(cfg.get('exchange_cycle_ms')) <= 5000, 'collector-config cycle outside 2.5-5 seconds')
    require(float(cfg.get('request_timeout_seconds') or 99) <= 4.5, 'collector request timeout is too long for live cadence')
    require(int(cfg.get('max_workers') or 0) >= 46, 'collector worker pool too small for current live market fanout')

    providers=provider_data.get('providers') or {}
    active={
        str(pid): row for pid,row in providers.items()
        if isinstance(row,dict)
        and row.get('enabled_poll') is True
        and row.get('adapter')
        and row.get('price_volume_url')
    }
    require(len(active) >= 2, 'too few active exchange providers')
    bad=[]
    for pid,row in active.items():
        interval=int(row.get('poll_interval_ms') or 2500)
        if not 2500 <= interval <= 5000:
            bad.append((pid,interval))
    require(not bad, f'active providers outside 2500-5000 ms contract: {bad}')

    print(f'bpi workflow_contract_selftest: PASS active_providers={len(active)}')
    return 0


if __name__=='__main__':
    raise SystemExit(main())

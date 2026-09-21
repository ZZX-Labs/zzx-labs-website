#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
WF=ROOT/'.github'/'workflows'/'zzx-bpi-crawler.yml'
SERVICE=ROOT/'server'/'systemd'/'zzx-bpi.service'
COLLECTOR=ROOT/'tools'/'bpi'/'collector.py'
PUBLISHER=ROOT/'tools'/'bpi'/'bpi_live_publish.py'


def require(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(msg)


def main() -> int:
    wf=WF.read_text(encoding='utf-8')
    service=SERVICE.read_text(encoding='utf-8')
    collector=COLLECTOR.read_text(encoding='utf-8')
    publisher=PUBLISHER.read_text(encoding='utf-8')

    require('- cron: "*/5 * * * *"' in wf, 'five-minute BPI fallback schedule missing')
    require('default: "480"' in wf, 'overlapping BPI capture default missing')
    require('--cycle-ms "${BPI_POLL_CYCLE_MS}"' in wf, 'GitHub fallback cycle override missing')
    require('bpi_live_publish.py' in wf, 'race-safe live publisher missing from workflow')
    require('concurrency:' not in wf, 'workflow-level serialization would destroy overlap continuity')
    require('--cycle-ms' in collector and '--market-stale-after-ms' in collector, 'collector runtime overrides missing')
    require('merge_history' in publisher and 'newest_payload' in publisher, 'live publication merge guards missing')
    require('Restart=always' in service and 'StartLimitIntervalSec=0' in service, 'resident BPI restart-forever contract missing')
    require('run-bpi-master.py --root /srv/zzx-labs' in service, 'resident BPI service does not launch master daemon')
    print('bpi workflow_contract_selftest: PASS')
    return 0


if __name__=='__main__':
    raise SystemExit(main())

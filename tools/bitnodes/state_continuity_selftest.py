#!/usr/bin/env python3
from __future__ import annotations
import json, os, sys, tempfile, time
from pathlib import Path
TOOLS=Path(__file__).resolve().parent; sys.path.insert(0,str(TOOLS))
from state import BitnodesState, normalize_metadata

def main()->int:
    with tempfile.TemporaryDirectory() as tmp_s:
        root=Path(tmp_s); now=1_800_000_000
        st=BitnodesState(root/'state',root/'snapshots',source='zzxbitnodes')
        addresses=[f'198.51.100.{i}:8333' for i in range(1,7)]
        for i,address in enumerate(addresses):
            st.update_successes({address:[70016,'/Satoshi:test/',now-1000,1,900000,None,None,None,None,None,None,None,None,None,None,None,None,None,None,{}]},now=now-(700-i*50))
        first=st.select_probe_candidates(seed_addresses=[],limit=0,batch_size=2,now=now,reachable_interval_seconds=300,unreachable_interval_seconds=300)
        if first!=addresses[:2]: raise SystemExit(f'fair scheduler oldest-first failed: {first}')
        st.update_successes({a:[70016,'/Satoshi:test/',now,1,900000] for a in first},now=now)
        second=st.select_probe_candidates(seed_addresses=[],limit=0,batch_size=2,now=now,reachable_interval_seconds=300,unreachable_interval_seconds=300)
        if second!=addresses[2:4]: raise SystemExit(f'fair scheduler failed to rotate: {second}')
        st.update_successes({a:[70016,'/Satoshi:test/',now,1,900000] for a in second},now=now)

        # A scheduler window smaller than the known universe must be applied
        # after due/age ranking. Otherwise an alphabetically truncated prefix
        # can starve every node outside the first ``limit`` addresses forever.
        limited=st.select_probe_candidates(seed_addresses=[],limit=2,batch_size=2,now=now,reachable_interval_seconds=300,unreachable_interval_seconds=300)
        if limited!=addresses[4:6]: raise SystemExit(f'limited scheduler window starved later nodes: {limited}')

        expired=addresses[-1]; rec=st.nodes[expired]; md=normalize_metadata(rec.get('metadata')); md['last_success']=now-90001; md['reachable_24h']=True
        rec['last_success']=now-90001; rec['reachable_24h']=True; rec['metadata']=md; rec['row'][19]=md
        # Patch module clock by evaluating with real-time timestamps instead of synthetic values.
        real_now=int(time.time()); md['last_success']=real_now-90001; rec['last_success']=real_now-90001
        if expired in st.to_bitnodes_nodes('reachable_24h'): raise SystemExit('reachable_24h did not expire from timestamp')

        st.save(); reloaded=BitnodesState(root/'state',root/'snapshots',source='zzxbitnodes')
        if len(reloaded.nodes)!=6: raise SystemExit('atomic state round-trip failed')
        old=root/'snapshots'/'old.json.gz'; old.write_bytes(b'old'); os.utime(old,(real_now-26*3600,real_now-26*3600))
        snap=reloaded.snapshot_24h()
        if snap.suffix!='.gz' or not snap.is_file(): raise SystemExit('rolling snapshot is not compressed')
        if old.exists(): raise SystemExit('rolling snapshot pruning failed')
        json.loads((root/'state'/'nodes.json').read_text())
    print('state_continuity_selftest: PASS'); return 0
if __name__=='__main__': raise SystemExit(main())

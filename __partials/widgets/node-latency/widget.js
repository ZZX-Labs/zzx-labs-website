(function(){
  "use strict";
  const W=window,D=document,ID="node-latency";
  function q(root,sel){return root?.querySelector?.(sel)||null}
  function s(root,sel,v){const e=q(root,sel);if(e)e.textContent=String(v==null?"—":v)}
  function f(v){const x=Number(v);return Number.isFinite(x)?x.toFixed(1):"—"}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  async function ensure(){if(Number(W.ZZXBitnodes?.__version||0)>=5)return;const src=resolve('/__partials/widgets/_shared/zzx-bitnodes.js');await new Promise((done,fail)=>{const sc=D.createElement('script');sc.src=src;sc.defer=true;sc.addEventListener('load',done,{once:true});sc.addEventListener('error',fail,{once:true});(D.head||D.documentElement).appendChild(sc);});if(Number(W.ZZXBitnodes?.__version||0)<5)throw new Error('ZZXBitnodes unavailable');}
  function extract(raw){return raw?.latency_ms||raw?.latency||raw?.counts?.latency_ms||raw?.data?.latency_ms||null}
  function render(root,detail){const snap=detail?.snapshot;const raw=detail?.raw||{};if(!snap)return;const lat=extract(raw);if(lat&&typeof lat==='object'){s(root,'[data-nl-p50]',f(lat.p50));s(root,'[data-nl-avg]',`${f(lat.avg)} ms`);s(root,'[data-nl-p95]',`${f(lat.p95)} ms`);s(root,'[data-nl-p99]',`${f(lat.p99)} ms`);s(root,'[data-nl-status]',`${detail.source||snap.source||'ZZXBitnodes'} · ${detail.stale?'stale cache':'live'} · ${(Number(lat.count)||0).toLocaleString()} samples`);}else{s(root,'[data-nl-p50]','—');s(root,'[data-nl-avg]','mirror did not publish');s(root,'[data-nl-p95]','latency percentiles');s(root,'[data-nl-p99]','for this snapshot');s(root,'[data-nl-status]',`${detail.source||snap.source||'ZZXBitnodes'} · no latency_ms object in current payload`);}}
  async function refresh(root,force=false){const detail=await W.ZZXBitnodes.load(force);render(root,detail);}
  async function boot(root){if(!root)return;const old=root.__zzxNodeLatencyState;old?.unsubscribe?.();try{await ensure();const state={unsubscribe:null};root.__zzxNodeLatencyState=state;state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{if(root.isConnected)render(root,detail)},{immediate:true});if(!W.ZZXBitnodes.current()?.snapshot)await refresh(root,false);}catch(e){s(root,'[data-nl-status]','error: '+String(e?.message||e));}}
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();

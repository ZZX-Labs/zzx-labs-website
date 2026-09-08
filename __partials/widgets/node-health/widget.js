(function(){
  "use strict";
  const W=window,D=document,ID="node-health";
  function q(root,sel){return root?.querySelector?.(sel)||null}
  function s(root,sel,v){const e=q(root,sel);if(e)e.textContent=String(v==null?"—":v)}
  function n(v){const x=Number(v);return Number.isFinite(x)?Math.round(x).toLocaleString():"—"}
  function pct(v){const x=Number(v);return Number.isFinite(x)?`${(x*100).toFixed(2)}%`:"—"}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  async function ensure(){if(Number(W.ZZXBitnodes?.__version||0)>=5)return;const src=resolve('/__partials/widgets/_shared/zzx-bitnodes.js');await new Promise((done,fail)=>{const sc=D.createElement('script');sc.src=src;sc.defer=true;sc.addEventListener('load',done,{once:true});sc.addEventListener('error',fail,{once:true});(D.head||D.documentElement).appendChild(sc);});if(Number(W.ZZXBitnodes?.__version||0)<5)throw new Error('ZZXBitnodes unavailable');}
  function render(root,detail){const snap=detail?.snapshot;const raw=detail?.raw||{};if(!snap)return;const total=Number(snap.totalNodes??snap.reachableNodes??0);const reachable=Number(snap.reachableNodes??snap.totalNodes??0);const coverage=total>0?reachable/total:NaN;const nodes=Array.isArray(snap.nodes)?snap.nodes:[];const latest=Number(snap.latestHeight);let synced=0;let behind=0;for(const node of nodes){const h=Number(node?.height);if(!Number.isFinite(h)||!Number.isFinite(latest))continue;if(h>=latest-2)synced+=1;else behind+=1;}const reach24=Number(raw?.reachable_nodes_24h ?? raw?.counts?.reachable_24h ?? raw?.data?.reachable_nodes_24h);s(root,'[data-nh-reach]',`${pct(coverage)} reachable`);s(root,'[data-nh-now]',n(reachable));s(root,'[data-nh-24h]',Number.isFinite(reach24)?n(reach24):n(reachable));s(root,'[data-nh-sync]',`${n(synced)} / ${n(behind)}`);s(root,'[data-nh-status]',`${detail.source||snap.source||'ZZXBitnodes'} · ${detail.stale?'stale cache':'live'}${Number.isFinite(latest)?` · height ${n(latest)}`:''}`);}
  async function refresh(root,force=false){const detail=await W.ZZXBitnodes.load(force);render(root,detail);}
  async function boot(root){if(!root)return;const old=root.__zzxNodeHealthState;old?.unsubscribe?.();try{await ensure();const state={unsubscribe:null};root.__zzxNodeHealthState=state;state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{if(root.isConnected)render(root,detail)},{immediate:true});if(!W.ZZXBitnodes.current()?.snapshot)await refresh(root,false);}catch(e){s(root,'[data-nh-status]','error: '+String(e?.message||e));}}
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();

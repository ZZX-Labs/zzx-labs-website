(function(){
  "use strict";
  const W=window,D=document,ID="node-network-mix";
  function q(root,sel){return root?.querySelector?.(sel)||null}
  function s(root,sel,v){const e=q(root,sel);if(e)e.textContent=String(v==null?"—":v)}
  function n(v){const x=Number(v);return Number.isFinite(x)?Math.round(x).toLocaleString():"—"}
  function p(v){const x=Number(v);return Number.isFinite(x)?`${(x*100).toFixed(2)}%`:"—"}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  async function ensure(){if(Number(W.ZZXBitnodes?.__version||0)>=5)return;const src=resolve('/__partials/widgets/_shared/zzx-bitnodes.js');await new Promise((done,fail)=>{const sc=D.createElement('script');sc.src=src;sc.defer=true;sc.addEventListener('load',done,{once:true});sc.addEventListener('error',fail,{once:true});(D.head||D.documentElement).appendChild(sc);});if(Number(W.ZZXBitnodes?.__version||0)<5)throw new Error('ZZXBitnodes unavailable');}
  function render(root,detail){const snap=detail?.snapshot;if(!snap)return;const total=Number(snap.reachableNodes??snap.totalNodes??0);const net=snap.byNetwork||{};const ipv4=Number(net.ipv4||0), ipv6=Number(net.ipv6||0), tor=Number(net.tor||0), i2p=Number(net.i2p||0), cjdns=Number(net.cjdns||0);s(root,'[data-nm-total]',n(total));s(root,'[data-nm-ip]',`${n(ipv4)} / ${n(ipv6)}`);s(root,'[data-nm-overlay]',`${n(tor)} / ${n(i2p)}`);s(root,'[data-nm-cjdns]',`${n(cjdns)} · ${p(total>0?cjdns/total:NaN)}`);s(root,'[data-nm-status]',`${detail.source||snap.source||'ZZXBitnodes'} · ${detail.stale?'stale cache':'live'} · IPv4 ${p(total>0?ipv4/total:NaN)} · IPv6 ${p(total>0?ipv6/total:NaN)}`);}
  async function refresh(root,force=false){const detail=await W.ZZXBitnodes.load(force);render(root,detail);}
  async function boot(root){if(!root)return;const old=root.__zzxNodeNetworkMixState;old?.unsubscribe?.();try{await ensure();const state={unsubscribe:null,timer:null};root.__zzxNodeNetworkMixState=state;state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{if(root.isConnected)render(root,detail)},{immediate:true});q(root,'[data-widget-root]')?.addEventListener?.('click',()=>{});if(!W.ZZXBitnodes.current()?.snapshot)await refresh(root,false);}catch(e){s(root,'[data-nm-status]','error: '+String(e?.message||e));}}
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();

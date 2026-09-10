(function(){
  "use strict";
  const W=window,D=document,ID="node-network-mix";
  const q=(r,s)=>r?.querySelector?.(s)||null;
  const set=(r,s,v)=>{const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)};
  const n=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString():"—";
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(2)}%`:"—";
  const resolve=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;
  async function ensure(){
    if(Number(W.ZZXBitnodes?.__version||0)>=8)return;
    await new Promise((ok,fail)=>{const s=D.createElement("script");s.src=resolve("/__partials/widgets/_shared/zzx-bitnodes.js");s.defer=true;s.onload=ok;s.onerror=fail;(D.head||D.documentElement).appendChild(s)});
    if(Number(W.ZZXBitnodes?.__version||0)<8)throw new Error("ZZXBitnodes v8 unavailable");
  }
  function status(root,label,state){const e=q(root,"[data-node-network-mix-status]");if(e){e.textContent=label;e.dataset.status=state}}
  function renderBars(root,net,total){
    const wrap=q(root,"[data-node-network-mix-bars]");if(!wrap)return;wrap.replaceChildren();
    for(const key of ["ipv4","ipv6","tor","i2p","cjdns","other"]){
      const count=Number(net[key]||0), share=total>0?count/total:0;
      const row=D.createElement("div");row.className="node-network-mix__bar";
      row.innerHTML=`<span>${key.toUpperCase()}</span><div><i style="width:${Math.max(0,Math.min(100,share*100)).toFixed(2)}%"></i></div><strong>${n(count)} · ${pct(share)}</strong>`;
      wrap.appendChild(row);
    }
  }
  function render(root,detail){
    const snap=detail?.snapshot;if(!snap)return;
    const total=Number(snap.reachableNodes??snap.totalNodes??snap.nodeCount??0), net=snap.byNetwork||{};
    const ipv4=Number(net.ipv4||0),ipv6=Number(net.ipv6||0),tor=Number(net.tor||0),i2p=Number(net.i2p||0),cjdns=Number(net.cjdns||0);
    set(root,"[data-node-network-mix-total]",n(total));
    set(root,"[data-node-network-mix-sub]",`${n(snap.nodeCount)} decoded node rows`);
    set(root,"[data-node-network-mix-ipv4]",`${n(ipv4)} · ${pct(total?ipv4/total:NaN)}`);
    set(root,"[data-node-network-mix-ipv6]",`${n(ipv6)} · ${pct(total?ipv6/total:NaN)}`);
    set(root,"[data-node-network-mix-tor]",`${n(tor)} · ${pct(total?tor/total:NaN)}`);
    set(root,"[data-node-network-mix-overlay]",`${n(i2p)} / ${n(cjdns)}`);
    set(root,"[data-node-network-mix-meta]",`${detail.source||snap.source||"ZZXBitnodes"} · ${detail.stale?"stale":"live"} · normalized v8`);
    renderBars(root,net,total);status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");
  }
  async function boot(root){
    if(!root)return;root.__zzxNodeNetworkMixState?.unsubscribe?.();
    try{
      await ensure();const state={unsubscribe:null};root.__zzxNodeNetworkMixState=state;
      q(root,"[data-node-network-mix-refresh]")?.addEventListener("click",()=>W.ZZXBitnodes.load(true).then(d=>render(root,d)));
      state.unsubscribe=W.ZZXBitnodes.subscribe(d=>{if(root.isConnected)render(root,d)},{immediate:true});
      if(!W.ZZXBitnodes.current()?.snapshot)render(root,await W.ZZXBitnodes.load(false));
    }catch(e){status(root,"offline","error");set(root,"[data-node-network-mix-meta]",String(e?.message||e))}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();

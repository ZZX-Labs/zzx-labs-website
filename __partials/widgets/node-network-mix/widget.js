(function(){
  "use strict";
  const W=window,D=document,ID="node-network-mix";
  const q=(r,s)=>r?r.querySelector(s):null;
  const i=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString():"—";
  const p=(v,t)=>Number.isFinite(Number(v))&&Number(t)>0?(100*Number(v)/Number(t)).toFixed(2)+"%":"—";
  function status(r,l,s){const e=q(r,"[data-node-network-mix-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  function bars(root,total,items){
    const box=q(root,"[data-node-network-mix-bars]"); if(!box)return; box.replaceChildren();
    for(const [label,count] of items){
      const row=D.createElement("div"); row.className="node-network-mix__bar-row";
      const a=D.createElement("span");a.textContent=label;
      const track=D.createElement("div");track.className="node-network-mix__track";
      const fill=D.createElement("div");fill.className="node-network-mix__fill";fill.style.width=Number(total)>0?`${Math.max(0,Math.min(100,100*Number(count||0)/Number(total)))}%`:"0%";
      track.appendChild(fill);
      const b=D.createElement("span");b.textContent=p(count,total);
      row.append(a,track,b);box.appendChild(row);
    }
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{
      const x=await W.ZZXBitnodesData.aggregate(false),d=x.data||{},c=d.counts||{},t=Number(c.total??d.total_nodes);
      q(root,"[data-node-network-mix-total]").textContent=i(t);
      q(root,"[data-node-network-mix-ipv4]").textContent=`${i(c.ipv4)} · ${p(c.ipv4,t)}`;
      q(root,"[data-node-network-mix-ipv6]").textContent=`${i(c.ipv6)} · ${p(c.ipv6,t)}`;
      q(root,"[data-node-network-mix-tor]").textContent=`${i(c.tor)} · ${p(c.tor,t)}`;
      q(root,"[data-node-network-mix-overlay]").textContent=`${i(c.i2p)} / ${i(c.cjdns)}`;
      q(root,"[data-node-network-mix-sub]").textContent=`IPv4 ${p(c.ipv4,t)} · IPv6 ${p(c.ipv6,t)} · Tor ${p(c.tor,t)}`;
      q(root,"[data-node-network-mix-meta]").textContent=`${x.source} · generated ${d.generated_at?new Date(d.generated_at).toLocaleString():"—"}`;
      bars(root,t,[["IPv4",c.ipv4],["IPv6",c.ipv6],["Tor",c.tor],["I2P+CJDNS",Number(c.i2p||0)+Number(c.cjdns||0)]]);
      status(root,"local","ok");
    }catch(e){status(root,"offline","error");q(root,"[data-node-network-mix-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root){
    if(!W.ZZXBitnodesData){status(root,"offline","error");return}
    const state={busy:false,timer:null};root.__zzxNodeNetworkMixState=state;
    q(root,"[data-node-network-mix-refresh]")?.addEventListener("click",()=>refresh(root,state));
    await refresh(root,state);
    async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,600000)}state.timer=W.setTimeout(loop,600000);
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();

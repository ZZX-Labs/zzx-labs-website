(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const DEFAULT_API="https://mempool.space/api";
  const state={
    api:localStorage.getItem("zzx-bit-monitor-api")||DEFAULT_API,
    snapshot:null,node:null,lightning:null,
    nodeProvider:null,lightningProvider:null,
    history:[],autoTimer:null
  };

  function setStatus(id,text,kind="partial"){const el=$(id);el.textContent=text;el.className=`runtime-badge ${kind}`;}
  function sats(v){return `${Math.round(Number(v)||0).toLocaleString()} sats`;}
  function bytes(v){const n=Number(v)||0;if(n>=1e9)return`${(n/1e9).toFixed(2)} GB`;if(n>=1e6)return`${(n/1e6).toFixed(2)} MB`;if(n>=1e3)return`${(n/1e3).toFixed(2)} KB`;return`${n} B`;}

  async function refreshPublic() {
    setStatus("mon-net","NETWORK: FETCHING","partial");
    setStatus("mon-api","ESPLORA: FETCHING","partial");
    try {
      const snap=await BitMonitorCore.publicSnapshot(state.api);
      state.snapshot=snap;
      state.history.push({t:Date.now(),fees:Number(snap.fees?.fastestFee)||0,txs:Number(snap.mempool?.count)||0});
      if(state.history.length>240)state.history.shift();
      setStatus("mon-net","NETWORK: ONLINE","ok");
      setStatus("mon-api","ESPLORA: OK","ok");
      renderPublic();
      checkAlerts();
      return snap;
    } catch(e) {
      setStatus("mon-net","NETWORK: ERROR","bad");
      setStatus("mon-api","ESPLORA: ERROR","bad");
      $("overview-output").textContent=`ERROR: ${e.message}\n\nSource: ${state.api}`;
      throw e;
    }
  }

  function renderPublic() {
    const s=state.snapshot;if(!s)return;
    $("overview-height").textContent=Number(s.height).toLocaleString();
    $("overview-txs").textContent=Number(s.mempool?.count||0).toLocaleString();
    $("overview-fast").textContent=`${Number(s.fees?.fastestFee||0)} sat/vB`;
    $("overview-latency").textContent=`${s.latencyMs.toFixed(0)} ms`;
    $("overview-output").textContent=JSON.stringify(s,null,2);

    $("mp-count").textContent=Number(s.mempool?.count||0).toLocaleString();
    $("mp-vsize").textContent=bytes(s.mempool?.vsize);
    $("mp-fees").textContent=`${Number(s.mempool?.total_fee||0).toLocaleString()} sats`;
    $("mp-min").textContent=s.mempool?.mempoolminfee!=null?String(s.mempool.mempoolminfee):"—";

    const body=$("fee-body");body.replaceChildren();
    const rows=[
      ["Fastest",s.fees?.fastestFee,"next block priority"],
      ["Half hour",s.fees?.halfHourFee,"~3 blocks"],
      ["Hour",s.fees?.hourFee,"~6 blocks"],
      ["Economy",s.fees?.economyFee,"lower priority"],
      ["Minimum",s.fees?.minimumFee,"floor"]
    ];
    for(const row of rows){const tr=document.createElement("tr");row.forEach(v=>{const td=document.createElement("td");td.textContent=v==null?"—":v;tr.appendChild(td);});body.appendChild(tr);}
    drawHistory();
  }

  function drawHistory() {
    const c=$("overview-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||320));
    c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
    const arr=state.history;if(arr.length<2){ctx.fillStyle="#969696";ctx.font='11px "IBM Plex Mono", monospace';ctx.fillText("Refresh again to build history.",20,28);return;}
    const pad=40,max=Math.max(...arr.map(x=>x.fees),1);ctx.strokeStyle="#c0d674";ctx.lineWidth=2;ctx.beginPath();
    arr.forEach((x,i)=>{const px=pad+(w-pad*2)*i/(arr.length-1),py=h-35-(x.fees/max)*(h-70);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();
    ctx.fillStyle="#969696";ctx.font='10px "IBM Plex Mono", monospace';ctx.fillText("fastest fee history (sat/vB)",pad,18);
  }

  function renderNode() {
    const n=state.node||{};
    $("node-chain").textContent=n.chain||"—";$("node-blocks").textContent=n.blocks!=null?Number(n.blocks).toLocaleString():"—";$("node-peers").textContent=n.peers!=null?n.peers:"—";$("node-progress").textContent=n.verificationProgress!=null?`${(Number(n.verificationProgress)*100).toFixed(4)}%`:"—";$("node-output").textContent=state.node?JSON.stringify(n,null,2):"No node provider data.";
  }

  function renderLightning() {
    const n=state.lightning||{};
    $("ln-alias").textContent=n.alias||"—";$("ln-channels").textContent=n.channels!=null?n.channels:"—";$("ln-peers").textContent=n.peers!=null?n.peers:"—";$("ln-balance").textContent=n.localBalanceSats!=null?sats(n.localBalanceSats):"—";$("ln-output").textContent=state.lightning?JSON.stringify(n,null,2):"No Lightning provider data.";
  }

  async function runNodeProvider() {
    if(!state.nodeProvider)throw new Error("No node provider registered.");
    state.node=await state.nodeProvider();
    renderNode();
  }

  async function runLightningProvider() {
    if(!state.lightningProvider)throw new Error("No Lightning provider registered.");
    state.lightning=await state.lightningProvider();
    renderLightning();
  }

  function thresholds(){return{fastFee:Math.max(1,Number($("alert-fee").value)||50),mempoolTxs:Math.max(1,Number($("alert-txs").value)||100000),latencyMs:Math.max(1,Number($("alert-latency").value)||2500)};}

  function checkAlerts() {
    const alerts=BitMonitorCore.evaluateAlerts(state.snapshot,thresholds());
    const root=$("alert-list");root.replaceChildren();
    if(!alerts.length){root.innerHTML='<div class="z-list-item"><strong>OK</strong><p>No configured thresholds are currently exceeded.</p></div>';return alerts;}
    for(const a of alerts){const el=document.createElement("article");el.className="z-list-item";const h=document.createElement("strong");h.textContent=a.type.toUpperCase();const p=document.createElement("p");p.textContent=a.message;el.append(h,p);root.appendChild(el);if(Notification?.permission==="granted")new Notification("Bit-Monitor",{body:a.message});}
    return alerts;
  }

  function toggleAuto() {
    if(state.autoTimer){clearInterval(state.autoTimer);state.autoTimer=null;$("overview-auto").textContent="AUTO: OFF";}
    else{state.autoTimer=setInterval(()=>refreshPublic().catch(()=>{}),30000);$("overview-auto").textContent="AUTO: 30S";}
  }

  async function importSnapshot(input,target) {
    const f=input.files?.[0];if(!f)return;
    const v=JSON.parse(await f.text());
    if(target==="node"){state.node=v;renderNode();}else{state.lightning=v;renderLightning();}
    input.value="";
  }

  $("source-api").value=state.api;
  $("source-output").textContent=JSON.stringify({publicApi:state.api,nodeProvider:false,lightningProvider:false},null,2);
  $("overview-refresh").addEventListener("click",()=>refreshPublic().catch(()=>{}));
  $("overview-auto").addEventListener("click",toggleAuto);
  $("node-refresh").addEventListener("click",()=>runNodeProvider().catch(e=>$("node-output").textContent=`ERROR: ${e.message}`));
  $("ln-refresh").addEventListener("click",()=>runLightningProvider().catch(e=>$("ln-output").textContent=`ERROR: ${e.message}`));
  $("node-import").addEventListener("change",()=>importSnapshot($("node-import"),"node"));
  $("ln-import").addEventListener("change",()=>importSnapshot($("ln-import"),"ln"));
  $("alerts-check").addEventListener("click",checkAlerts);
  $("alerts-notify").addEventListener("click",async()=>{if(!("Notification" in window)){alert("Notifications unavailable.");return;}const p=await Notification.requestPermission();$("alerts-notify").textContent=`NOTIFICATIONS: ${p.toUpperCase()}`;});
  $("source-save").addEventListener("click",()=>{state.api=$("source-api").value.trim().replace(/\/+$/,"")||DEFAULT_API;localStorage.setItem("zzx-bit-monitor-api",state.api);$("source-output").textContent=JSON.stringify({publicApi:state.api,nodeProvider:Boolean(state.nodeProvider),lightningProvider:Boolean(state.lightningProvider)},null,2);});
  $("source-reset").addEventListener("click",()=>{$("source-api").value=DEFAULT_API;state.api=DEFAULT_API;localStorage.removeItem("zzx-bit-monitor-api");$("source-output").textContent=JSON.stringify({publicApi:state.api,nodeProvider:Boolean(state.nodeProvider),lightningProvider:Boolean(state.lightningProvider)},null,2);});

  renderNode();renderLightning();checkAlerts();

  window.BitMonitor=Object.freeze({
    version:"0.1.0-alpha-web",
    refresh:refreshPublic,
    registerNodeProvider(fn){state.nodeProvider=fn;setStatus("mon-provider",`NODE/LN: ${state.nodeProvider||state.lightningProvider?"READY":"OPTIONAL"}`,state.nodeProvider||state.lightningProvider?"ok":"partial");},
    registerLightningProvider(fn){state.lightningProvider=fn;setStatus("mon-provider",`NODE/LN: ${state.nodeProvider||state.lightningProvider?"READY":"OPTIONAL"}`,state.nodeProvider||state.lightningProvider?"ok":"partial");},
    getState(){return{api:state.api,snapshot:state.snapshot,node:state.node,lightning:state.lightning,history:[...state.history]};}
  });
  window.ZZXHooks?.emit("bit-monitor:ready",{version:"0.1.0-alpha-web"});
})();

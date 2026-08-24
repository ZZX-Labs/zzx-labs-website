(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const DEFAULT="https://mempool.space/api";
  const state={api:localStorage.getItem("zzx-bitage-api")||DEFAULT,blocks:[],intervals:[],coreProvider:null};

  function status(id,text,kind){const e=$(id);e.textContent=text;e.className=`runtime-badge ${kind}`;}
  function download(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function applyBlocks(blocks) {
    state.blocks=[...blocks].sort((a,b)=>a.height-b.height);
    const min=Math.max(0,Number($("ba-min").value)||0);
    state.intervals=BitAgeCore.intervals(state.blocks).filter(x=>x.seconds>=min);
    render();
  }

  async function fetchSample() {
    const count=Math.max(2,Number($("ba-window").value)||50);
    const backend=$("ba-backend").value;
    if(backend==="core") {
      if(!state.coreProvider)throw new Error("No Bitcoin Core provider registered.");
      status("ba-core","CORE RPC: FETCHING","partial");
      const blocks=await state.coreProvider(count+1);
      applyBlocks(blocks);
      status("ba-core","CORE RPC: READY","ok");
      return;
    }
    status("ba-net","ESPLORA: FETCHING","partial");
    try {
      const blocks=await BitAgeCore.fetchRecentEsplora(state.api,count);
      applyBlocks(blocks);
      status("ba-net","ESPLORA: READY","ok");
    } catch(e) {
      status("ba-net","ESPLORA: ERROR","bad");
      throw e;
    }
  }

  function render() {
    $("ba-blocks").textContent=state.blocks.length;
    $("ba-intervals").textContent=state.intervals.length;
    $("ba-tip").textContent=state.blocks.length?Math.max(...state.blocks.map(x=>x.height)).toLocaleString():"—";
    if(state.blocks.length>1) {
      const span=Math.max(...state.blocks.map(x=>x.timestamp))-Math.min(...state.blocks.map(x=>x.timestamp));
      $("ba-span").textContent=`${(span/3600).toFixed(2)} h`;
    } else $("ba-span").textContent="—";
    $("ba-output").textContent=JSON.stringify({blocks:state.blocks,intervals:state.intervals},null,2);
    renderStats();draw();
  }

  function renderStats() {
    const s=BitAgeCore.stats(state.intervals.map(x=>x.seconds));
    const body=$("st-body");body.replaceChildren();
    if(!s) {
      ["st-mean","st-med","st-sd","st-delta"].forEach(id=>$(id).textContent="—");
      body.innerHTML='<tr><td colspan="2" class="muted">No interval data.</td></tr>';return;
    }
    $("st-mean").textContent=`${s.mean.toFixed(2)} s`;
    $("st-med").textContent=`${s.median.toFixed(2)} s`;
    $("st-sd").textContent=`${s.stddev.toFixed(2)} s`;
    $("st-delta").textContent=`${s.meanDeltaFrom600>=0?"+":""}${s.meanDeltaFrom600.toFixed(2)} s`;
    const rows=[
      ["N",s.n],["Minimum",`${s.min.toFixed(2)} s`],["P10",`${s.p10.toFixed(2)} s`],["P25",`${s.p25.toFixed(2)} s`],
      ["Median",`${s.median.toFixed(2)} s`],["P75",`${s.p75.toFixed(2)} s`],["P90",`${s.p90.toFixed(2)} s`],["Maximum",`${s.max.toFixed(2)} s`],
      ["Below 600s",`${(s.below600*100).toFixed(2)}%`],["Above 600s",`${(s.above600*100).toFixed(2)}%`]
    ];
    for(const [k,v] of rows){const tr=document.createElement("tr");for(const x of [k,v]){const td=document.createElement("td");td.textContent=x;tr.appendChild(td);}body.appendChild(tr);}
  }

  function draw() {
    const c=$("ba-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(280,Math.round(r.height||380));
    c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
    const vals=state.intervals.map(x=>x.seconds);if(vals.length<2){ctx.fillStyle="#969696";ctx.font='11px monospace';ctx.fillText("Fetch or import interval data.",20,28);return;}
    const roll=BitAgeCore.rolling(vals,$("chart-roll").value),pad=44,max=Math.max(600,...vals,1);
    const y=v=>h-35-(Math.min(v,max)/max)*(h-70),x=i=>pad+(w-pad*2)*i/(vals.length-1);
    ctx.strokeStyle="#4d5547";ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(pad,y(600));ctx.lineTo(w-pad,y(600));ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle="#c0d674";ctx.lineWidth=1.5;ctx.beginPath();vals.forEach((v,i)=>{i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v));});ctx.stroke();
    ctx.strokeStyle="#e6a42b";ctx.lineWidth=2;ctx.beginPath();roll.forEach((v,i)=>{i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v));});ctx.stroke();
    ctx.fillStyle="#969696";ctx.font='10px monospace';ctx.fillText("green interval · amber rolling mean · dashed 600s",pad,18);
  }

  function exportJson() {
    download(JSON.stringify({schema:"zzx.bitage.sample.v1",exportedAt:new Date().toISOString(),blocks:state.blocks},null,2),`bitage-${Date.now()}.json`,"application/json");
  }
  function exportCsv() {
    const rows=["from_height,to_height,from_timestamp,to_timestamp,seconds",...state.intervals.map(x=>[x.fromHeight,x.toHeight,x.fromTimestamp,x.toTimestamp,x.seconds].join(","))];
    download(rows.join("\n")+"\n",`bitage-${Date.now()}.csv`,"text/csv");
  }

  $("ba-api").value=state.api;
  $("backend-output").textContent=JSON.stringify({esplora:state.api,coreProvider:false},null,2);
  $("ba-fetch").addEventListener("click",()=>fetchSample().catch(e=>$("ba-output").textContent=`ERROR: ${e.message}`));
  $("ba-clear").addEventListener("click",()=>applyBlocks([]));
  $("chart-roll").addEventListener("input",draw);
  $("ba-save-api").addEventListener("click",()=>{state.api=$("ba-api").value.trim().replace(/\/+$/,"")||DEFAULT;localStorage.setItem("zzx-bitage-api",state.api);$("backend-output").textContent=JSON.stringify({esplora:state.api,coreProvider:Boolean(state.coreProvider)},null,2);});
  $("ba-reset-api").addEventListener("click",()=>{state.api=DEFAULT;$("ba-api").value=DEFAULT;localStorage.removeItem("zzx-bitage-api");$("backend-output").textContent=JSON.stringify({esplora:state.api,coreProvider:Boolean(state.coreProvider)},null,2);});
  $("ba-export-json").addEventListener("click",exportJson);
  $("ba-export-csv").addEventListener("click",exportCsv);
  $("ba-import").addEventListener("change",async()=>{const f=$("ba-import").files?.[0];if(!f)return;const v=JSON.parse(await f.text());if(!Array.isArray(v.blocks))throw new Error("No blocks array.");applyBlocks(v.blocks);$("import-output").textContent=`Imported ${v.blocks.length} blocks.`;$("ba-import").value="";});
  render();

  window.BitAge=Object.freeze({
    version:"0.2.0-alpha-web",
    refresh:fetchSample,
    registerCoreProvider(fn){state.coreProvider=fn;status("ba-core",fn?"CORE RPC: PROVIDER READY":"CORE RPC: PROVIDER",fn?"ok":"partial");},
    setBlocks:applyBlocks,
    getStats(){return BitAgeCore.stats(state.intervals.map(x=>x.seconds));},
    getState(){return{api:state.api,blocks:[...state.blocks],intervals:[...state.intervals],coreProvider:Boolean(state.coreProvider)};}
  });
  window.ZZXHooks?.emit("bitage:ready",{version:"0.2.0-alpha-web"});
})();

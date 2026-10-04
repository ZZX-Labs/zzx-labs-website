(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const DEFAULT="https://mempool.space/api/v1/prices";
  const state={
    endpoint:localStorage.getItem("zzx-bit-tick-endpoint")||DEFAULT,
    prices:null,updatedAt:null,provider:null,timer:null,
    history:JSON.parse(localStorage.getItem("zzx-bit-tick-history")||"[]"),
    subscribers:new Set()
  };

  function currency(){return $("tick-currency").value;}
  function price(){return Number(state.prices?.[currency()]);}
  function fmt(v,cur=currency()){return new Intl.NumberFormat(undefined,{style:"currency",currency:cur,maximumFractionDigits:Math.max(0,Math.min(8,Number($("tick-decimals").value)||2))}).format(Number(v)||0);}
  function setNet(text,kind){const e=$("tick-net");e.textContent=text;e.className=`runtime-badge ${kind}`;}
  function saveHistory(){localStorage.setItem("zzx-bit-tick-history",JSON.stringify(state.history.slice(-500)));}

  async function refresh() {
    setNet("PRICE: FETCHING","partial");
    try {
      let data;
      if(state.provider)data=await state.provider();
      else {
        const res=await fetch(state.endpoint,{cache:"no-store",headers:{Accept:"application/json"}});
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        data=await res.json();
      }
      state.prices=BitTickCore.normalizePrices(data);
      state.updatedAt=new Date().toISOString();
      const p=price();
      if(p>0) {
        state.history.push({at:state.updatedAt,currency:currency(),price:p});
        if(state.history.length>500)state.history=state.history.slice(-500);
        saveHistory();
      }
      setNet("PRICE: LIVE","ok");
      render();
      for(const fn of state.subscribers){try{fn({prices:{...state.prices},updatedAt:state.updatedAt});}catch(e){console.error(e);}}
      return state.prices;
    } catch(e) {
      setNet("PRICE: ERROR","bad");
      $("ticker-output").textContent=`ERROR: ${e.message}\n\nEndpoint: ${state.endpoint}`;
      throw e;
    }
  }

  function render() {
    const p=price();
    if(p>0) {
      $("price-btc").textContent=fmt(p);
      $("price-100k").textContent=fmt(p*.001);
      $("price-sat").textContent=fmt(p/100000000);
      $("price-time").textContent=state.updatedAt?new Date(state.updatedAt).toLocaleTimeString():"—";
      $("ticker-output").textContent=JSON.stringify({currency:currency(),price:p,allPrices:state.prices,updatedAt:state.updatedAt,source:state.provider?"custom-provider":state.endpoint},null,2);
    }
    renderHistory();
  }

  function relevantHistory() {const cur=currency();return state.history.filter(x=>x.currency===cur&&Number.isFinite(Number(x.price)));}

  function renderHistory() {
    const arr=relevantHistory(),p=price();
    $("hist-count").textContent=arr.length;
    if(arr.length) {
      const vals=arr.map(x=>Number(x.price));
      $("hist-low").textContent=fmt(Math.min(...vals));
      $("hist-high").textContent=fmt(Math.max(...vals));
      $("hist-change").textContent=arr.length>1?`${((vals.at(-1)/vals[0]-1)*100).toFixed(3)}%`:"0.000%";
    } else {
      $("hist-low").textContent=$("hist-high").textContent=$("hist-change").textContent="—";
    }

    const c=$("history-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||340));
    c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
    if(arr.length<2){ctx.fillStyle="#969696";ctx.font='11px "IBM Plex Mono", monospace';ctx.fillText("Collect at least two observations to draw a chart.",20,28);return;}
    const vals=arr.map(x=>Number(x.price)),lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(hi-lo,hi*.000001),pad=45;
    ctx.strokeStyle="#c0d674";ctx.lineWidth=2;ctx.beginPath();
    vals.forEach((v,i)=>{const x=pad+(w-pad*2)*i/(vals.length-1),y=h-35-(v-lo)/range*(h-70);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    ctx.fillStyle="#969696";ctx.font='10px "IBM Plex Mono", monospace';ctx.fillText(`${currency()} session history`,pad,18);
  }

  function doConvert() {
    const p=price();const result=BitTickCore.convert($("conv-amount").value,$("conv-from").value,$("conv-to").value,p);
    const to=$("conv-to").value;
    const formatted=to==="FIAT"?fmt(result):to==="BTC"?`${result.toFixed(8)} BTC`:`${Math.round(result).toLocaleString()} sats`;
    $("conv-output").textContent=JSON.stringify({amount:Number($("conv-amount").value),from:$("conv-from").value,to,currency:currency(),price:p,result,formatted},null,2);
  }

  function toggleAuto() {
    if(state.timer){clearInterval(state.timer);state.timer=null;$("tick-auto").textContent="AUTO: OFF";}
    else{const ms=Math.max(5,Number($("tick-interval").value)||30)*1000;state.timer=setInterval(()=>refresh().catch(()=>{}),ms);$("tick-auto").textContent=`AUTO: ${ms/1000}S`;}
  }

  function exportCsv() {
    const rows=["timestamp,currency,price",...state.history.map(x=>`${x.at},${x.currency},${x.price}`)];
    const b=new Blob([rows.join("\n")+"\n"],{type:"text/csv"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`bit-tick-history-${Date.now()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }

  $("source-url").value=state.endpoint;
  $("source-output").textContent=JSON.stringify({endpoint:state.endpoint,customProvider:false},null,2);

  $("tick-refresh").addEventListener("click",()=>refresh().catch(()=>{}));
  $("tick-auto").addEventListener("click",toggleAuto);
  $("tick-currency").addEventListener("change",render);
  $("tick-decimals").addEventListener("input",render);
  $("conv-run").addEventListener("click",()=>{try{doConvert();}catch(e){$("conv-output").textContent=`ERROR: ${e.message}`;}});
  $("history-clear").addEventListener("click",()=>{state.history=[];saveHistory();renderHistory();});
  $("history-export").addEventListener("click",exportCsv);
  $("source-save").addEventListener("click",()=>{state.endpoint=$("source-url").value.trim()||DEFAULT;localStorage.setItem("zzx-bit-tick-endpoint",state.endpoint);$("source-output").textContent=JSON.stringify({endpoint:state.endpoint,customProvider:Boolean(state.provider)},null,2);});
  $("source-reset").addEventListener("click",()=>{state.endpoint=DEFAULT;$("source-url").value=DEFAULT;localStorage.removeItem("zzx-bit-tick-endpoint");$("source-output").textContent=JSON.stringify({endpoint:state.endpoint,customProvider:Boolean(state.provider)},null,2);});
  renderHistory();

  window.BitTick=Object.freeze({
    version:"0.1.0-alpha-web",
    refresh,
    getPrice(cur="USD"){return Number(state.prices?.[String(cur).toUpperCase()])||null;},
    convert(amount,from,to,cur="USD"){return BitTickCore.convert(amount,from,to,Number(state.prices?.[String(cur).toUpperCase()]));},
    subscribe(fn){state.subscribers.add(fn);return()=>state.subscribers.delete(fn);},
    registerProvider(fn){state.provider=fn;$("source-output").textContent=JSON.stringify({endpoint:state.endpoint,customProvider:Boolean(fn)},null,2);},
    getState(){return{prices:state.prices,updatedAt:state.updatedAt,endpoint:state.endpoint,history:[...state.history]};}
  });
  window.ZZXHooks?.emit("bit-tick:ready",{version:"0.1.0-alpha-web"});
})();

(() => {
  "use strict";

  async function fetchJson(url,timeoutMs=10000) {
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    const started=performance.now();
    try {
      const res=await fetch(url,{signal:ctrl.signal,cache:"no-store",headers:{Accept:"application/json,text/plain;q=0.9"}});
      const latencyMs=performance.now()-started;
      if(!res.ok)throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text=await res.text();
      let data;
      try{data=JSON.parse(text);}catch{data=text.trim();}
      return {data,latencyMs,status:res.status};
    } finally {
      clearTimeout(timer);
    }
  }

  async function publicSnapshot(base) {
    const api=String(base||"").replace(/\/+$/,"");
    const started=performance.now();
    const [height,mempool,fees]=await Promise.all([
      fetchJson(`${api}/blocks/tip/height`),
      fetchJson(`${api}/mempool`),
      fetchJson(`${api}/v1/fees/recommended`)
    ]);
    return {
      at:new Date().toISOString(),
      height:Number(height.data),
      mempool:mempool.data,
      fees:fees.data,
      latencyMs:performance.now()-started
    };
  }

  function evaluateAlerts(snapshot,thresholds) {
    const alerts=[];
    const fast=Number(snapshot?.fees?.fastestFee);
    const txs=Number(snapshot?.mempool?.count);
    const latency=Number(snapshot?.latencyMs);
    if(Number.isFinite(fast)&&fast>=thresholds.fastFee)alerts.push({level:"warn",type:"fee",message:`Fast fee ${fast} sat/vB ≥ ${thresholds.fastFee}`});
    if(Number.isFinite(txs)&&txs>=thresholds.mempoolTxs)alerts.push({level:"warn",type:"mempool",message:`Mempool ${txs.toLocaleString()} txs ≥ ${thresholds.mempoolTxs.toLocaleString()}`});
    if(Number.isFinite(latency)&&latency>=thresholds.latencyMs)alerts.push({level:"warn",type:"latency",message:`API latency ${latency.toFixed(0)} ms ≥ ${thresholds.latencyMs}`});
    return alerts;
  }

  window.BitMonitorCore=Object.freeze({fetchJson,publicSnapshot,evaluateAlerts});
})();

// __partials/widgets/btc-notabletxs/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXNotableTxProvider?.__version >= 1) return;

  function normalizeBase(v) {
    return String(v || "").trim().replace(/\/+$/g,"");
  }

  function bases(core) {
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  async function request(url) {
    if (W.ZZXAPI?.jsonStrict) {
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:false,
        timeoutMs:10000,
        retries:1
      });
    }

    if (W.ZZXAPI?.fetchRaw) {
      const r=await W.ZZXAPI.fetchRaw(url,{
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r=await fetch(url,{cache:"no-store",credentials:"omit"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function normalizeObject(row) {
    const weight=Number(row?.weight);
    const vsize=Number(
      row?.vsize ??
      (Number.isFinite(weight) ? weight/4 : NaN)
    );

    return {
      txid:String(row?.txid || row?.txId || row?.hash || ""),
      fee:Number(row?.fee),
      vsize,
      weight:Number.isFinite(weight) ? weight : (Number.isFinite(vsize) ? vsize*4 : NaN),
      value:Number(row?.value ?? row?.output_value ?? row?.total_output_value),
      vin:Array.isArray(row?.vin) ? row.vin.length : NaN,
      vout:Array.isArray(row?.vout) ? row.vout.length : NaN
    };
  }

  async function fetchTx(base,txid) {
    const data=await request(`${base}/tx/${txid}`);
    const out=(data?.vout || []).reduce(
      (sum,row)=>sum+(Number.isFinite(Number(row?.value))?Number(row.value):0),
      0
    );

    const item=normalizeObject(data);
    if (!Number.isFinite(item.value)) item.value=out;
    return item;
  }

  async function enrich(base,txids,limit=20) {
    const ids=(txids || []).slice(0,limit);
    const out=[];
    let cursor=0;

    async function worker() {
      while (cursor<ids.length) {
        const index=cursor++;
        try {
          out[index]=await fetchTx(base,ids[index]);
        } catch (_) {
          out[index]={txid:ids[index],fee:NaN,vsize:NaN,weight:NaN,value:NaN,vin:NaN,vout:NaN};
        }
      }
    }

    await Promise.all(Array.from({length:Math.min(4,ids.length)},()=>worker()));
    return out.filter(Boolean);
  }

  async function load(core) {
    let lastError=null;

    for (const base of bases(core)) {
      const candidates=[
        `${base}/mempool/recent`,
        `${base}/v1/mempool/recent`,
        `${base}/mempool/txids`
      ];

      for (const url of candidates) {
        try {
          const data=await request(url);

          if (Array.isArray(data) && data.length && typeof data[0] === "object") {
            return {
              items:data.map(normalizeObject).filter(row=>row.txid),
              base,
              source:url
            };
          }

          if (Array.isArray(data) && data.length && typeof data[0] === "string") {
            return {
              items:await enrich(base,data,20),
              base,
              source:url
            };
          }
        } catch (error) {
          lastError=error;
        }
      }
    }

    throw lastError || new Error("recent mempool transactions unavailable");
  }

  W.ZZXNotableTxProvider = Object.freeze({
    __version:1,
    load
  });
})();

(() => {
  "use strict";

  function validateAddress(address) {
    const a=String(address||"").trim();
    return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a);
  }

  function validateTxid(txid) {
    return /^[0-9a-f]{64}$/i.test(String(txid||"").trim());
  }

  async function fetchJson(base,path) {
    const url=`${String(base).replace(/\/+$/,"")}${path}`;
    const res=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"}});
    if(!res.ok)throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
  }

  function addressBalance(summary) {
    const cs=summary?.chain_stats||{},ms=summary?.mempool_stats||{};
    const funded=(Number(cs.funded_txo_sum)||0)+(Number(ms.funded_txo_sum)||0);
    const spent=(Number(cs.spent_txo_sum)||0)+(Number(ms.spent_txo_sum)||0);
    return {funded,spent,balance:funded-spent};
  }

  window.BitTrackerCore=Object.freeze({validateAddress,validateTxid,fetchJson,addressBalance});
})();

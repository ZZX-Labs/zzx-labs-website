(() => {
  "use strict";
  function validAddress(a){return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(String(a||"").trim());}
  function validTxid(t){return /^[0-9a-f]{64}$/i.test(String(t||"").trim());}
  function balance(summary){const c=summary?.chain_stats||{},m=summary?.mempool_stats||{};const funded=(+c.funded_txo_sum||0)+(+m.funded_txo_sum||0),spent=(+c.spent_txo_sum||0)+(+m.spent_txo_sum||0);return{funded,spent,balance:funded-spent,confirmedTxs:+c.tx_count||0};}
  async function get(api,path){const r=await fetch(`${String(api).replace(/\/+$/,"")}${path}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
  function trace(tx){return{txid:tx.txid,status:tx.status,fee:tx.fee,weight:tx.weight,size:tx.size,inputs:(tx.vin||[]).map((v,i)=>({index:i,prevTxid:v.txid,vout:v.vout,address:v.prevout?.scriptpubkey_address||null,value:v.prevout?.value||0,isCoinbase:Boolean(v.is_coinbase)})),outputs:(tx.vout||[]).map((v,i)=>({index:i,address:v.scriptpubkey_address||null,value:v.value||0,type:v.scriptpubkey_type||null}))};}
  window.BitTrackItCore=Object.freeze({validAddress,validTxid,balance,get,trace});
})();

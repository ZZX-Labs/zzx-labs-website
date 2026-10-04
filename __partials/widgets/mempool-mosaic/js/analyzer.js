(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicAnalyzer?.__version>=2)return;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  function analyze(tx,{rawHex="",block=null,entry=null,tipHeight=NaN,btcUsd=NaN}={}){
    const vsize=finite(tx?.vsize??tx?.weight/4??entry?.vsize);const fee=finite(tx?.fee??entry?.fee);const rate=fee>0&&vsize>0?fee/vsize:finite(entry?.feeRate);
    const outputs=Array.isArray(tx?.vout)?tx.vout:[],inputs=Array.isArray(tx?.vin)?tx.vin:[];
    const valueSats=outputs.reduce((s,o)=>s+(Number.isFinite(finite(o?.value))?finite(o.value):0),0);
    const inputSats=inputs.reduce((s,i)=>s+(Number.isFinite(finite(i?.prevout?.value))?finite(i.prevout.value):0),0);
    const rbf=inputs.some(i=>Number(i?.sequence)<0xfffffffe);const segwit=inputs.some(i=>Array.isArray(i?.witness)&&i.witness.length);
    const opReturn=outputs.filter(o=>String(o?.scriptpubkey_type||"").toLowerCase()==="op_return"||String(o?.scriptpubkey_asm||"").startsWith("OP_RETURN")).length;
    const status=tx?.status||{};const confirmed=Boolean(status.confirmed);const height=finite(status.block_height);const confirmations=confirmed&&Number.isFinite(height)&&Number.isFinite(finite(tipHeight))?Math.max(1,Math.floor(finite(tipHeight)-height+1)):0;
    return Object.freeze({txid:String(tx?.txid||entry?.txid||""),capturedAt:Date.now(),vsize,feeSats:fee,feeRate:rate,valueSats,inputSats,inputs:inputs.length,outputs:outputs.length,rbf,segwit,opReturn,confirmed,blockHeight:height,confirmations,blockHash:String(status.block_hash||""),rawHex:String(rawHex||""),raw:tx,block,btcUsd:finite(btcUsd)});
  }
  W.ZZXMempoolMosaicAnalyzer=Object.freeze({__version:2,analyze});
})();

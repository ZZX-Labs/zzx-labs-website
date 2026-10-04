(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXMempoolMosaicInspector?.__version>=2)return;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const int=v=>Number.isFinite(finite(v))?Math.round(finite(v)).toLocaleString():"—";
  const num=(v,d=2)=>Number.isFinite(finite(v))?finite(v).toLocaleString(undefined,{maximumFractionDigits:d}):"—";
  function title(tip,text){tip.replaceChildren();const strong=D.createElement("strong");strong.textContent=text;tip.append(strong);return tip}
  function add(tip,text){const span=D.createElement("span");span.textContent=text;tip.append(span);return span}
  function tile(tip,item){title(tip,item?.txid?`${String(item.txid).slice(0,16)}…`:"transaction");add(tip,`${num(item?.packageFeeRate??item?.feeRate,2)} sat/vB · ${int(item?.vsize)} vB · ${Number.isFinite(finite(item?.valueSats))?(finite(item.valueSats)/1e8).toFixed(8)+" BTC":"value pending"}`);tip.hidden=false}
  function loading(tip,item){tile(tip,item);const br=D.createElement("br");tip.append(br);add(tip,"loading full transaction reader…")}
  function analysis(tip,a){title(tip,`${String(a?.txid||"").slice(0,20)}… · pinned`);const lines=[`${num(a?.feeRate,2)} sat/vB · ${int(a?.vsize)} vB · ${int(a?.feeSats)} sats fee`,`${Number.isFinite(finite(a?.valueSats))?(finite(a.valueSats)/1e8).toFixed(8)+" BTC output":"value unavailable"} · ${int(a?.inputs)} in / ${int(a?.outputs)} out`,`${a?.segwit?"SegWit":"legacy/unknown"} · ${a?.rbf?"RBF":"final sequence"}${a?.opReturn?` · ${a.opReturn} OP_RETURN`:""}`,a?.confirmed?`confirmed${Number.isFinite(finite(a?.blockHeight))?` @ ${int(a.blockHeight)}`:""}${a?.confirmations?` · ${int(a.confirmations)} conf`:""}`:"unconfirmed"];lines.forEach((line,i)=>{if(i)tip.append(D.createElement("br"));add(tip,line)});tip.hidden=false}
  function error(tip,txid,error){title(tip,`${String(txid||"").slice(0,20)}… · reader error`);add(tip,String(error?.message||error||"transaction unavailable"));tip.hidden=false}
  W.ZZXMempoolMosaicInspector=Object.freeze({__version:2,tile,loading,analysis,error});
})();

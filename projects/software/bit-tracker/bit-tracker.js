(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const DEFAULT="https://mempool.space/api";
  const state={
    api:localStorage.getItem("zzx-bit-tracker-api")||DEFAULT,
    watch:JSON.parse(localStorage.getItem("zzx-bit-tracker-watch")||"[]"),
    audit:JSON.parse(localStorage.getItem("zzx-bit-tracker-audit")||"[]"),
    selectedId:null
  };

  function uid(){return crypto.randomUUID?crypto.randomUUID():`bt-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
  function sats(n){return `${Math.round(Number(n)||0).toLocaleString()} sats`;}
  function selected(){return state.watch.find(x=>x.id===state.selectedId)||null;}
  function persist(){localStorage.setItem("zzx-bit-tracker-watch",JSON.stringify(state.watch));localStorage.setItem("zzx-bit-tracker-audit",JSON.stringify(state.audit.slice(-2000)));}
  function audit(type,detail={}){state.audit.push({at:new Date().toISOString(),type,...detail});if(state.audit.length>2000)state.audit=state.audit.slice(-2000);persist();renderAudit();}
  function setNet(text,kind){const e=$("tracker-net");e.textContent=text;e.className=`runtime-badge ${kind}`;}
  function download(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function addWatch() {
    const address=$("watch-address").value.trim();
    if(!BitTrackerCore.validateAddress(address))throw new Error("Address format is not recognized as a Bitcoin mainnet address.");
    if(state.watch.some(x=>x.address===address))throw new Error("Address already exists in watchlist.");
    const item={id:uid(),address,label:$("watch-label").value.trim()||"watch",category:$("watch-category").value.trim()||"",notes:$("watch-notes").value.trim(),summary:null,utxos:[],updatedAt:null};
    state.watch.push(item);state.selectedId=item.id;persist();audit("watch-add",{address:item.address,label:item.label});renderAll();
  }

  async function refreshItem(item) {
    setNet("NETWORK: FETCHING","partial");
    try {
      const [summary,utxos]=await Promise.all([
        BitTrackerCore.fetchJson(state.api,`/address/${encodeURIComponent(item.address)}`),
        BitTrackerCore.fetchJson(state.api,`/address/${encodeURIComponent(item.address)}/utxo`)
      ]);
      item.summary=summary;item.utxos=utxos;item.updatedAt=new Date().toISOString();
      persist();audit("address-refresh",{address:item.address,utxos:utxos.length});setNet("NETWORK: OK","ok");renderAll();return item;
    } catch(e){setNet("NETWORK: ERROR","bad");audit("address-error",{address:item.address,error:e.message});throw e;}
  }

  async function refreshSelected(){const item=selected();if(!item)throw new Error("Select an address.");return refreshItem(item);}
  async function refreshAll(){for(const item of state.watch){try{await refreshItem(item);}catch(e){console.error(item.address,e);}}}

  function renderWatch() {
    const root=$("watch-list");root.replaceChildren();
    let funded=0,spent=0,balance=0;
    for(const item of state.watch) {
      if(item.summary){const b=BitTrackerCore.addressBalance(item.summary);funded+=b.funded;spent+=b.spent;balance+=b.balance;}
      const el=document.createElement("article");el.className=`z-list-item ${item.id===state.selectedId?"active":""}`;
      const h=document.createElement("strong");h.textContent=`${item.label} · ${item.address}`;
      const p=document.createElement("p");const b=item.summary?BitTrackerCore.addressBalance(item.summary):null;p.textContent=`${item.category||"uncategorized"} · ${b?sats(b.balance):"not refreshed"} · ${item.notes||"no notes"}`;
      const row=document.createElement("div");row.className="button-row";row.style.justifyContent="flex-start";
      const sel=document.createElement("button");sel.className="btn ghost";sel.type="button";sel.textContent="SELECT";sel.addEventListener("click",()=>{state.selectedId=item.id;renderAll();});
      const ref=document.createElement("button");ref.className="btn ghost";ref.type="button";ref.textContent="REFRESH";ref.addEventListener("click",()=>refreshItem(item).catch(e=>alert(e.message)));
      const rem=document.createElement("button");rem.className="btn ghost";rem.type="button";rem.textContent="REMOVE";rem.addEventListener("click",()=>{state.watch=state.watch.filter(x=>x.id!==item.id);if(state.selectedId===item.id)state.selectedId=state.watch[0]?.id||null;audit("watch-remove",{address:item.address});persist();renderAll();});
      row.append(sel,ref,rem);el.append(h,p,row);root.appendChild(el);
    }
    if(!state.watch.length)root.innerHTML='<div class="z-list-item"><p>No tracked addresses.</p></div>';
    $("watch-count").textContent=state.watch.length;$("watch-funded").textContent=sats(funded);$("watch-spent").textContent=sats(spent);$("watch-balance").textContent=sats(balance);
  }

  function renderSelected() {
    const item=selected(),s=item?.summary;
    if(!item||!s){$("addr-funded").textContent=$("addr-spent").textContent=$("addr-txs").textContent=$("addr-balance").textContent="—";$("address-output").textContent=item?"Selected address has not been refreshed.":"Select an address.";renderUtxos();return;}
    const cs=s.chain_stats||{},b=BitTrackerCore.addressBalance(s);
    $("addr-funded").textContent=sats(cs.funded_txo_sum);$("addr-spent").textContent=sats(cs.spent_txo_sum);$("addr-txs").textContent=Number(cs.tx_count||0).toLocaleString();$("addr-balance").textContent=sats(b.balance);$("address-output").textContent=JSON.stringify({address:item.address,label:item.label,notes:item.notes,updatedAt:item.updatedAt,summary:s},null,2);renderUtxos();
  }

  function renderUtxos() {
    const item=selected(),utxos=item?.utxos||[],body=$("utxo-body");body.replaceChildren();
    let total=0,confirmed=0,unconfirmed=0;
    for(const u of utxos){total+=Number(u.value)||0;if(u.status?.confirmed)confirmed++;else unconfirmed++;const tr=document.createElement("tr");[`${u.txid}:${u.vout}`,sats(u.value),u.status?.confirmed?"confirmed":"unconfirmed",u.status?.block_height??"—"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}
    if(!utxos.length)body.innerHTML='<tr><td colspan="4" class="muted">No UTXOs loaded.</td></tr>';
    $("utxo-count").textContent=utxos.length;$("utxo-total").textContent=sats(total);$("utxo-confirmed").textContent=confirmed;$("utxo-unconfirmed").textContent=unconfirmed;
  }

  async function lookupTx() {
    const txid=$("tx-id").value.trim();
    if(!BitTrackerCore.validateTxid(txid))throw new Error("TXID must be 64 hexadecimal characters.");
    setNet("NETWORK: FETCHING","partial");
    try {
      const tx=await BitTrackerCore.fetchJson(state.api,`/tx/${txid}`);
      $("tx-output").textContent=JSON.stringify(tx,null,2);
      audit("tx-lookup",{txid,status:tx.status?.confirmed?"confirmed":"unconfirmed"});
      setNet("NETWORK: OK","ok");
      return tx;
    } catch(e){setNet("NETWORK: ERROR","bad");audit("tx-error",{txid,error:e.message});throw e;}
  }

  function renderAudit(){$("audit-output").textContent=JSON.stringify(state.audit.slice().reverse(),null,2);}

  function exportCsv() {
    const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const rows=["timestamp,type,address,txid,label,error"];
    for(const a of state.audit)rows.push([a.at,a.type,a.address,a.txid,a.label,a.error].map(q).join(","));
    download(rows.join("\n")+"\n",`bit-tracker-audit-${Date.now()}.csv`,"text/csv");
  }

  $("source-api").value=state.api;$("source-output").textContent=JSON.stringify({api:state.api,watchlistEntries:state.watch.length},null,2);
  if(!state.selectedId&&state.watch.length)state.selectedId=state.watch[0].id;

  $("watch-add").addEventListener("click",()=>{try{addWatch();}catch(e){alert(e.message);}});
  $("watch-refresh-all").addEventListener("click",()=>refreshAll());
  $("address-refresh").addEventListener("click",()=>refreshSelected().catch(e=>$("address-output").textContent=`ERROR: ${e.message}`));
  $("tx-lookup").addEventListener("click",()=>lookupTx().catch(e=>$("tx-output").textContent=`ERROR: ${e.message}`));
  $("audit-export-json").addEventListener("click",()=>download(JSON.stringify({schema:"zzx.bit-tracker.audit.v1",exportedAt:new Date().toISOString(),watchlist:state.watch.map(({utxos,...x})=>x),events:state.audit},null,2),`bit-tracker-audit-${Date.now()}.json`,"application/json"));
  $("audit-export-csv").addEventListener("click",exportCsv);
  $("audit-clear").addEventListener("click",()=>{state.audit=[];persist();renderAudit();});
  $("source-save").addEventListener("click",()=>{state.api=$("source-api").value.trim().replace(/\/+$/,"")||DEFAULT;localStorage.setItem("zzx-bit-tracker-api",state.api);audit("source-change",{api:state.api});$("source-output").textContent=JSON.stringify({api:state.api,watchlistEntries:state.watch.length},null,2);});
  $("source-reset").addEventListener("click",()=>{state.api=DEFAULT;$("source-api").value=DEFAULT;localStorage.removeItem("zzx-bit-tracker-api");audit("source-reset",{api:state.api});$("source-output").textContent=JSON.stringify({api:state.api,watchlistEntries:state.watch.length},null,2);});

  function renderAll(){renderWatch();renderSelected();renderAudit();}
  renderAll();

  window.BitTracker=Object.freeze({
    version:"0.1.0-alpha-web",
    validateAddress:BitTrackerCore.validateAddress,
    add(address,label="watch",notes=""){if(!BitTrackerCore.validateAddress(address))throw new Error("Invalid address.");const item={id:uid(),address,label,category:"",notes,summary:null,utxos:[],updatedAt:null};state.watch.push(item);state.selectedId=item.id;persist();audit("watch-add",{address,label});renderAll();return item.id;},
    refreshAddress(address){const item=state.watch.find(x=>x.address===address);if(!item)throw new Error("Address not in watchlist.");return refreshItem(item);},
    lookupTx,
    getWatchlist(){return JSON.parse(JSON.stringify(state.watch));},
    getAudit(){return JSON.parse(JSON.stringify(state.audit));},
    getState(){return{api:state.api,tracked:state.watch.length,selectedId:state.selectedId};}
  });
  window.ZZXHooks?.emit("bit-tracker:ready",{version:"0.1.0-alpha-web"});
})();

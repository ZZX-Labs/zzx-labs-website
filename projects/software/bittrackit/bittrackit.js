(() => {
  "use strict";
  const $=id=>document.getElementById(id),DEFAULT="https://mempool.space/api",KEY="zzx-bittrackit-watch-v1";
  const state={api:localStorage.getItem("zzx-bittrackit-api")||DEFAULT,watch:JSON.parse(localStorage.getItem(KEY)||"[]"),selected:null,lastFees:null};
  function sats(n){return`${Math.round(+n||0).toLocaleString()} sats`;}
  function setNet(t,k){const e=$("bt-net");e.textContent=t;e.className=`runtime-badge ${k}`;}
  function save(){localStorage.setItem(KEY,JSON.stringify(state.watch));}
  function selected(){return state.watch.find(x=>x.id===state.selected)||null;}
  async function refreshItem(item){
    setNet("NETWORK: FETCHING","partial");
    const [summary,txs]=await Promise.all([BitTrackItCore.get(state.api,`/address/${encodeURIComponent(item.address)}`),BitTrackItCore.get(state.api,`/address/${encodeURIComponent(item.address)}/txs`)]);
    item.summary=summary;item.txs=txs;item.updatedAt=new Date().toISOString();save();setNet("NETWORK: OK","ok");render();return item;
  }
  async function refreshAll(){for(const x of state.watch){try{await refreshItem(x);}catch(e){console.error(e);}}}
  function add(){
    const address=$("pt-address").value.trim();if(!BitTrackItCore.validAddress(address))throw new Error("Unrecognized Bitcoin mainnet address.");if(state.watch.some(x=>x.address===address))throw new Error("Already tracked.");
    const item={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),address,label:$("pt-label").value.trim()||"wallet",group:$("pt-group").value.trim()||"default",summary:null,txs:[],updatedAt:null};state.watch.push(item);state.selected=item.id;save();render();
  }
  function render(){
    const root=$("pt-list");root.replaceChildren();let bal=0,txs=0,last=null;
    for(const item of state.watch){const b=item.summary?BitTrackItCore.balance(item.summary):null;if(b){bal+=b.balance;txs+=b.confirmedTxs;}if(item.updatedAt&&(!last||item.updatedAt>last))last=item.updatedAt;
      const e=document.createElement("article");e.className=`z-list-item ${item.id===state.selected?"active":""}`;const h=document.createElement("strong");h.textContent=`${item.label} · ${item.address}`;const p=document.createElement("p");p.textContent=`${item.group} · ${b?sats(b.balance):"not refreshed"}`;const row=document.createElement("div");row.className="button-row";row.style.justifyContent="flex-start";const s=document.createElement("button");s.className="btn ghost";s.textContent="SELECT";s.addEventListener("click",()=>{state.selected=item.id;render();});const r=document.createElement("button");r.className="btn ghost";r.textContent="REFRESH";r.addEventListener("click",()=>refreshItem(item).catch(e=>alert(e.message)));const d=document.createElement("button");d.className="btn ghost";d.textContent="REMOVE";d.addEventListener("click",()=>{state.watch=state.watch.filter(x=>x.id!==item.id);if(state.selected===item.id)state.selected=state.watch[0]?.id||null;save();render();});row.append(s,r,d);e.append(h,p,row);root.appendChild(e);}
    if(!state.watch.length)root.innerHTML='<div class="z-list-item"><p>No tracked addresses.</p></div>';
    $("pt-count").textContent=state.watch.length;$("pt-balance").textContent=sats(bal);$("pt-txs").textContent=txs.toLocaleString();$("pt-time").textContent=last?new Date(last).toLocaleTimeString():"—";
    renderSelected();
  }
  function renderSelected(){
    const x=selected();$("ad-output").textContent=x?JSON.stringify(x,null,2):"Select an address.";
    const body=$("ad-tx-body");body.replaceChildren();for(const tx of x?.txs||[]){const tr=document.createElement("tr");[tx.txid,tx.status?.confirmed?"confirmed":"mempool",tx.status?.block_height??"—",tx.fee??"—"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}if(!x?.txs?.length)body.innerHTML='<tr><td colspan="4">No transactions loaded.</td></tr>';
  }
  async function txLookup(id="txid"){const txid=$(id).value.trim();if(!BitTrackItCore.validTxid(txid))throw new Error("TXID must be 64 hex characters.");const tx=await BitTrackItCore.get(state.api,`/tx/${txid}`);$("tx-output").textContent=JSON.stringify(tx,null,2);return tx;}
  async function fees(){state.lastFees=await BitTrackItCore.get(state.api,"/v1/fees/recommended");const body=$("fee-body");body.replaceChildren();for(const [k,v] of Object.entries(state.lastFees)){const tr=document.createElement("tr");[k,v].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.appendChild(td);});body.appendChild(tr);}return state.lastFees;}
  function alerts(){
    const total=state.watch.reduce((s,x)=>s+(x.summary?BitTrackItCore.balance(x.summary).balance:0),0),arr=[],below=+$("al-below").value||0,above=+$("al-above").value||0,fee=+$("al-fee").value||50;
    if(below>0&&total<below)arr.push(`Portfolio balance ${total} sats is below ${below}.`);if(above>0&&total>above)arr.push(`Portfolio balance ${total} sats is above ${above}.`);if(state.lastFees?.fastestFee>=fee)arr.push(`Fast fee ${state.lastFees.fastestFee} sat/vB is at or above ${fee}.`);
    const root=$("al-list");root.replaceChildren();if(!arr.length)root.innerHTML='<div class="z-list-item"><strong>OK</strong><p>No thresholds exceeded.</p></div>';for(const m of arr){const e=document.createElement("article");e.className="z-list-item";e.innerHTML=`<strong>ALERT</strong><p></p>`;e.querySelector("p").textContent=m;root.appendChild(e);if("Notification" in window&&Notification.permission==="granted")new Notification("BitTrackIt",{body:m});}
  }
  async function forensic(){const txid=$("fx-txid").value.trim();if(!BitTrackItCore.validTxid(txid))throw new Error("Invalid TXID.");const tx=await BitTrackItCore.get(state.api,`/tx/${txid}`);$("fx-output").textContent=JSON.stringify(BitTrackItCore.trace(tx),null,2);}
  $("bt-api").value=state.api;$("bt-source-output").textContent=JSON.stringify({api:state.api},null,2);if(state.watch.length)state.selected=state.watch[0].id;
  $("pt-add").addEventListener("click",()=>{try{add();}catch(e){alert(e.message);}});$("pt-refresh").addEventListener("click",refreshAll);$("ad-refresh").addEventListener("click",()=>{const x=selected();if(x)refreshItem(x).catch(e=>$("ad-output").textContent=`ERROR: ${e.message}`);});$("tx-run").addEventListener("click",()=>txLookup().catch(e=>$("tx-output").textContent=`ERROR: ${e.message}`));$("fee-refresh").addEventListener("click",()=>fees().catch(e=>alert(e.message)));$("al-check").addEventListener("click",alerts);$("al-notify").addEventListener("click",async()=>{if("Notification" in window)await Notification.requestPermission();});$("fx-run").addEventListener("click",()=>forensic().catch(e=>$("fx-output").textContent=`ERROR: ${e.message}`));$("bt-save").addEventListener("click",()=>{state.api=$("bt-api").value.trim().replace(/\/+$/,"")||DEFAULT;localStorage.setItem("zzx-bittrackit-api",state.api);$("bt-source-output").textContent=JSON.stringify({api:state.api},null,2);});$("bt-reset").addEventListener("click",()=>{state.api=DEFAULT;$("bt-api").value=DEFAULT;localStorage.removeItem("zzx-bittrackit-api");$("bt-source-output").textContent=JSON.stringify({api:state.api},null,2);});
  render();
  window.BitTrackIt=Object.freeze({version:"0.2.0-alpha-web",add,refreshAll,lookupTx:txLookup,refreshFees:fees,trace:BitTrackItCore.trace,getState:()=>({api:state.api,watch:JSON.parse(JSON.stringify(state.watch)),fees:state.lastFees})});
  window.ZZXHooks?.emit("bittrackit:ready",{version:"0.2.0-alpha-web"});
})();

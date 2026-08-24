(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={tickets:[],anchor:null,lastDraw:null};

  function randomNonce(){const a=crypto.getRandomValues(new Uint8Array(24));return[...a].map(b=>b.toString(16).padStart(2,"0")).join("");}
  function nums(){return $("lt-numbers").value.split(",").map(x=>Number(x.trim())).filter(Number.isFinite);}
  function download(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  async function commit() {
    const label=$("lt-label").value.trim()||`ticket-${state.tickets.length+1}`,numbers=nums(),nonce=$("lt-nonce").value.trim();
    if(!numbers.length)throw new Error("Enter ticket numbers.");if(!nonce)throw new Error("Nonce required.");
    const c=await BitLottoCore.commitment(label,numbers,nonce);
    const ticket={label,numbers:[...numbers].sort((a,b)=>a-b),nonce,commitment:c.commitment};
    state.tickets.push(ticket);$("lt-ticket-output").textContent=JSON.stringify(ticket,null,2);renderTickets();
  }

  function renderTickets() {
    const root=$("lt-ticket-list");root.replaceChildren();
    if(!state.tickets.length){root.innerHTML='<div class="z-list-item"><p>No tickets committed.</p></div>';return;}
    for(const t of state.tickets){const e=document.createElement("article");e.className="z-list-item";const h=document.createElement("strong");h.textContent=`${t.label} · ${t.commitment.slice(0,16)}…`;const p=document.createElement("p");p.textContent=`numbers: ${t.numbers.join(", ")}`;e.append(h,p);root.appendChild(e);}
  }

  function setAnchor(hash,height) {
    const h=String(hash).trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(h))throw new Error("Block hash must be 64 hex characters.");
    state.anchor={height:Number(height),hash:h};$("la-output").textContent=JSON.stringify(state.anchor,null,2);
  }

  async function fetchAnchor() {
    const api=$("la-api").value.trim().replace(/\/+$/,""),height=Math.max(0,Number($("la-height").value)||0);
    const r=await fetch(`${api}/block-height/${height}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);setAnchor((await r.text()).trim(),height);$("la-hash").value=state.anchor.hash;
  }

  async function runDraw() {
    if(!state.anchor)throw new Error("Set a block anchor first.");if(!state.tickets.length)throw new Error("Add at least one commitment.");
    const min=Number($("ld-min").value),max=Number($("ld-max").value),count=Math.max(1,Number($("ld-count").value)||5);
    if(!(max>=min)||count>max-min+1)throw new Error("Invalid draw range/count.");
    const d=await BitLottoCore.draw({blockHash:state.anchor.hash,commitments:state.tickets.map(t=>t.commitment),count,min,max});
    state.lastDraw={schema:"zzx.bitlotto.draw.v1",createdAt:new Date().toISOString(),anchor:state.anchor,tickets:state.tickets.map(({nonce,...rest})=>rest),privateTicketData:state.tickets,parameters:{count,min,max},...d};
    $("ld-output").textContent=JSON.stringify(state.lastDraw,null,2);$("lv-json").value=JSON.stringify(state.lastDraw,null,2);return state.lastDraw;
  }

  async function verify() {
    const v=JSON.parse($("lv-json").value);if(v.schema!=="zzx.bitlotto.draw.v1")throw new Error("Unsupported draw archive.");
    const d=await BitLottoCore.draw({blockHash:v.anchor.hash,commitments:v.tickets.map(t=>t.commitment),count:v.parameters.count,min:v.parameters.min,max:v.parameters.max});
    const ok=JSON.stringify(d.result)===JSON.stringify(v.result)&&d.seed===v.seed;
    $("lv-output").textContent=JSON.stringify({valid:ok,recomputedSeed:d.seed,recomputedResult:d.result,archivedResult:v.result},null,2);
  }

  $("lt-random-nonce").addEventListener("click",()=>{$("lt-nonce").value=randomNonce();});
  $("lt-commit").addEventListener("click",()=>commit().catch(e=>$("lt-ticket-output").textContent=`ERROR: ${e.message}`));
  $("la-set").addEventListener("click",()=>{try{setAnchor($("la-hash").value,$("la-height").value);}catch(e){$("la-output").textContent=`ERROR: ${e.message}`;}});
  $("la-fetch").addEventListener("click",()=>fetchAnchor().catch(e=>$("la-output").textContent=`ERROR: ${e.message}`));
  $("ld-run").addEventListener("click",()=>runDraw().catch(e=>$("ld-output").textContent=`ERROR: ${e.message}`));
  $("lv-run").addEventListener("click",()=>verify().catch(e=>$("lv-output").textContent=`ERROR: ${e.message}`));
  $("lx-export").addEventListener("click",()=>{if(!state.lastDraw)throw new Error("Run a draw first.");download(JSON.stringify(state.lastDraw,null,2),`bitlotto-draw-${Date.now()}.json`);});
  $("lx-clear").addEventListener("click",()=>{state.tickets=[];state.anchor=null;state.lastDraw=null;renderTickets();$("lx-output").textContent="Session cleared.";});
  $("lt-nonce").value=randomNonce();renderTickets();

  window.BitLotto=Object.freeze({version:"0.3.0-alpha-web",commitment:BitLottoCore.commitment,draw:BitLottoCore.draw,getState:()=>({tickets:state.tickets.length,anchor:state.anchor,lastDraw:state.lastDraw})});
  window.ZZXHooks?.emit("bitlotto:ready",{version:"0.3.0-alpha-web"});
})();

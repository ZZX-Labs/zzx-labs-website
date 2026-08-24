(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={bytes:null,fileName:null,blocks:[],markers:{blocks:{},transactions:{},outpoints:{},addresses:{}},archive:""};

function download(content,name,type){
  const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function markerFor(kind,key){
  const obj=state.markers?.[kind]||{};
  return obj[key]??null;
}
function fmtTime(t){try{return new Date(t*1000).toISOString();}catch{return String(t);}}

async function parse(){
  if(!state.bytes)throw new Error("Select a block file first.");
  $("bd-output").textContent="Parsing locally…";
  state.blocks=await BitcoinBlockParser.parseInput(state.bytes,{
    format:$("bd-format").value,
    magicHex:$("bd-magic").value,
    maxBlocks:Math.max(1,Math.min(10000,+$("bd-max").value||64))
  });
  render();
  $("bd-output").textContent=JSON.stringify({
    file:state.fileName,
    bytes:state.bytes.length,
    blocks:state.blocks.length,
    transactions:state.blocks.reduce((s,b)=>s+b.transactions.length,0),
    parsedAt:new Date().toISOString()
  },null,2);
}
function render(){
  $("bd-bytes").textContent=(state.bytes?.length||0).toLocaleString();
  $("bd-blocks").textContent=state.blocks.length;
  $("bd-txs").textContent=state.blocks.reduce((s,b)=>s+b.transactions.length,0);
  $("bd-opret").textContent=state.blocks.reduce((s,b)=>s+b.transactions.reduce((q,t)=>q+t.vout.filter(o=>o.opReturn).length,0),0);

  const bb=$("bb-body");bb.replaceChildren();
  const sel=$("bt-block");sel.replaceChildren();

  state.blocks.forEach((b,i)=>{
    const tr=document.createElement("tr");
    [i,b.hash,b.version,fmtTime(b.time),b.bits,b.nonce,b.txCount].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
    bb.appendChild(tr);
    const o=document.createElement("option");o.value=i;o.textContent=`#${i} · ${b.hash.slice(0,18)}…`;sel.appendChild(o);
  });
  if(!state.blocks.length)bb.innerHTML='<tr><td colspan="7">No parsed blocks.</td></tr>';

  renderTransactions();
  renderOpReturns();
}
function renderTransactions(){
  const idx=+$("bt-block").value||0,b=state.blocks[idx],root=$("bt-list");
  root.replaceChildren();$("bt-detail").textContent="";
  if(!b){root.innerHTML='<div class="z-list-item"><p>No block selected.</p></div>';return;}
  b.transactions.forEach((tx,i)=>{
    const e=document.createElement("article");e.className="z-list-item";
    const h=document.createElement("strong");h.textContent=`TX ${i} · ${tx.txid}`;
    const p=document.createElement("p");p.textContent=`vin ${tx.vin.length} · vout ${tx.vout.length} · ${tx.vsize} vB · ${tx.segwit?"SegWit":"legacy"}${markerFor("transactions",tx.txid)?` · marker: ${JSON.stringify(markerFor("transactions",tx.txid))}`:""}`;
    const btn=document.createElement("button");btn.className="btn ghost";btn.textContent="DETAIL";btn.addEventListener("click",()=>{$("bt-detail").textContent=JSON.stringify({...tx,rawHex:`${tx.rawHex.slice(0,1000)}${tx.rawHex.length>1000?"…":""}`},null,2);});
    e.append(h,p,btn);root.appendChild(e);
  });
}
function renderOpReturns(){
  const body=$("bo-body");body.replaceChildren();
  for(const b of state.blocks){
    for(const tx of b.transactions){
      tx.vout.forEach(o=>{
        if(!o.opReturn)return;
        const tr=document.createElement("tr");
        [b.hash.slice(0,20)+"…",tx.txid,o.n,o.opReturn.hex,o.opReturn.text||""].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
        body.appendChild(tr);
      });
    }
  }
  if(!body.children.length)body.innerHTML='<tr><td colspan="5">No OP_RETURN outputs.</td></tr>';
}
function applyMarkers(){
  const j=JSON.parse($("mk-json").value);
  state.markers={blocks:j.blocks||{},transactions:j.transactions||{},outpoints:j.outpoints||{},addresses:j.addresses||{}};
  $("mk-output").textContent=JSON.stringify({
    blocks:Object.keys(state.markers.blocks).length,
    transactions:Object.keys(state.markers.transactions).length,
    outpoints:Object.keys(state.markers.outpoints).length,
    addresses:Object.keys(state.markers.addresses).length
  },null,2);
  render();
}
function textArchive(){
  const lines=[];
  lines.push("blk2txt deterministic archive");
  lines.push(`source: ${state.fileName||"unknown"}`);
  lines.push(`blocks: ${state.blocks.length}`);
  lines.push("");
  state.blocks.forEach((b,bi)=>{
    lines.push(`================================================================`);
    lines.push(`BLOCK ${bi}`);
    lines.push(`hash: ${b.hash}`);
    lines.push(`version: ${b.version}`);
    lines.push(`prev_block: ${b.prevBlock}`);
    lines.push(`merkle_root: ${b.merkleRoot}`);
    lines.push(`time: ${b.time} (${fmtTime(b.time)})`);
    lines.push(`bits: ${b.bits}`);
    lines.push(`nonce: ${b.nonce}`);
    lines.push(`transactions: ${b.transactions.length}`);
    const bm=markerFor("blocks",b.hash); if(bm)lines.push(`marker: ${JSON.stringify(bm)}`);
    lines.push("");
    b.transactions.forEach((tx,ti)=>{
      lines.push(`  TX ${ti}`);
      lines.push(`  txid: ${tx.txid}`);
      lines.push(`  wtxid: ${tx.wtxid}`);
      lines.push(`  version: ${tx.version}`);
      lines.push(`  segwit: ${tx.segwit}`);
      lines.push(`  size: ${tx.size}`);
      lines.push(`  vsize: ${tx.vsize}`);
      lines.push(`  weight: ${tx.weight}`);
      const tm=markerFor("transactions",tx.txid);if(tm)lines.push(`  marker: ${JSON.stringify(tm)}`);
      lines.push(`  inputs:`);
      tx.vin.forEach((v,i)=>{
        lines.push(`    [${i}] ${v.prevTxid}:${v.vout}`);
        lines.push(`      scriptSig: ${v.scriptSig}`);
        lines.push(`      sequence: ${v.sequence}`);
        if(v.witness.length){lines.push(`      witness:`);v.witness.forEach((w,j)=>lines.push(`        [${j}] ${w}`));}
        const om=markerFor("outpoints",`${v.prevTxid}:${v.vout}`);if(om)lines.push(`      outpoint_marker: ${JSON.stringify(om)}`);
      });
      lines.push(`  outputs:`);
      tx.vout.forEach(o=>{
        lines.push(`    [${o.n}] ${o.valueSats} sats (${o.valueBTC} BTC)`);
        lines.push(`      type: ${o.scriptType}`);
        lines.push(`      scriptPubKey: ${o.scriptPubKey}`);
        if(o.opReturn){lines.push(`      OP_RETURN hex: ${o.opReturn.hex}`);if(o.opReturn.text)lines.push(`      OP_RETURN text: ${o.opReturn.text}`);}
      });
      lines.push(`  locktime: ${tx.locktime}`);
      lines.push("");
    });
  });
  state.archive=lines.join("\n")+"\n";
  $("ba-text").value=state.archive;
  return state.archive;
}

$("bd-file").addEventListener("change",async()=>{
  const f=$("bd-file").files?.[0];if(!f)return;
  state.bytes=new Uint8Array(await f.arrayBuffer());state.fileName=f.name;
  $("bd-bytes").textContent=state.bytes.length.toLocaleString();
  $("bd-output").textContent=`Loaded ${f.name} (${f.size.toLocaleString()} bytes).`;
});
$("bd-run").addEventListener("click",()=>parse().catch(e=>$("bd-output").textContent=`ERROR: ${e.message}`));
$("bd-clear").addEventListener("click",()=>{state.bytes=null;state.fileName=null;state.blocks=[];render();$("bd-output").textContent="Cleared.";});
$("bt-block").addEventListener("change",renderTransactions);
$("mk-file").addEventListener("change",async()=>{const f=$("mk-file").files?.[0];if(!f)return;$("mk-json").value=await f.text();try{applyMarkers();}catch(e){$("mk-output").textContent=`ERROR: ${e.message}`;}});
$("mk-apply").addEventListener("click",()=>{try{applyMarkers();}catch(e){$("mk-output").textContent=`ERROR: ${e.message}`;}});
$("mk-clear").addEventListener("click",()=>{state.markers={blocks:{},transactions:{},outpoints:{},addresses:{}};$("mk-json").value=JSON.stringify(state.markers,null,2);render();});
$("ba-generate").addEventListener("click",textArchive);
$("ba-download").addEventListener("click",()=>download(state.archive||textArchive(),`${(state.fileName||"block").replace(/[^\w.-]+/g,"_")}.txt`,"text/plain"));
$("ba-json").addEventListener("click",()=>download(JSON.stringify({schema:"zzx.blk2txt.archive.v1",source:state.fileName,blocks:state.blocks,markers:state.markers},null,2),`${(state.fileName||"block").replace(/[^\w.-]+/g,"_")}.json`,"application/json"));
render();

window.blk2txt=Object.freeze({
  version:"0.1.0-alpha-web",
  parseRawBlock:BitcoinBlockParser.parseBlock,
  parseInput:BitcoinBlockParser.parseInput,
  getBlocks:()=>state.blocks,
  generateText:textArchive
});
window.ZZXHooks?.emit("blk2txt:ready",{version:"0.1.0-alpha-web"});
})();

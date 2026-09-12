// __partials/widgets/mempool-tiles/js/inspector.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesInspector?.__version>=1)return;

  function text(value,fallback="—"){
    return value==null||value===""?fallback:String(value);
  }

  function num(value,digits=2){
    const n=Number(value);
    return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):"—";
  }

  function btc(value){
    const n=Number(value);
    return Number.isFinite(n)?`${n.toFixed(n>=1?8:8)} BTC`:"—";
  }

  function usd(value){
    const n=Number(value);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n)
      : "—";
  }

  function sats(value){
    const n=Number(value);
    return Number.isFinite(n)?`${Math.round(n).toLocaleString()} sat`:"—";
  }

  function date(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n<=0)return "—";
    const ms=n<1e12?n*1000:n;
    try{return new Date(ms).toISOString()}
    catch(_){return "—"}
  }

  function escapeHtml(value){
    return String(value??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ioList(rows,{input=false}={}){
    if(!Array.isArray(rows)||!rows.length){
      return '<div class="mt-data-row">none</div>';
    }

    return `<div class="mt-io-list">${
      rows.map((row,index)=>{
        const prev=input?row?.prevout:row;
        const address=prev?.scriptpubkey_address||"(no address)";
        const value=Number(prev?.value);
        const type=prev?.scriptpubkey_type||"unknown";
        const extra=input
          ? ` · seq ${text(row?.sequence)}`
          : "";

        return `
          <div class="mt-io-row">
            <span class="mt-io-index">#${index}</span>
            <span class="mt-io-main">${escapeHtml(address)}<br>${escapeHtml(type)}${escapeHtml(extra)}</span>
            <span class="mt-io-value">${Number.isFinite(value)?sats(value):"—"}</span>
          </div>
        `;
      }).join("")
    }</div>`;
  }

  function kv(label,value){
    return `
      <div class="mt-kv">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  function render(root,analysis){
    const empty=root.querySelector("[data-mt-inspector-empty]");
    const body=root.querySelector("[data-mt-inspector-body]");

    empty.hidden=true;
    body.hidden=false;

    root.querySelector("[data-mt-inspector-title]").textContent=
      analysis.txid||"Transaction";

    const c=analysis.classification||{};

    const fields=[
      ["TXID",analysis.txid],
      ["Hash",analysis.hash],
      ["wTXID",analysis.wtxid||"—"],
      ["Type",c.kind||"—"],
      ["Status",analysis.confirmed?"confirmed":"mempool / unconfirmed"],
      ["Confirmations",num(analysis.confirmations,0)],
      ["vSize",Number.isFinite(analysis.vsize)?`${num(analysis.vsize,2)} vB`:"—"],
      ["Size",Number.isFinite(analysis.size)?`${num(analysis.size,0)} B`:"—"],
      ["Weight",Number.isFinite(analysis.weight)?`${num(analysis.weight,0)} WU`:"—"],
      ["Fee",sats(analysis.feeSats)],
      ["Fee rate",Number.isFinite(analysis.feeRate)?`${num(analysis.feeRate,3)} sat/vB`:"—"],
      ["Fee USD",usd(analysis.feeUsd)],
      ["Output value",btc(analysis.outputBtc)],
      ["Output USD",usd(analysis.outputUsd)],
      ["Inputs",num(analysis.inputs,0)],
      ["Outputs",num(analysis.outputs,0)],
      ["RBF",c.rbf?"yes":"no"],
      ["SegWit",c.segwit?"yes":"no"],
      ["Taproot",c.taproot?"yes":"no"],
      ["Version",num(analysis.version,0)],
      ["Locktime",num(analysis.locktime,0)],
      ["Raw bytes",num(analysis.rawBytes,0)],
      ["Block height",num(analysis.blockHeight,0)],
      ["Block hash",analysis.blockHash||"—"]
    ];

    root.querySelector("[data-mt-kv-grid]").innerHTML=
      fields.map(([label,value])=>kv(label,text(value))).join("");

    root.querySelector("[data-mt-inputs]").innerHTML=
      ioList(analysis.tx?.vin,{input:true});

    root.querySelector("[data-mt-outputs]").innerHTML=
      ioList(analysis.tx?.vout,{input:false});

    const opret=c.opReturns||[];
    root.querySelector("[data-mt-opreturn]").innerHTML=
      opret.length
        ? opret.map(row=>`
            <div class="mt-data-row">
              output #${row.index}<br>
              UTF-8: ${escapeHtml(row.utf8||"(not printable)")}<br>
              data hex: ${escapeHtml(row.dataHex||"—")}<br>
              script: ${escapeHtml(row.asm||row.scriptHex||"—")}
            </div>
          `).join("")
        : '<div class="mt-data-row">No OP_RETURN outputs detected.</div>';

    const block=analysis.block||{};
    const blockRows=[
      ["confirmed",analysis.confirmed?"yes":"no"],
      ["confirmations",analysis.confirmations],
      ["height",analysis.blockHeight],
      ["hash",analysis.blockHash],
      ["time",date(analysis.blockTime)],
      ["version",block.version],
      ["merkle_root",block.merkle_root],
      ["bits",block.bits],
      ["nonce",block.nonce],
      ["difficulty",block.difficulty],
      ["size",block.size],
      ["weight",block.weight],
      ["tx_count",block.tx_count]
    ];

    root.querySelector("[data-mt-block]").innerHTML=
      `<div class="mt-io-list">${
        blockRows.map(([label,value])=>`
          <div class="mt-io-row">
            <span class="mt-io-index">${escapeHtml(label)}</span>
            <span class="mt-io-main">${escapeHtml(text(value))}</span>
            <span></span>
          </div>
        `).join("")
      }</div>`;

    root.querySelector("[data-mt-raw-json]").textContent=
      JSON.stringify(analysis.tx,null,2);

    root.querySelector("[data-mt-raw-hex]").textContent=
      analysis.rawHex||"raw transaction hex unavailable";
  }

  function loading(root,txid){
    root.querySelector("[data-mt-inspector-empty]").hidden=true;
    const body=root.querySelector("[data-mt-inspector-body]");
    body.hidden=false;

    root.querySelector("[data-mt-inspector-title]").textContent=txid;
    root.querySelector("[data-mt-kv-grid]").innerHTML=
      kv("Status","loading full transaction…");

    for(const selector of [
      "[data-mt-inputs]",
      "[data-mt-outputs]",
      "[data-mt-opreturn]",
      "[data-mt-block]"
    ]){
      root.querySelector(selector).innerHTML="";
    }

    root.querySelector("[data-mt-raw-json]").textContent="";
    root.querySelector("[data-mt-raw-hex]").textContent="";
  }

  function clear(root){
    root.querySelector("[data-mt-inspector-empty]").hidden=false;
    root.querySelector("[data-mt-inspector-body]").hidden=true;
  }

  W.ZZXMempoolTilesInspector=Object.freeze({
    __version:1,
    render,
    loading,
    clear
  });
})();

(function(){
  "use strict";

  const W=window;
  const D=document;
  if(W.ZZXMempoolMosaicInspector?.__version>=3)return;

  const text=(value,fallback="—")=>value==null||value===""?fallback:String(value);
  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};
  const num=(value,digits=2)=>Number.isFinite(finite(value))
    ? finite(value).toLocaleString(undefined,{maximumFractionDigits:digits}):"—";
  const sats=value=>Number.isFinite(finite(value))?`${Math.round(finite(value)).toLocaleString()} sat`:"—";
  const btcSats=value=>Number.isFinite(finite(value))
    ? `${(finite(value)/1e8).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:8})} BTC`:"—";
  const btc=value=>Number.isFinite(finite(value))
    ? `${finite(value).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:8})} BTC`:"—";
  const usd=value=>Number.isFinite(finite(value))
    ? new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(finite(value)):"—";

  function date(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<=0)return "—";
    const ms=n<1e12?n*1000:n;
    try{return new Date(ms).toISOString()}catch(_){return "—"}
  }

  function ago(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<=0)return "unknown time";
    const seconds=Math.max(0,Math.round((Date.now()-n)/1000));
    if(seconds<60)return `${seconds}s ago`;
    if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;
    if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;
    return `${Math.floor(seconds/86400)}d ago`;
  }

  function escapeHtml(value){
    return String(value??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  const kv=(label,value)=>`<div class="mm-kv"><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`;

  function inputList(rows){
    if(!Array.isArray(rows)||!rows.length)return '<div class="mm-data-row">No inputs.</div>';
    return `<div class="mm-io-list">${rows.map((row,index)=>{
      const prev=row?.prevout||{};
      const source=row?.is_coinbase?"coinbase":`${text(row?.txid)}:${text(row?.vout)}`;
      const address=prev?.scriptpubkey_address||"(no decoded address)";
      const witness=Array.isArray(row?.witness)?row.witness.length:0;
      const script=String(row?.scriptsig||"");
      return `<div class="mm-io-row">
        <span class="mm-io-index">#${index}</span>
        <span class="mm-io-main"><code>${escapeHtml(source)}</code><br>${escapeHtml(address)}<br>${escapeHtml(prev?.scriptpubkey_type||"unknown")} · sequence ${escapeHtml(text(row?.sequence))} · witness ${witness} item${witness===1?"":"s"}${script?` · scriptSig ${escapeHtml(script)}`:""}</span>
        <span class="mm-io-value">${row?.is_coinbase?"new issuance":sats(prev?.value)}</span>
      </div>`;
    }).join("")}</div>`;
  }

  function outputList(rows,outspends){
    if(!Array.isArray(rows)||!rows.length)return '<div class="mm-data-row">No outputs.</div>';
    return `<div class="mm-io-list">${rows.map((row,index)=>{
      const spend=outspends?.[index]||{};
      const address=row?.scriptpubkey_address||"(no decoded address)";
      const state=spend?.spent
        ? `spent by ${text(spend.txid)}:${text(spend.vin)}`
        : "unspent at capture";
      return `<div class="mm-io-row">
        <span class="mm-io-index">#${index}</span>
        <span class="mm-io-main">${escapeHtml(address)}<br>${escapeHtml(row?.scriptpubkey_type||"unknown")} · script ${escapeHtml(row?.scriptpubkey||"—")}<span class="mm-io-spend">${escapeHtml(state)}${spend?.status?.confirmed?` · confirmed #${escapeHtml(spend.status.block_height)}`:""}</span></span>
        <span class="mm-io-value">${sats(row?.value)}</span>
      </div>`;
    }).join("")}</div>`;
  }

  function scriptSummary(analysis){
    const classification=analysis.classification||{};
    const types=classification.types||{inputs:{},outputs:{}};
    const inputTypes=Object.entries(types.inputs||{}).map(([kind,count])=>`${kind}: ${count}`).join(" · ")||"none";
    const outputTypes=Object.entries(types.outputs||{}).map(([kind,count])=>`${kind}: ${count}`).join(" · ")||"none";
    return `<div class="mm-data-grid">
      <div class="mm-data-row"><strong>Input script classes</strong><br>${escapeHtml(inputTypes)}</div>
      <div class="mm-data-row"><strong>Output script classes</strong><br>${escapeHtml(outputTypes)}</div>
      <div class="mm-data-row"><strong>Address surface</strong><br>${num(analysis.uniqueInputAddresses,0)} unique input · ${num(analysis.uniqueOutputAddresses,0)} unique output</div>
      <div class="mm-data-row"><strong>Witness surface</strong><br>${num(analysis.witnessItems,0)} stack items · ${num(analysis.witnessBytes,0)} decoded bytes</div>
    </div>`;
  }

  function opReturnList(rows){
    return Array.isArray(rows)&&rows.length
      ? rows.map(row=>`<div class="mm-data-row"><strong>OP_RETURN output #${row.index}</strong><br>UTF-8: ${escapeHtml(row.utf8||"(not printable)")}<br>data hex: ${escapeHtml(row.dataHex||"—")}<br>script: ${escapeHtml(row.asm||row.scriptHex||"—")}</div>`).join("")
      : '<div class="mm-data-row">No OP_RETURN outputs detected.</div>';
  }

  function blockDetails(analysis){
    const block=analysis.block||{};
    const proof=analysis.merkleProof||{};
    const rows=[
      ["confirmed",analysis.confirmed?"yes":"no"],
      ["confirmations",analysis.confirmations],
      ["block height",analysis.blockHeight],
      ["block hash",analysis.blockHash],
      ["block time",date(analysis.blockTime)],
      ["Merkle position",proof.pos],
      ["Merkle branch nodes",Array.isArray(proof.merkle)?proof.merkle.length:"—"],
      ["block version",block.version],
      ["Merkle root",block.merkle_root],
      ["bits",block.bits],
      ["nonce",block.nonce],
      ["difficulty",block.difficulty],
      ["block size",block.size],
      ["block weight",block.weight],
      ["block TX count",block.tx_count]
    ];
    return `<div class="mm-io-list">${rows.map(([label,value])=>`<div class="mm-io-row"><span class="mm-io-index">${escapeHtml(label)}</span><span class="mm-io-main">${escapeHtml(text(value))}</span><span></span></div>`).join("")}</div>`;
  }

  function setState(root,label){
    const node=root.querySelector("[data-mm-inspector-state]");
    if(node)node.textContent=label;
  }

  function render(root,analysis,{persisted=false}={}){
    root.querySelector("[data-mm-inspector-empty]").hidden=true;
    root.querySelector("[data-mm-inspector-body]").hidden=false;
    root.querySelector("[data-mm-inspector-title]").textContent=analysis.txid||"Transaction";
    setState(root,persisted?`PERSISTED CAPTURE · ${date(analysis.capturedAt)}`:"LIVE TRANSACTION READER");

    const classification=analysis.classification||{};
    const fields=[
      ["TXID",analysis.txid],
      ["Hash",analysis.hash],
      ["wTXID",analysis.wtxid||"—"],
      ["Classification",classification.kind||"—"],
      ["Chain state",analysis.confirmed?"confirmed":"mempool / unconfirmed"],
      ["Confirmations",num(analysis.confirmations,0)],
      ["Projected rank",Number.isFinite(finite(analysis.projectedRank))?`#${num(analysis.projectedRank+1,0)}`:"—"],
      ["First seen",date(analysis.firstSeen)],
      ["vSize",Number.isFinite(finite(analysis.vsize))?`${num(analysis.vsize,2)} vB`:"—"],
      ["Serialized size",Number.isFinite(finite(analysis.size))?`${num(analysis.size,0)} B`:"—"],
      ["Weight",Number.isFinite(finite(analysis.weight))?`${num(analysis.weight,0)} WU`:"—"],
      ["Witness discount",Number.isFinite(finite(analysis.witnessDiscount))?`${num(analysis.witnessDiscount*100,2)}%`:"—"],
      ["Fee",sats(analysis.feeSats)],
      ["Fee BTC",btc(analysis.feeBtc)],
      ["Fee USD",usd(analysis.feeUsd)],
      ["Fee rate",Number.isFinite(finite(analysis.feeRate))?`${num(analysis.feeRate,3)} sat/vB`:"—"],
      ["Package rate",Number.isFinite(finite(analysis.packageFeeRate))?`${num(analysis.packageFeeRate,3)} sat/vB`:"—"],
      ["Fee/input value",Number.isFinite(finite(analysis.feeShare))?`${num(analysis.feeShare*100,5)}%`:"—"],
      ["Input value",btc(analysis.inputBtc)],
      ["Output value",btc(analysis.outputBtc)],
      ["Output USD",usd(analysis.outputUsd)],
      ["Inputs",num(analysis.inputs,0)],
      ["Outputs",num(analysis.outputs,0)],
      ["Spent outputs",`${num(analysis.spentOutputs,0)} spent · ${num(analysis.unspentOutputs,0)} unspent`],
      ["Unspent value",btcSats(analysis.unspentValue)],
      ["RBF signaling",classification.rbf?"yes":"no"],
      ["SegWit",classification.segwit?"yes":"no"],
      ["Taproot",classification.taproot?"yes":"no"],
      ["Coinbase",classification.coinbase?"yes":"no"],
      ["Version",num(analysis.version,0)],
      ["Locktime",`${num(analysis.locktime,0)} · ${text(analysis.locktimeMeaning)}`],
      ["Raw bytes",num(analysis.rawBytes,0)],
      ["Block height",num(analysis.blockHeight,0)],
      ["Block hash",analysis.blockHash||"—"],
      ["Captured",date(analysis.capturedAt)]
    ];

    root.querySelector("[data-mm-kv-grid]").innerHTML=fields.map(([label,value])=>kv(label,text(value))).join("");
    root.querySelector("[data-mm-inputs]").innerHTML=inputList(analysis.tx?.vin);
    root.querySelector("[data-mm-outputs]").innerHTML=outputList(analysis.tx?.vout,analysis.outspends);
    root.querySelector("[data-mm-scripts]").innerHTML=scriptSummary(analysis);
    root.querySelector("[data-mm-opreturn]").innerHTML=opReturnList(classification.opReturns||[]);
    root.querySelector("[data-mm-block]").innerHTML=blockDetails(analysis);
    root.querySelector("[data-mm-raw-json]").textContent=JSON.stringify(analysis.tx,null,2);
    root.querySelector("[data-mm-raw-hex]").textContent=analysis.rawHex||"raw transaction hex unavailable";
    root.querySelector("[data-mm-input-count]").textContent=`(${num(analysis.inputs,0)})`;
    root.querySelector("[data-mm-output-count]").textContent=`(${num(analysis.outputs,0)})`;
  }

  function renderSummary(root,record){
    const tile=record?.tile||{};
    root.querySelector("[data-mm-inspector-empty]").hidden=true;
    root.querySelector("[data-mm-inspector-body]").hidden=false;
    root.querySelector("[data-mm-inspector-title]").textContent=record.txid||"Transaction";
    setState(root,record.status==="error"?"PERSISTED READER · LAST READ FAILED":"PERSISTED READER · DETAILS NOT YET CACHED");
    const fields=[
      ["TXID",record.txid],
      ["Reader state",record.status||"pinned"],
      ["Pinned",date(record.pinnedAt)],
      ["Last viewed",date(record.lastViewedAt)],
      ["Output value",btcSats(tile.valueSats)],
      ["vSize",Number.isFinite(finite(tile.vsize))?`${num(tile.vsize,2)} vB`:"—"],
      ["Fee",sats(tile.feeSats)],
      ["Fee rate",Number.isFinite(finite(tile.packageFeeRate??tile.feeRate))?`${num(tile.packageFeeRate??tile.feeRate,3)} sat/vB`:"—"],
      ["Error",record.error||"—"]
    ];
    root.querySelector("[data-mm-kv-grid]").innerHTML=fields.map(([label,value])=>kv(label,text(value))).join("");
    for(const selector of ["[data-mm-inputs]","[data-mm-outputs]","[data-mm-scripts]","[data-mm-opreturn]","[data-mm-block]"]){
      root.querySelector(selector).innerHTML='<div class="mm-data-row">Use Revalidate to retrieve the complete transaction record.</div>';
    }
    root.querySelector("[data-mm-raw-json]").textContent="";
    root.querySelector("[data-mm-raw-hex]").textContent="";
    root.querySelector("[data-mm-input-count]").textContent="";
    root.querySelector("[data-mm-output-count]").textContent="";
  }

  function loading(root,txid){
    root.querySelector("[data-mm-inspector-empty]").hidden=true;
    root.querySelector("[data-mm-inspector-body]").hidden=false;
    root.querySelector("[data-mm-inspector-title]").textContent=txid;
    setState(root,"FETCHING + PINNING TRANSACTION");
    root.querySelector("[data-mm-kv-grid]").innerHTML=kv("Status","loading transaction, raw hex, spend state, block, and Merkle proof…");
    for(const selector of ["[data-mm-inputs]","[data-mm-outputs]","[data-mm-scripts]","[data-mm-opreturn]","[data-mm-block]"]){
      root.querySelector(selector).innerHTML="";
    }
    root.querySelector("[data-mm-raw-json]").textContent="";
    root.querySelector("[data-mm-raw-hex]").textContent="";
  }

  function error(root,txid,message){
    loading(root,txid);
    setState(root,"TRANSACTION READ ERROR · READER REMAINS PINNED");
    root.querySelector("[data-mm-kv-grid]").innerHTML=kv("Status",text(message));
  }

  function clear(root){
    root.querySelector("[data-mm-inspector-empty]").hidden=false;
    root.querySelector("[data-mm-inspector-body]").hidden=true;
  }

  function renderReaderList(root,records,activeTxid=""){
    const host=root.querySelector("[data-mm-reader-list]");
    host.replaceChildren();
    for(const record of records){
      const chip=D.createElement("div");
      chip.className=`mm-reader-chip${record.txid===activeTxid?" is-active":""}`;
      chip.tabIndex=0;
      chip.setAttribute("role","button");
      chip.dataset.mmReaderOpen=record.txid;
      chip.setAttribute("aria-label",`Open persistent reader ${record.txid}`);

      const title=D.createElement("strong");
      title.textContent=`${record.txid.slice(0,12)}…${record.txid.slice(-8)}`;
      const detail=D.createElement("small");
      const rate=finite(record.analysis?.packageFeeRate??record.tile?.packageFeeRate??record.tile?.feeRate);
      detail.textContent=`${record.status||"pinned"} · ${Number.isFinite(rate)?`${num(rate,2)} sat/vB · `:""}${ago(record.lastViewedAt)}`;
      const remove=D.createElement("button");
      remove.type="button";
      remove.textContent="×";
      remove.dataset.mmReaderRemove=record.txid;
      remove.setAttribute("aria-label",`Unpin ${record.txid}`);
      chip.append(title,detail,remove);
      host.append(chip);
    }
    const count=root.querySelector("[data-mm-reader-count]");
    if(count)count.textContent=`${records.length} pinned`;
  }

  W.ZZXMempoolMosaicInspector=Object.freeze({
    __version:3,
    render,
    renderSummary,
    loading,
    error,
    clear,
    renderReaderList
  });
})();

// __partials/widgets/mempool-specs/js/tx-card.js
(function(){
  "use strict";

  const W=window,D=document;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TxCard?.__version>=6)return;

  const n=value=>{const x=Number(value);return Number.isFinite(x)?x:NaN};
  const text=(node,value)=>{node.textContent=String(value??"")};

  function el(tag,cls,value){
    const node=D.createElement(tag);
    if(cls)node.className=cls;
    if(value!=null)text(node,value);
    return node;
  }

  function fmtInt(value){
    const x=n(value);
    return Number.isFinite(x)?Math.round(x).toLocaleString():"—";
  }

  function fmtRate(value,digits=3){
    const x=n(value);
    return Number.isFinite(x)?`${x.toFixed(digits)} sat/vB`:"—";
  }

  function fmtSats(value){
    const x=n(value);
    return Number.isFinite(x)?`${Math.round(x).toLocaleString()} sat`:"—";
  }

  function fmtBtc(value){
    const x=n(value);
    return Number.isFinite(x)?`${x.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"—";
  }

  function fmtUsd(value){
    const x=n(value);
    return Number.isFinite(x)
      ? x.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function fmtDate(value){
    const x=n(value);
    if(!Number.isFinite(x))return "—";
    const date=new Date(x);
    return Number.isFinite(date.getTime())?date.toLocaleString():"—";
  }

  function fmtHexByte(value){
    const x=n(value);
    return Number.isFinite(x)?`0x${Math.round(x).toString(16).padStart(2,"0")}`:"—";
  }

  function short(value,a=10,b=10){
    const s=String(value||"");
    return s.length>a+b+1?`${s.slice(0,a)}…${s.slice(-b)}`:(s||"—");
  }

  function cell(key,value,cls=""){
    const node=el("div",`ms-readout__cell${cls?` ${cls}`:""}`);
    node.appendChild(el("span","ms-readout__k",key));
    node.appendChild(el("strong","ms-readout__v",value));
    return node;
  }

  function codeRow(key,value){
    const row=el("div","ms-readout__code-row");
    row.appendChild(el("span","ms-readout__k",key));
    const code=el("code",null,value||"—");
    code.title=String(value||"");
    row.appendChild(code);
    return row;
  }

  function section(title,subtitle=""){
    const wrap=el("section","ms-readout__section");
    const head=el("div","ms-readout__section-head");
    head.appendChild(el("strong",null,title));
    if(subtitle)head.appendChild(el("small",null,subtitle));
    wrap.appendChild(head);
    return wrap;
  }

  function chip(label,tone=""){
    return el("span",`ms-readout__chip${tone?` ms-readout__chip--${tone}`:""}`,label);
  }

  function renderLoading(host,txid){
    if(!host)return;
    host.replaceChildren();
    const wrap=el("div","ms-readout__loading");
    wrap.appendChild(el("strong",null,"Loading complete transaction inspection…"));
    wrap.appendChild(el("code",null,String(txid||"")));
    wrap.appendChild(el("small",null,"Fetching transaction JSON, raw hex, and confirmed-block metadata when available."));
    host.appendChild(wrap);
  }

  function renderHeader(host,bundle,opts){
    const analysis=bundle;
    const head=el("div","ms-readout__head");
    const title=el("div","ms-readout__title");
    const status=analysis.status?.confirmed
      ? `${fmtInt(analysis.status.confirmations)} confirmation${analysis.status.confirmations===1?"":"s"}`
      : "unconfirmed / mempool";

    title.appendChild(el("strong",null,`${analysis.classification?.primary||"transaction"} · projected +${fmtInt(opts.projectedBlock)}`));
    title.appendChild(el("code",null,analysis.txid||"transaction id unavailable"));
    head.appendChild(title);
    head.appendChild(el("span","ms-readout__badge",status));
    host.appendChild(head);
  }

  function renderOverview(host,bundle,opts){
    const s=bundle.stats||{};
    const v=bundle.values||{};
    const status=bundle.status||{};
    const header=bundle.header||{};
    const classification=bundle.classification||{};

    const sec=section("Transaction overview","values and serialization metrics");
    const grid=el("div","ms-readout__grid ms-readout__grid--wide");

    grid.append(
      cell("TX type",classification.primary||"—"),
      cell("status",status.confirmed?"confirmed":"unconfirmed"),
      cell("confirmations",fmtInt(status.confirmations)),
      cell("projected block",`+${fmtInt(opts.projectedBlock)}`),
      cell("virtual size",Number.isFinite(n(s.vbytes))?`${fmtInt(s.vbytes)} vB`:"—"),
      cell("serialized size",Number.isFinite(n(s.size))?`${fmtInt(s.size)} B`:"—"),
      cell("weight",Number.isFinite(n(s.weight))?`${fmtInt(s.weight)} WU`:"—"),
      cell("fee rate",fmtRate(s.feeRate)),
      cell("package rate",fmtRate(s.packageFeeRate)),
      cell("fee",`${fmtSats(v.feeSats)} · ${fmtBtc(v.feeBtc)}`),
      cell("fee value",fmtUsd(v.feeUsd)),
      cell("fee / input",Number.isFinite(n(s.feePercent))?`${(s.feePercent*100).toFixed(5)}%`:"—"),
      cell("input value",`${fmtSats(v.inputSats)} · ${fmtUsd(v.inputUsd)}`),
      cell("output value",`${fmtSats(v.outputSats)} · ${fmtUsd(v.outputUsd)}`),
      cell("inputs",fmtInt(s.inputCount)),
      cell("outputs",fmtInt(s.outputCount)),
      cell("version",fmtInt(s.version)),
      cell("locktime",header.locktimeLabel||"—"),
      cell("witness bytes",fmtInt(s.witnessBytes)),
      cell("dust outputs",fmtInt(s.dustOutputs))
    );

    sec.appendChild(grid);
    host.appendChild(sec);
  }

  function renderFlags(host,bundle){
    const classification=bundle.classification||{};
    const flags=classification.flags||{};
    const sec=section("Classification","script family and transaction behavior");
    const row=el("div","ms-readout__chips");

    row.append(
      chip(classification.family||"unknown family","neutral"),
      chip(classification.usage||"unknown usage","neutral"),
      chip(flags.segwit?"SegWit":"non-SegWit",flags.segwit?"good":"neutral"),
      chip(flags.taproot?"Taproot":"no Taproot",flags.taproot?"good":"neutral"),
      chip(flags.rbf?"RBF enabled":"RBF not signaled",flags.rbf?"warn":"neutral"),
      chip(flags.opReturn?"OP_RETURN":"no OP_RETURN",flags.opReturn?"warn":"neutral"),
      chip(flags.timelocked?"timelocked":"no locktime",flags.timelocked?"warn":"neutral")
    );

    sec.appendChild(row);

    const typeGrid=el("div","ms-readout__type-grid");
    for(const side of [
      ["input script types",classification.inputTypes||[]],
      ["output script types",classification.outputTypes||[]]
    ]){
      const box=el("div","ms-readout__type-box");
      box.appendChild(el("span","ms-readout__k",side[0]));
      const values=side[1];
      box.appendChild(el("strong",null,values.length?values.map(row=>`${row.label} ×${row.count}`).join(" · "):"—"));
      typeGrid.appendChild(box);
    }

    sec.appendChild(typeGrid);
    host.appendChild(sec);
  }

  function renderHashes(host,bundle){
    const sec=section("Hashes + transaction header","transaction serialization/header fields");
    const header=bundle.header||{};
    const status=bundle.status||{};

    sec.append(
      codeRow("TXID / transaction hash",bundle.txid||bundle.hash),
      codeRow("hash field",bundle.hash||bundle.txid),
      codeRow("wtxid",bundle.wtxid||"not supplied / unavailable"),
      codeRow("block hash",status.blockHash||"unconfirmed")
    );

    const grid=el("div","ms-readout__grid");
    grid.append(
      cell("version",fmtInt(header.version)),
      cell("locktime",Number.isFinite(n(header.locktime))?`${fmtInt(header.locktime)} · ${header.locktimeLabel}`:"—"),
      cell("marker",fmtHexByte(header.marker)),
      cell("flag",fmtHexByte(header.flag)),
      cell("raw bytes",fmtInt(header.rawBytes)),
      cell("SegWit marker",header.segwit?"yes":"no / unavailable"),
      cell("block height",fmtInt(status.blockHeight)),
      cell("block time",fmtDate(status.blockTime))
    );
    sec.appendChild(grid);
    host.appendChild(sec);
  }

  function renderOpReturn(host,bundle){
    const rows=bundle.opReturns||[];
    const sec=section("OP_RETURN data",rows.length?`${rows.length} pushed data chunk${rows.length===1?"":"s"}`:"no OP_RETURN outputs");

    if(!rows.length){
      sec.appendChild(el("div","ms-readout__empty","No OP_RETURN payload is present in this transaction."));
      host.appendChild(sec);
      return;
    }

    const list=el("div","ms-readout__opreturn-list");
    rows.forEach((row,index)=>{
      const card=el("div","ms-readout__opreturn");
      card.appendChild(el("strong",null,`output #${row.outputIndex} · push ${index+1} · ${fmtInt(row.length)} B`));
      card.appendChild(codeRow("UTF-8 / printable",row.text||"(binary / non-printable)"));
      card.appendChild(codeRow("hex",row.hex||""));
      list.appendChild(card);
    });
    sec.appendChild(list);
    host.appendChild(sec);
  }

  function renderInputs(host,bundle){
    const rows=bundle.inputs||[];
    const sec=section("Inputs",`${rows.length} input${rows.length===1?"":"s"}`);
    const list=el("div","ms-readout__io-list");

    rows.forEach(row=>{
      const details=el("details","ms-readout__io");
      const summary=el("summary",null);
      summary.appendChild(el("strong",null,`vin #${row.index}`));
      summary.appendChild(el("span",null,row.coinbase?"coinbase":`${short(row.txid)}:${Number.isFinite(n(row.vout))?fmtInt(row.vout):"—"}`));
      summary.appendChild(el("span",null,fmtSats(row.prevValueSats)));
      details.appendChild(summary);

      const grid=el("div","ms-readout__grid");
      grid.append(
        cell("prev value",`${fmtSats(row.prevValueSats)} · ${fmtUsd(row.prevValueUsd)}`),
        cell("prev type",row.prevTypeLabel||"—"),
        cell("sequence",Number.isFinite(n(row.sequence))?`0x${Math.round(row.sequence).toString(16).padStart(8,"0")} · ${fmtInt(row.sequence)}`:"—"),
        cell("witness stack",`${fmtInt(row.witness.length)} items · ${fmtInt(row.witnessBytes)} B`)
      );
      details.appendChild(grid);
      details.append(
        codeRow("prevout txid",row.txid||"—"),
        codeRow("prevout address",row.prevAddress||"—"),
        codeRow("prevout script ASM",row.prevScriptAsm||"—"),
        codeRow("prevout script hex",row.prevScriptHex||"—"),
        codeRow("scriptSig ASM",row.scriptSigAsm||"—"),
        codeRow("scriptSig hex",row.scriptSigHex||"—"),
        codeRow("inner redeem script",row.innerRedeemScriptAsm||"—"),
        codeRow("inner witness script",row.innerWitnessScriptAsm||"—")
      );

      if(row.witness.length){
        const witness=el("div","ms-readout__stack");
        witness.appendChild(el("span","ms-readout__k","witness stack"));
        row.witness.forEach((item,index)=>witness.appendChild(codeRow(`#${index}`,item)));
        details.appendChild(witness);
      }

      list.appendChild(details);
    });

    sec.appendChild(list);
    host.appendChild(sec);
  }

  function renderOutputs(host,bundle){
    const rows=bundle.outputs||[];
    const sec=section("Outputs",`${rows.length} output${rows.length===1?"":"s"}`);
    const list=el("div","ms-readout__io-list");

    rows.forEach(row=>{
      const details=el("details","ms-readout__io");
      const summary=el("summary",null);
      summary.appendChild(el("strong",null,`vout #${row.index}`));
      summary.appendChild(el("span",null,row.address||row.typeLabel||"script output"));
      summary.appendChild(el("span",null,fmtSats(row.valueSats)));
      details.appendChild(summary);

      const grid=el("div","ms-readout__grid");
      grid.append(
        cell("value",`${fmtSats(row.valueSats)} · ${fmtBtc(row.valueBtc)} · ${fmtUsd(row.valueUsd)}`),
        cell("type",row.typeLabel||"—"),
        cell("address",row.address||"—")
      );
      details.appendChild(grid);
      details.append(
        codeRow("script ASM",row.scriptAsm||"—"),
        codeRow("script hex",row.scriptHex||"—")
      );
      list.appendChild(details);
    });

    sec.appendChild(list);
    host.appendChild(sec);
  }

  function renderBlock(host,bundle){
    const block=bundle.block;
    if(!block)return;

    const sec=section("Confirmed block header","available because this transaction is confirmed");
    const grid=el("div","ms-readout__grid");
    grid.append(
      cell("height",fmtInt(block.height)),
      cell("timestamp",Number.isFinite(n(block.timestamp))?fmtDate(n(block.timestamp)*1000):"—"),
      cell("transactions",fmtInt(block.tx_count)),
      cell("size",Number.isFinite(n(block.size))?`${fmtInt(block.size)} B`:"—"),
      cell("weight",Number.isFinite(n(block.weight))?`${fmtInt(block.weight)} WU`:"—"),
      cell("difficulty",fmtInt(block.difficulty)),
      cell("version",fmtInt(block.version)),
      cell("nonce",fmtInt(block.nonce))
    );
    sec.appendChild(grid);
    sec.append(
      codeRow("block hash",block.id||block.hash||"—"),
      codeRow("previous block",block.previousblockhash||"—"),
      codeRow("merkle root",block.merkle_root||block.merkleRoot||"—")
    );
    host.appendChild(sec);
  }

  function renderRaw(host,bundle){
    const sec=section("Raw transaction data","complete provider JSON and serialized transaction hex");

    const jsonDetails=el("details","ms-readout__raw");
    jsonDetails.appendChild(el("summary",null,"Provider transaction JSON"));
    const json=el("pre",null);
    try{json.textContent=JSON.stringify(bundle.raw||bundle.tx||{},null,2)}
    catch(_error){json.textContent="Unable to serialize transaction JSON."}
    jsonDetails.appendChild(json);
    sec.appendChild(jsonDetails);

    const hexDetails=el("details","ms-readout__raw");
    hexDetails.appendChild(el("summary",null,"Raw transaction hex"));
    hexDetails.appendChild(el("pre",null,bundle.rawHex||"Raw transaction hex was unavailable from the configured provider."));
    sec.appendChild(hexDetails);

    host.appendChild(sec);
  }

  function renderActions(host,bundle){
    const txid=String(bundle.txid||"");
    if(!/^[0-9a-f]{64}$/i.test(txid))return;
    const actions=el("div","ms-readout__actions");
    const a=el("a",null,"Open transaction on mempool.space");
    a.href=`https://mempool.space/tx/${txid}`;
    a.target="_blank";
    a.rel="noopener noreferrer";
    actions.appendChild(a);
    host.appendChild(actions);
  }

  function renderInline(host,opts={}){
    if(!host)return;
    const bundle=opts.bundle;
    if(!bundle){
      renderLoading(host,opts.entry?.txid||"");
      return;
    }

    host.replaceChildren();
    renderHeader(host,bundle,opts);
    renderOverview(host,bundle,opts);
    renderFlags(host,bundle);
    renderHashes(host,bundle);
    renderOpReturn(host,bundle);
    renderInputs(host,bundle);
    renderOutputs(host,bundle);
    renderBlock(host,bundle);
    renderRaw(host,bundle);
    renderActions(host,bundle);
  }

  NS.TxCard=Object.freeze({
    __version:6,
    renderInline,
    renderLoading
  });
})();

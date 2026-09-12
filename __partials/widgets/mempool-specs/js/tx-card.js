// __partials/widgets/mempool-specs/js/tx-card.js
(function(){
  "use strict";
  const W=window,D=document;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TxCard?.__version>=4)return;

  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:NaN};
  const text=(el,v)=>{el.textContent=String(v??"")};
  function el(tag,cls,value){const x=D.createElement(tag);if(cls)x.className=cls;if(value!=null)text(x,value);return x}
  function fmtInt(v){const x=n(v);return Number.isFinite(x)?Math.round(x).toLocaleString():"—"}
  function fmtRate(v){const x=n(v);return Number.isFinite(x)?`${x.toFixed(3)} sat/vB`:"—"}
  function fmtSats(v){const x=n(v);return Number.isFinite(x)?`${Math.round(x).toLocaleString()} sat`:"—"}
  function fmtUsd(v){const x=n(v);return Number.isFinite(x)?x.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}):"—"}
  function fmtTime(ms){const x=n(ms);return Number.isFinite(x)?new Date(x).toLocaleString():"—"}
  function short(id){const s=String(id||"");return s.length>22?`${s.slice(0,10)}…${s.slice(-10)}`:(s||"—")}

  function cell(k,v){
    const c=el("div","ms-readout__cell");
    c.appendChild(el("span","ms-readout__k",k));
    c.appendChild(el("strong","ms-readout__v",v));
    return c;
  }

  function renderInline(host,opts={}){
    if(!host)return;
    host.replaceChildren();
    const entry=opts.entry||{};
    const tx=opts.tx||entry.raw||{};
    const z=tx.__zzx||{};
    const txid=String(entry.txid||tx.txid||"");
    const vbytes=Number.isFinite(n(z.vbytes))?n(z.vbytes):n(entry.vbytes);
    const weight=Number.isFinite(n(tx.weight))?n(tx.weight):n(entry.weight);
    const feeSats=Number.isFinite(n(tx.fee))?n(tx.fee):n(entry.feeSats);
    const feeRate=Number.isFinite(n(z.feeRate))?n(z.feeRate):n(entry.feeRate);
    const pkg=n(entry.packageFeeRate);
    const satsOut=Number.isFinite(n(z.satsOut))?n(z.satsOut):n(entry.valueOutSats);
    const btcUsd=n(opts.btcUsd);
    const usdOut=Number.isFinite(satsOut)&&Number.isFinite(btcUsd)?(satsOut/1e8)*btcUsd:NaN;

    const head=el("div","ms-readout__head");
    const title=el("div","ms-readout__title");
    title.appendChild(el("strong",null,`TX #${fmtInt(opts.rank)} · projected +${fmtInt(opts.projectedBlock)}`));
    title.appendChild(el("code",null,txid||"transaction id unavailable"));
    head.appendChild(title);
    head.appendChild(el("span","ms-readout__badge",entry.detailed?"priority scored":"priority pending"));
    host.appendChild(head);

    const grid=el("div","ms-readout__grid");
    grid.append(
      cell("rank",`#${fmtInt(opts.rank)}`),
      cell("projected block",`+${fmtInt(opts.projectedBlock)}`),
      cell("fee rate",fmtRate(feeRate)),
      cell("package rate",fmtRate(pkg)),
      cell("virtual size",Number.isFinite(vbytes)?`${fmtInt(vbytes)} vB${entry.estimatedVbytes?" est.":""}`:"—"),
      cell("weight",Number.isFinite(weight)?`${fmtInt(weight)} WU`:"—"),
      cell("fee",fmtSats(feeSats)),
      cell("output value",Number.isFinite(satsOut)?`${fmtSats(satsOut)} · ${fmtUsd(usdOut)}`:"—"),
      cell("first seen",fmtTime(entry.timeMs)),
      cell("ancestors",fmtInt(entry.ancestorCount)),
      cell("ancestor size",Number.isFinite(n(entry.ancestorSize))?`${fmtInt(entry.ancestorSize)} vB`:"—"),
      cell("descendants",fmtInt(entry.descendantCount))
    );
    host.appendChild(grid);

    const deps=el("div","ms-readout__deps");
    if(entry.depends?.length)deps.appendChild(el("code",null,`depends: ${entry.depends.join(", ")}`));
    if(entry.spentBy?.length)deps.appendChild(el("code",null,`spent by: ${entry.spentBy.join(", ")}`));
    if(!entry.depends?.length&&!entry.spentBy?.length)deps.appendChild(el("span",null,"No package dependency list supplied by the current source."));
    host.appendChild(deps);

    if(/^[0-9a-f]{64}$/i.test(txid)){
      const actions=el("div","ms-readout__actions");
      const a=el("a",null,"Open on mempool.space");
      a.href=`https://mempool.space/tx/${txid}`;a.target="_blank";a.rel="noopener noreferrer";
      actions.appendChild(a);host.appendChild(actions);
    }
  }

  NS.TxCard=Object.freeze({__version:4,renderInline,open:opts=>renderInline(opts?.host,opts)});
})();

(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerNationalTrade?.__version>=1)return;

  const STORAGE_IMPORT="zzx.widget.bitcoin-ticker.import-country.v1";
  const STORAGE_EXPORT="zzx.widget.bitcoin-ticker.export-country.v1";

  const q=(root,sel)=>root?.querySelector(sel)||null;
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function set(root,sel,value){
    const el=q(root,sel);
    if(el)el.textContent=value==null?"—":String(value);
  }

  function fmtUsd(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    return n.toLocaleString(undefined,{
      style:"currency",
      currency:"USD",
      notation:Math.abs(n)>=1e9?"compact":"standard",
      maximumFractionDigits:2
    });
  }

  function loadStored(key){
    try{return localStorage.getItem(key)||""}catch(_){return ""}
  }

  function saveStored(key,value){
    try{localStorage.setItem(key,String(value||""))}catch(_){}
  }

  function populate(select,rows,key){
    if(!select)return;
    const current=loadStored(key)||select.value||"US";
    select.replaceChildren();

    for(const row of rows||[]){
      const option=D.createElement("option");
      option.value=String(row.code||row.name||"");
      option.textContent=String(row.name||row.code||"Unknown");
      option.dataset.available=row.tradeAvailable?"true":"false";
      select.appendChild(option);
    }

    if(!select.options.length)return;

    select.value=[...select.options].some(o=>o.value===current)
      ? current
      : ([...select.options].some(o=>o.value==="US")?"US":select.options[0].value);
  }

  function selected(rows,select){
    const key=select?.value||"";
    return (rows||[]).find(row=>String(row.code||row.name||"")===key)||(rows||[])[0]||null;
  }

  function renderPane(root,rows,kind){
    const isImport=kind==="imports";
    const select=q(root,isImport?"[data-import-country]":"[data-export-country]");
    const row=selected(rows,select);
    const amount=finite(isImport?row?.importsUsd:row?.exportsUsd);
    const opposite=finite(isImport?row?.exportsUsd:row?.importsUsd);
    const balance=finite(row?.tradeBalanceUsd);
    const name=row?.name||"Country";

    set(root,isImport?"[data-import-total]":"[data-export-total]",
      row&&Number.isFinite(amount)
        ? `${name}: ${fmtUsd(amount)}`
        : `${name}: data unavailable`
    );

    set(root,isImport?"[data-import-counterpart]":"[data-export-counterpart]",
      Number.isFinite(opposite)?fmtUsd(opposite):"—"
    );

    set(root,isImport?"[data-import-balance]":"[data-export-balance]",
      Number.isFinite(balance)?fmtUsd(balance):"—"
    );

    set(root,isImport?"[data-import-status]":"[data-export-status]",
      row?.tradeAvailable
        ? `${row.tradeStatus||"trade"} · ${row.tradeRecordYear||row.tradeRecordDate||"year unavailable"}`
        : "trade data unavailable"
    );

    set(root,isImport?"[data-import-source]":"[data-export-source]",
      [row?.tradeSource,row?.tradeMethod,row?.tradeRecordYear||row?.tradeRecordDate]
        .filter(Boolean).join(" · ") || "public trade source unavailable"
    );
  }

  function render(root,state){
    const rows=state?.balances||[];
    populate(q(root,"[data-import-country]"),rows,STORAGE_IMPORT);
    populate(q(root,"[data-export-country]"),rows,STORAGE_EXPORT);
    renderPane(root,rows,"imports");
    renderPane(root,rows,"exports");
  }

  function mount(root,state){
    if(root.__zzxTickerNationalTradeMounted)return;
    root.__zzxTickerNationalTradeMounted=true;

    q(root,"[data-import-country]")?.addEventListener("change",event=>{
      saveStored(STORAGE_IMPORT,event.currentTarget.value);
      renderPane(root,state?.balances||[],"imports");
    });

    q(root,"[data-export-country]")?.addEventListener("change",event=>{
      saveStored(STORAGE_EXPORT,event.currentTarget.value);
      renderPane(root,state?.balances||[],"exports");
    });
  }

  W.ZZXBitcoinTickerNationalTrade=Object.freeze({
    __version:1,
    mount,
    render
  });
})();

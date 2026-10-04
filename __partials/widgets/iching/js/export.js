// __partials/widgets/iching/js/export.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXIChingExport?.__version>=1)return;

  const ASCII_RE=/[^\x20-\x7E]/g;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function isoNow(ms){
    const d=new Date(Number(ms)||Date.now());
    return Number.isFinite(d.getTime())?d.toISOString():new Date().toISOString();
  }

  function money(v){
    const n=finite(v);
    return Number.isFinite(n)?`$${n.toFixed(2)}`:"-";
  }

  function btc(v){
    const n=finite(v);
    return Number.isFinite(n)?`${n.toFixed(8)} BTC`:"-";
  }

  function pct(v){
    const n=finite(v);
    return Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(2)}%`:"-";
  }

  function signedMoney(v){
    const n=finite(v);
    if(!Number.isFinite(n))return "-";
    return `${n>=0?"+":"-"}$${Math.abs(n).toFixed(2)}`;
  }

  function safeAscii(value){
    return String(value??"")
      .replace(/[\u2018\u2019]/g,"'")
      .replace(/[\u201C\u201D]/g,'"')
      .replace(/[\u2013\u2014]/g,"-")
      .replace(/\u00B7/g,"|")
      .replace(/\u2192/g,"->")
      .replace(ASCII_RE,"?");
  }

  function lotRow(lot,currentPrice){
    const historicalPrice=finite(lot?.historicalPrice);
    const amountBtc=finite(lot?.btc);
    const costUsd=finite(lot?.usd);
    const current=finite(currentPrice);
    const currentValue=(amountBtc>0&&Number.isFinite(current))?amountBtc*current:NaN;
    const gainUsd=(Number.isFinite(currentValue)&&costUsd>0)?currentValue-costUsd:NaN;
    const returnPct=(costUsd>0&&Number.isFinite(gainUsd))?(gainUsd/costUsd)*100:NaN;

    return {
      // Canonical lot fields are preserved so JSON exports remain re-importable.
      id:String(lot?.id||""),
      date:String(lot?.date||""),
      usd:costUsd,
      historicalPrice:historicalPrice,
      btc:amountBtc,
      source:String(lot?.source||"unknown"),
      addedAt:String(lot?.addedAt||""),

      // Report aliases / live appreciation fields.
      purchase_date:String(lot?.date||""),
      cost_usd:costUsd,
      historical_btc_usd:historicalPrice,
      btc_acquired:amountBtc,
      sats_acquired:Number.isFinite(amountBtc)?Math.round(amountBtc*1e8):NaN,
      current_value_usd:currentValue,
      unrealized_gain_usd:gainUsd,
      appreciation_percent:returnPct,
      historical_price_source:String(lot?.source||"unknown"),
      added_at:String(lot?.addedAt||"")
    };
  }

  function buildSnapshot(state){
    const current=finite(state?.currentPrice);
    const rows=(Array.isArray(state?.lots)?state.lots:[])
      .map(lot=>lotRow(lot,current))
      .sort((a,b)=>String(a.purchase_date).localeCompare(String(b.purchase_date)));

    const btcTotal=rows.reduce((sum,row)=>sum+(Number.isFinite(row.btc_acquired)?row.btc_acquired:0),0);
    const costTotal=rows.reduce((sum,row)=>sum+(Number.isFinite(row.cost_usd)?row.cost_usd:0),0);
    const valueTotal=rows.reduce((sum,row)=>sum+(Number.isFinite(row.current_value_usd)?row.current_value_usd:0),0);
    const gainTotal=Number.isFinite(current)?valueTotal-costTotal:NaN;
    const returnTotal=costTotal>0&&Number.isFinite(gainTotal)?(gainTotal/costTotal)*100:NaN;
    const average=btcTotal>0?costTotal/btcTotal:NaN;

    return {
      schema:"zzx-iching-appreciation-report-v1",
      exported_at:isoNow(),
      valuation_at:isoNow(state?.currentPriceAt),
      current_btc_usd:current,
      current_price_source:String(state?.currentPriceSource||"unknown"),
      lot_count:rows.length,
      portfolio:{
        btc_accumulated:btcTotal,
        sats_accumulated:Math.round(btcTotal*1e8),
        cost_basis_usd:costTotal,
        average_acquisition_btc_usd:average,
        current_value_usd:Number.isFinite(current)?valueTotal:NaN,
        unrealized_gain_usd:gainTotal,
        appreciation_percent:returnTotal
      },
      lots:rows
    };
  }

  function jsonText(snapshot){
    return JSON.stringify(snapshot,null,2)+"\n";
  }

  function textReport(snapshot){
    const p=snapshot.portfolio||{};
    const lines=[
      "ZZX-Labs I-Ching - Bitcoin Historical Purchase Appreciation Report",
      "=================================================================",
      `Exported: ${snapshot.exported_at}`,
      `Valuation time: ${snapshot.valuation_at}`,
      `Current BTC/USD: ${money(snapshot.current_btc_usd)}`,
      `Current price source: ${snapshot.current_price_source}`,
      "",
      "Portfolio Summary",
      "-----------------",
      `Lots: ${snapshot.lot_count}`,
      `BTC accumulated: ${btc(p.btc_accumulated)}`,
      `Sats accumulated: ${Number.isFinite(p.sats_accumulated)?Math.round(p.sats_accumulated).toLocaleString("en-US"):"-"}`,
      `Cost basis: ${money(p.cost_basis_usd)}`,
      `Average acquisition: ${money(p.average_acquisition_btc_usd)}`,
      `Current value: ${money(p.current_value_usd)}`,
      `Unrealized gain/loss: ${signedMoney(p.unrealized_gain_usd)}`,
      `Appreciation: ${pct(p.appreciation_percent)}`,
      "",
      "Historical Lots vs Live Value",
      "-----------------------------"
    ];

    if(!snapshot.lots.length){
      lines.push("No lots stored.");
    }else{
      snapshot.lots.forEach((lot,index)=>{
        lines.push(
          `Lot ${index+1}`,
          `  Date: ${lot.purchase_date}`,
          `  USD spent: ${money(lot.cost_usd)}`,
          `  Historical BTC/USD: ${money(lot.historical_btc_usd)}`,
          `  BTC acquired: ${btc(lot.btc_acquired)}`,
          `  Sats acquired: ${Number.isFinite(lot.sats_acquired)?Math.round(lot.sats_acquired).toLocaleString("en-US"):"-"}`,
          `  Current value: ${money(lot.current_value_usd)}`,
          `  Unrealized gain/loss: ${signedMoney(lot.unrealized_gain_usd)}`,
          `  Appreciation: ${pct(lot.appreciation_percent)}`,
          `  Historical source: ${lot.historical_price_source}`,
          ""
        );
      });
    }

    lines.push(
      "Notes",
      "-----",
      "Historical purchase prices are retained with each locally stored lot.",
      "Live appreciation uses the current BTC/USD price captured at export time.",
      "This report is informational and does not account for taxes, fees, custody changes, or disposed lots.",
      ""
    );

    return lines.join("\n");
  }

  function wrap(text,width){
    const source=safeAscii(text);
    if(source.length<=width)return [source];
    const words=source.split(/\s+/);
    const lines=[];
    let current="";

    for(const word of words){
      if(!current){
        current=word;
      }else if((current+" "+word).length<=width){
        current+=" "+word;
      }else{
        lines.push(current);
        current=word;
      }
    }
    if(current)lines.push(current);
    return lines.length?lines:[""];
  }

  function pdfLines(snapshot){
    const p=snapshot.portfolio||{};
    const out=[
      {t:"ZZX-Labs I-Ching - Bitcoin Historical Purchase Appreciation Report",b:true},
      {t:`Exported: ${snapshot.exported_at}`},
      {t:`Valuation: ${snapshot.valuation_at} | BTC/USD ${money(snapshot.current_btc_usd)} | ${snapshot.current_price_source}`},
      {t:""},
      {t:"PORTFOLIO SUMMARY",b:true},
      {t:`Lots ${snapshot.lot_count} | BTC ${btc(p.btc_accumulated)} | Sats ${Number.isFinite(p.sats_accumulated)?Math.round(p.sats_accumulated).toLocaleString("en-US"):"-"}`},
      {t:`Cost ${money(p.cost_basis_usd)} | Avg acquisition ${money(p.average_acquisition_btc_usd)}`},
      {t:`Live value ${money(p.current_value_usd)} | Gain/loss ${signedMoney(p.unrealized_gain_usd)} | Appreciation ${pct(p.appreciation_percent)}`},
      {t:""},
      {t:"HISTORICAL LOTS VS LIVE VALUE",b:true}
    ];

    if(!snapshot.lots.length){
      out.push({t:"No lots stored."});
    }else{
      snapshot.lots.forEach((lot,index)=>{
        out.push(
          {t:`Lot ${index+1} | ${lot.purchase_date}`,b:true},
          {t:`Spent ${money(lot.cost_usd)} | Historical BTC/USD ${money(lot.historical_btc_usd)} | Acquired ${btc(lot.btc_acquired)}`},
          {t:`Live value ${money(lot.current_value_usd)} | Gain/loss ${signedMoney(lot.unrealized_gain_usd)} | Appreciation ${pct(lot.appreciation_percent)}`},
          {t:`Source: ${lot.historical_price_source}`},
          {t:""}
        );
      });
    }

    out.push(
      {t:"NOTES",b:true},
      {t:"Historical purchase prices are retained with each locally stored lot."},
      {t:"Live appreciation uses the current BTC/USD price captured at export time."},
      {t:"Informational only; taxes, fees, custody changes, and disposed lots are not modeled."}
    );

    const wrapped=[];
    for(const row of out){
      const parts=wrap(row.t,95);
      for(const part of parts)wrapped.push({t:part,b:!!row.b});
    }
    return wrapped;
  }

  function pdfEscape(text){
    return safeAscii(text)
      .replace(/\\/g,"\\\\")
      .replace(/\(/g,"\\(")
      .replace(/\)/g,"\\)");
  }

  function makePdf(snapshot){
    const lines=pdfLines(snapshot);
    const pageHeight=792;
    const left=42;
    const top=748;
    const leading=13;
    const maxLines=50;
    const pages=[];

    for(let i=0;i<lines.length;i+=maxLines){
      pages.push(lines.slice(i,i+maxLines));
    }
    if(!pages.length)pages.push([{t:"I-Ching report",b:true}]);

    const objects=[null];
    const add=obj=>{objects.push(obj);return objects.length-1};
    const catalogId=add("");
    const pagesId=add("");
    const fontRegularId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBoldId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageIds=[];

    for(const page of pages){
      let content="BT\n";
      let y=top;
      for(const row of page){
        content+=`/${row.b?"F2":"F1"} ${row.b?10.5:9.5} Tf\n`;
        content+=`1 0 0 1 ${left} ${y} Tm (${pdfEscape(row.t)}) Tj\n`;
        y-=leading;
      }
      content+="ET\n";

      const contentId=add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
      const pageId=add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    objects[catalogId]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`;

    let pdf="%PDF-1.4\n%ZZXL\n";
    const offsets=[0];

    for(let i=1;i<objects.length;i++){
      offsets[i]=pdf.length;
      pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref=pdf.length;
    pdf+=`xref\n0 ${objects.length}\n`;
    pdf+="0000000000 65535 f \n";
    for(let i=1;i<objects.length;i++){
      pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
    }
    pdf+=`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    return new TextEncoder().encode(pdf);
  }

  W.ZZXIChingExport=Object.freeze({
    __version:1,
    buildSnapshot,
    jsonText,
    textReport,
    makePdf
  });
})();

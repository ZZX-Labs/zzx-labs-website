// __partials/widgets/mempool-tiles/js/analyzer.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesAnalyzer?.__version>=1)return;

  const SATS=100_000_000;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function total(rows,selector){
    let sum=0;
    let seen=false;
    for(const row of Array.isArray(rows)?rows:[]){
      const n=finite(selector(row));
      if(!Number.isFinite(n))continue;
      sum+=n;
      seen=true;
    }
    return seen?sum:NaN;
  }

  function scriptTypes(tx){
    const input=new Map();
    const output=new Map();

    for(const vin of tx?.vin||[]){
      const type=String(vin?.prevout?.scriptpubkey_type||"unknown");
      input.set(type,(input.get(type)||0)+1);
    }

    for(const vout of tx?.vout||[]){
      const type=String(vout?.scriptpubkey_type||"unknown");
      output.set(type,(output.get(type)||0)+1);
    }

    return {
      inputs:Object.fromEntries(input),
      outputs:Object.fromEntries(output)
    };
  }

  function rbf(tx){
    return (tx?.vin||[]).some(vin=>{
      const seq=finite(vin?.sequence);
      return Number.isFinite(seq)&&seq<0xfffffffe;
    });
  }

  function opReturns(tx){
    const out=[];

    for(let index=0;index<(tx?.vout||[]).length;index++){
      const row=tx.vout[index];
      const type=String(row?.scriptpubkey_type||"");
      const asm=String(row?.scriptpubkey_asm||"");
      const hex=String(row?.scriptpubkey||"");

      if(type!=="op_return"&&!asm.startsWith("OP_RETURN")&&!hex.startsWith("6a")){
        continue;
      }

      let dataHex="";

      if(hex.startsWith("6a")){
        const body=hex.slice(2);
        if(body.length>=2){
          const op=parseInt(body.slice(0,2),16);

          if(op<=75){
            dataHex=body.slice(2,2+op*2);
          }else if(op===76&&body.length>=4){
            const len=parseInt(body.slice(2,4),16);
            dataHex=body.slice(4,4+len*2);
          }else{
            dataHex=body.slice(2);
          }
        }
      }

      let utf8="";
      if(dataHex&&dataHex.length%2===0){
        try{
          const bytes=new Uint8Array(
            dataHex.match(/../g).map(part=>parseInt(part,16))
          );
          utf8=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
        }catch(_){}
      }

      out.push({
        index,
        asm,
        scriptHex:hex,
        dataHex,
        utf8
      });
    }

    return out;
  }

  function classify(tx){
    const outputs=tx?.vout||[];
    const inputs=tx?.vin||[];
    const types=scriptTypes(tx);
    const opret=opReturns(tx);

    const taproot=
      (types.inputs.v1_p2tr||0)>0 ||
      (types.outputs.v1_p2tr||0)>0;

    const segwit=taproot||
      Object.keys(types.inputs).some(k=>k.includes("v0_"))||
      Object.keys(types.outputs).some(k=>k.includes("v0_"));

    let kind="standard transfer";

    if(opret.length)kind="data / OP_RETURN";
    else if(inputs.length>=10&&outputs.length<=3)kind="consolidation";
    else if(outputs.length>=10&&inputs.length<=3)kind="fan-out / batch";
    else if(inputs.length>=5&&outputs.length>=5)kind="multi-party / complex";
    else if(taproot)kind="Taproot transfer";
    else if(segwit)kind="SegWit transfer";

    return {kind,taproot,segwit,rbf:rbf(tx),types,opReturns:opret};
  }

  function analyze(tx,{
    rawHex="",
    block=null,
    tipHeight=NaN,
    priceUsd=NaN
  }={}){
    const vsize=finite(tx?.vsize);
    const size=finite(tx?.size);
    const weight=finite(tx?.weight);
    const feeSats=finite(tx?.fee);
    const feeRate=Number.isFinite(feeSats)&&vsize>0?feeSats/vsize:NaN;
    const outputSats=total(tx?.vout,row=>row?.value);
    const inputSats=total(tx?.vin,row=>row?.prevout?.value);
    const status=tx?.status||{};
    const confirmed=Boolean(status.confirmed);
    const blockHeight=finite(status.block_height);
    const confirmations=
      confirmed&&Number.isFinite(blockHeight)&&Number.isFinite(tipHeight)
        ? Math.max(1,tipHeight-blockHeight+1)
        : 0;

    const classification=classify(tx);

    return {
      txid:String(tx?.txid||""),
      hash:String(tx?.hash||tx?.wtxid||tx?.txid||""),
      wtxid:String(tx?.wtxid||tx?.hash||""),
      version:finite(tx?.version),
      locktime:finite(tx?.locktime),
      vsize,
      size,
      weight,
      feeSats,
      feeRate,
      feeBtc:Number.isFinite(feeSats)?feeSats/SATS:NaN,
      feeUsd:Number.isFinite(feeSats)&&Number.isFinite(priceUsd)
        ? feeSats/SATS*priceUsd
        : NaN,
      outputSats,
      outputBtc:Number.isFinite(outputSats)?outputSats/SATS:NaN,
      outputUsd:Number.isFinite(outputSats)&&Number.isFinite(priceUsd)
        ? outputSats/SATS*priceUsd
        : NaN,
      inputSats,
      inputBtc:Number.isFinite(inputSats)?inputSats/SATS:NaN,
      inputs:(tx?.vin||[]).length,
      outputs:(tx?.vout||[]).length,
      confirmed,
      confirmations,
      blockHeight,
      blockHash:String(status.block_hash||""),
      blockTime:finite(status.block_time),
      classification,
      rawHex:String(rawHex||""),
      rawBytes:rawHex?Math.floor(rawHex.length/2):NaN,
      block,
      tx
    };
  }

  W.ZZXMempoolTilesAnalyzer=Object.freeze({
    __version:1,
    total,
    scriptTypes,
    rbf,
    opReturns,
    classify,
    analyze
  });
})();

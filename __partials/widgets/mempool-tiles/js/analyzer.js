(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesAnalyzer?.__version>=3)return;

  const SATS=100_000_000;
  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};

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
      const type=String(vin?.is_coinbase?"coinbase":vin?.prevout?.scriptpubkey_type||"unknown");
      input.set(type,(input.get(type)||0)+1);
    }
    for(const vout of tx?.vout||[]){
      const type=String(vout?.scriptpubkey_type||"unknown");
      output.set(type,(output.get(type)||0)+1);
    }
    return {inputs:Object.fromEntries(input),outputs:Object.fromEntries(output)};
  }

  function rbf(tx){
    return (tx?.vin||[]).some(vin=>{
      const sequence=finite(vin?.sequence);
      return Number.isFinite(sequence)&&sequence<0xfffffffe;
    });
  }

  function opReturns(tx){
    const out=[];
    for(let index=0;index<(tx?.vout||[]).length;index++){
      const row=tx.vout[index];
      const type=String(row?.scriptpubkey_type||"");
      const asm=String(row?.scriptpubkey_asm||"");
      const scriptHex=String(row?.scriptpubkey||"");
      if(type!=="op_return"&&!asm.startsWith("OP_RETURN")&&!scriptHex.startsWith("6a"))continue;

      let dataHex="";
      if(scriptHex.startsWith("6a")){
        const body=scriptHex.slice(2);
        const opcode=parseInt(body.slice(0,2),16);
        if(opcode<=75)dataHex=body.slice(2,2+opcode*2);
        else if(opcode===76){
          const length=parseInt(body.slice(2,4),16);
          dataHex=body.slice(4,4+length*2);
        }else dataHex=body.slice(2);
      }

      let utf8="";
      if(dataHex&&dataHex.length%2===0){
        try{
          const bytes=new Uint8Array(dataHex.match(/../g).map(part=>parseInt(part,16)));
          utf8=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
        }catch(_){}
      }

      out.push({index,asm,scriptHex,dataHex,utf8});
    }
    return out;
  }

  function classify(tx){
    const outputs=tx?.vout||[];
    const inputs=tx?.vin||[];
    const types=scriptTypes(tx);
    const opret=opReturns(tx);
    const coinbase=inputs.some(row=>row?.is_coinbase===true);
    const taproot=(types.inputs.v1_p2tr||0)>0||(types.outputs.v1_p2tr||0)>0;
    const segwit=taproot||Object.keys(types.inputs).some(key=>key.includes("v0_"))||
      Object.keys(types.outputs).some(key=>key.includes("v0_"));

    let kind="standard transfer";
    if(coinbase)kind="coinbase";
    else if(opret.length)kind="data / OP_RETURN";
    else if(inputs.length>=10&&outputs.length<=3)kind="consolidation";
    else if(outputs.length>=10&&inputs.length<=3)kind="fan-out / batch";
    else if(inputs.length>=5&&outputs.length>=5)kind="multi-party / complex";
    else if(taproot)kind="Taproot transfer";
    else if(segwit)kind="SegWit transfer";

    return {kind,coinbase,taproot,segwit,rbf:rbf(tx),types,opReturns:opret};
  }

  function uniqueAddresses(tx){
    const input=new Set();
    const output=new Set();
    for(const row of tx?.vin||[]){
      const address=row?.prevout?.scriptpubkey_address;
      if(address)input.add(String(address));
    }
    for(const row of tx?.vout||[]){
      const address=row?.scriptpubkey_address;
      if(address)output.add(String(address));
    }
    return {input:[...input],output:[...output]};
  }

  function witnessStats(tx){
    let items=0;
    let bytes=0;
    for(const vin of tx?.vin||[]){
      for(const item of vin?.witness||[]){
        items++;
        bytes+=Math.floor(String(item||"").length/2);
      }
    }
    return {items,bytes};
  }

  function locktimeMeaning(value){
    const locktime=finite(value);
    if(!Number.isFinite(locktime)||locktime===0)return "none";
    return locktime<500_000_000?`block height ${Math.round(locktime)}`:`Unix time ${Math.round(locktime)}`;
  }

  function analyze(tx,{
    rawHex="",
    block=null,
    outspends=[],
    merkleProof=null,
    tipHeight=NaN,
    priceUsd=NaN,
    tile=null
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
    const confirmations=confirmed&&Number.isFinite(blockHeight)&&Number.isFinite(tipHeight)
      ? Math.max(1,tipHeight-blockHeight+1):0;
    const classification=classify(tx);
    const addresses=uniqueAddresses(tx);
    const witness=witnessStats(tx);
    const spends=Array.isArray(outspends)?outspends:[];
    const spentOutputs=spends.filter(row=>row?.spent===true).length;
    const spentValue=total(tx?.vout,(row,index)=>spends[index]?.spent?row?.value:NaN);
    const unspentValue=total(tx?.vout,(row,index)=>spends[index]?.spent?NaN:row?.value);
    const packageFeeRate=finite(tile?.packageFeeRate??tile?.feeRate);
    const firstSeen=finite(tile?.firstSeen);

    return {
      schema:"zzx-mempool-tiles-reader-v3",
      capturedAt:Date.now(),
      txid:String(tx?.txid||""),
      hash:String(tx?.hash||tx?.wtxid||tx?.txid||""),
      wtxid:String(tx?.wtxid||tx?.hash||""),
      version:finite(tx?.version),
      locktime:finite(tx?.locktime),
      locktimeMeaning:locktimeMeaning(tx?.locktime),
      vsize,size,weight,
      witnessItems:witness.items,
      witnessBytes:witness.bytes,
      witnessDiscount:Number.isFinite(size)&&size>0&&Number.isFinite(vsize)?1-vsize/size:NaN,
      feeSats,
      feeRate,
      packageFeeRate:Number.isFinite(packageFeeRate)?packageFeeRate:feeRate,
      feeBtc:Number.isFinite(feeSats)?feeSats/SATS:NaN,
      feeUsd:Number.isFinite(feeSats)&&Number.isFinite(priceUsd)?feeSats/SATS*priceUsd:NaN,
      feeShare:Number.isFinite(feeSats)&&Number.isFinite(inputSats)&&inputSats>0?feeSats/inputSats:NaN,
      outputSats,
      outputBtc:Number.isFinite(outputSats)?outputSats/SATS:NaN,
      outputUsd:Number.isFinite(outputSats)&&Number.isFinite(priceUsd)?outputSats/SATS*priceUsd:NaN,
      inputSats,
      inputBtc:Number.isFinite(inputSats)?inputSats/SATS:NaN,
      inputs:(tx?.vin||[]).length,
      outputs:(tx?.vout||[]).length,
      uniqueInputAddresses:addresses.input.length,
      uniqueOutputAddresses:addresses.output.length,
      spentOutputs,
      unspentOutputs:Math.max(0,(tx?.vout||[]).length-spentOutputs),
      spentValue,
      unspentValue,
      confirmed,
      confirmations,
      firstSeen,
      blockHeight,
      blockHash:String(status.block_hash||""),
      blockTime:finite(status.block_time),
      projectedRank:finite(tile?.rank),
      classification,
      rawHex:String(rawHex||""),
      rawBytes:rawHex?Math.floor(rawHex.length/2):NaN,
      block,
      outspends:spends,
      merkleProof,
      addresses,
      tile:tile&&typeof tile==="object"?{
        rank:tile.rank,
        valueSats:tile.valueSats,
        vsize:tile.vsize,
        feeSats:tile.feeSats,
        feeRate:tile.feeRate,
        packageFeeRate:tile.packageFeeRate,
        firstSeen:tile.firstSeen,
        type:tile.type,
        rbf:tile.rbf,
        ordinal:tile.ordinal,
        boosted:tile.boosted
      }:null,
      tx
    };
  }

  W.ZZXMempoolTilesAnalyzer=Object.freeze({
    __version:3,
    total,
    scriptTypes,
    rbf,
    opReturns,
    classify,
    analyze
  });
})();

// __partials/widgets/mempool-specs/js/tx-analyzer.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.TxAnalyzer?.__version>=1)return;

  const SATS=100_000_000;
  const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:NaN};

  function hexToBytes(hex){
    const clean=String(hex||"").trim().replace(/^0x/i,"");
    if(!clean||clean.length%2||!/^[0-9a-f]+$/i.test(clean))return new Uint8Array();
    const out=new Uint8Array(clean.length/2);
    for(let i=0;i<out.length;i++)out[i]=parseInt(clean.slice(i*2,i*2+2),16);
    return out;
  }

  function bytesToHex(bytes){
    return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
  }

  function reverseHexBytes(hex){
    const bytes=hexToBytes(hex);
    return bytesToHex([...bytes].reverse());
  }

  async function hash256Hex(rawHex){
    const bytes=hexToBytes(rawHex);
    if(!bytes.length||!W.crypto?.subtle)return "";
    const one=await W.crypto.subtle.digest("SHA-256",bytes);
    const two=await W.crypto.subtle.digest("SHA-256",one);
    return reverseHexBytes(bytesToHex(new Uint8Array(two)));
  }

  function readPushes(scriptHex){
    const bytes=hexToBytes(scriptHex);
    if(!bytes.length||bytes[0]!==0x6a)return [];
    const chunks=[];
    let i=1;

    while(i<bytes.length){
      const opcode=bytes[i++];
      let length=NaN;

      if(opcode===0x00){
        length=0;
      }else if(opcode>=0x01&&opcode<=0x4b){
        length=opcode;
      }else if(opcode===0x4c&&i<bytes.length){
        length=bytes[i++];
      }else if(opcode===0x4d&&i+1<bytes.length){
        length=bytes[i]|(bytes[i+1]<<8);
        i+=2;
      }else if(opcode===0x4e&&i+3<bytes.length){
        length=(bytes[i]|(bytes[i+1]<<8)|(bytes[i+2]<<16)|(bytes[i+3]<<24))>>>0;
        i+=4;
      }else{
        chunks.push({opcode,length:0,hex:"",text:"",valid:false});
        continue;
      }

      if(!Number.isFinite(length)||length<0||i+length>bytes.length){
        chunks.push({opcode,length:Number.isFinite(length)?length:0,hex:"",text:"",valid:false});
        break;
      }

      const data=bytes.slice(i,i+length);
      i+=length;

      let text="";
      try{
        text=new TextDecoder("utf-8",{fatal:false}).decode(data);
      }catch(_error){}

      const printable=[...text].filter(ch=>{
        const code=ch.codePointAt(0)||0;
        return code===9||code===10||code===13||code>=32;
      }).join("");

      chunks.push({
        opcode,
        length,
        hex:bytesToHex(data),
        text:printable,
        valid:true
      });
    }

    return chunks;
  }

  function scriptTypeName(type){
    const key=String(type||"").toLowerCase();
    const map={
      p2pk:"P2PK",
      p2pkh:"P2PKH",
      p2sh:"P2SH",
      v0_p2wpkh:"P2WPKH",
      v0_p2wsh:"P2WSH",
      v1_p2tr:"P2TR",
      op_return:"OP_RETURN",
      provably_unspendable:"Provably unspendable",
      unknown:"Unknown"
    };
    return map[key]||String(type||"Unknown");
  }

  function countTypes(rows,selector){
    const counts=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      const type=selector(row);
      if(!type)continue;
      counts.set(type,(counts.get(type)||0)+1);
    }
    return [...counts.entries()]
      .sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))
      .map(([type,count])=>({type,count,label:scriptTypeName(type)}));
  }

  function locktimeLabel(locktime){
    const n=finite(locktime);
    if(!Number.isFinite(n)||n===0)return "none";
    if(n<500_000_000)return `block height ${Math.floor(n).toLocaleString()}`;
    const d=new Date(n*1000);
    return Number.isFinite(d.getTime())?d.toLocaleString():String(n);
  }

  function rawHeader(rawHex,tx){
    const bytes=hexToBytes(rawHex);
    const marker=bytes.length>=6?bytes[4]:NaN;
    const flag=bytes.length>=6?bytes[5]:NaN;
    const segwit=marker===0&&flag!==0;

    return {
      version:finite(tx?.version),
      locktime:finite(tx?.locktime),
      locktimeLabel:locktimeLabel(tx?.locktime),
      marker:Number.isFinite(marker)?marker:NaN,
      flag:Number.isFinite(flag)?flag:NaN,
      segwit,
      rawBytes:bytes.length
    };
  }

  function classify(tx,meta){
    const vin=Array.isArray(tx?.vin)?tx.vin:[];
    const vout=Array.isArray(tx?.vout)?tx.vout:[];
    const inputTypes=countTypes(vin,row=>row?.prevout?.scriptpubkey_type);
    const outputTypes=countTypes(vout,row=>row?.scriptpubkey_type);
    const inputTypeSet=new Set(inputTypes.map(row=>row.type));
    const outputTypeSet=new Set(outputTypes.map(row=>row.type));
    const allTypes=new Set([...inputTypeSet,...outputTypeSet]);
    const hasTaproot=allTypes.has("v1_p2tr");
    const hasNativeSegwit=["v0_p2wpkh","v0_p2wsh"].some(type=>allTypes.has(type));
    const hasP2sh=allTypes.has("p2sh");
    const hasLegacy=["p2pkh","p2pk"].some(type=>allTypes.has(type));
    const hasOpReturn=outputTypeSet.has("op_return")||outputTypeSet.has("provably_unspendable");
    const witness=vin.some(row=>Array.isArray(row?.witness)&&row.witness.length>0)||meta?.segwit===true;
    const rbf=vin.some(row=>Number.isFinite(finite(row?.sequence))&&finite(row.sequence)<0xfffffffe);
    const coinbase=vin.some(row=>!!row?.is_coinbase);
    const timelocked=Number.isFinite(finite(tx?.locktime))&&finite(tx.locktime)>0;

    let family="legacy";
    if(hasTaproot)family="taproot";
    else if(hasNativeSegwit)family="native segwit";
    else if(witness&&hasP2sh)family="wrapped segwit";
    else if(witness)family="segwit";
    else if(hasP2sh&&!hasLegacy)family="script-hash";

    let usage="payment";
    if(coinbase)usage="coinbase";
    else if(vin.length>=5&&vout.length<=2)usage="consolidation";
    else if(vout.length>=8&&vin.length<=4)usage="batched payment";
    else if(vin.length>=5&&vout.length>=5)usage="multi-input / multi-output";
    else if(hasOpReturn)usage="data-bearing payment";

    return {
      primary:coinbase?"coinbase":`${family} ${usage}`,
      family,
      usage,
      flags:{coinbase,witness,segwit:witness,taproot:hasTaproot,rbf,timelocked,opReturn:hasOpReturn},
      inputTypes,
      outputTypes
    };
  }

  function sumValues(rows,selector){
    let total=0,known=0;
    for(const row of Array.isArray(rows)?rows:[]){
      const value=finite(selector(row));
      if(Number.isFinite(value)){total+=value;known++}
    }
    return known?total:NaN;
  }

  function analyzeOutputs(tx,btcUsd){
    return (Array.isArray(tx?.vout)?tx.vout:[]).map((out,index)=>{
      const value=finite(out?.value);
      const type=String(out?.scriptpubkey_type||"");
      const opReturn=(type==="op_return"||type==="provably_unspendable")
        ? readPushes(out?.scriptpubkey)
        : [];

      return {
        index,
        valueSats:value,
        valueBtc:Number.isFinite(value)?value/SATS:NaN,
        valueUsd:Number.isFinite(value)&&Number.isFinite(btcUsd)?(value/SATS)*btcUsd:NaN,
        address:String(out?.scriptpubkey_address||""),
        type,
        typeLabel:scriptTypeName(type),
        scriptHex:String(out?.scriptpubkey||""),
        scriptAsm:String(out?.scriptpubkey_asm||""),
        opReturn
      };
    });
  }

  function analyzeInputs(tx,btcUsd){
    return (Array.isArray(tx?.vin)?tx.vin:[]).map((input,index)=>{
      const prev=input?.prevout||{};
      const value=finite(prev?.value);
      const witness=Array.isArray(input?.witness)?input.witness.slice():[];
      const witnessBytes=witness.reduce((sum,item)=>sum+Math.ceil(String(item||"").length/2),0);

      return {
        index,
        coinbase:!!input?.is_coinbase,
        txid:String(input?.txid||""),
        vout:finite(input?.vout),
        sequence:finite(input?.sequence),
        prevValueSats:value,
        prevValueBtc:Number.isFinite(value)?value/SATS:NaN,
        prevValueUsd:Number.isFinite(value)&&Number.isFinite(btcUsd)?(value/SATS)*btcUsd:NaN,
        prevAddress:String(prev?.scriptpubkey_address||""),
        prevType:String(prev?.scriptpubkey_type||""),
        prevTypeLabel:scriptTypeName(prev?.scriptpubkey_type),
        prevScriptHex:String(prev?.scriptpubkey||""),
        prevScriptAsm:String(prev?.scriptpubkey_asm||""),
        scriptSigHex:String(input?.scriptsig||""),
        scriptSigAsm:String(input?.scriptsig_asm||""),
        witness,
        witnessBytes,
        innerRedeemScriptAsm:String(input?.inner_redeemscript_asm||""),
        innerWitnessScriptAsm:String(input?.inner_witnessscript_asm||"")
      };
    });
  }

  async function analyze(tx,{tipHeight=NaN,btcUsd=NaN,rawHex="",block=null,entry=null}={}){
    const header=rawHeader(rawHex,tx);
    const vin=Array.isArray(tx?.vin)?tx.vin:[];
    const vout=Array.isArray(tx?.vout)?tx.vout:[];
    const inputs=analyzeInputs(tx,btcUsd);
    const outputs=analyzeOutputs(tx,btcUsd);
    const inputValue=sumValues(vin,row=>row?.prevout?.value);
    const outputValue=sumValues(vout,row=>row?.value);
    const fee=Number.isFinite(finite(tx?.fee))
      ? finite(tx.fee)
      : Number.isFinite(inputValue)&&Number.isFinite(outputValue)
        ? inputValue-outputValue
        : finite(entry?.feeSats);
    const weight=finite(tx?.weight??entry?.weight);
    const size=finite(tx?.size??entry?.size);
    const vbytes=Number.isFinite(weight)&&weight>0
      ? Math.ceil(weight/4)
      : finite(entry?.vbytes??tx?.vsize??size);
    const feeRate=Number.isFinite(fee)&&Number.isFinite(vbytes)&&vbytes>0
      ? fee/vbytes
      : finite(entry?.feeRate);
    const packageFeeRate=finite(entry?.packageFeeRate);
    const status=tx?.status||{};
    const confirmed=!!status?.confirmed;
    const blockHeight=finite(status?.block_height);
    const tip=finite(tipHeight);
    const confirmations=confirmed
      ? Number.isFinite(blockHeight)&&Number.isFinite(tip)
        ? Math.max(1,Math.floor(tip-blockHeight+1))
        : NaN
      : 0;
    const classification=classify(tx,header);
    const opReturns=outputs.flatMap(output=>output.opReturn.map(chunk=>({outputIndex:output.index,...chunk})));
    let wtxid="";

    if(rawHex){
      try{wtxid=await hash256Hex(rawHex)}catch(_error){}
    }

    const txid=String(tx?.txid||entry?.txid||"");
    const hash=String(tx?.hash||entry?.hash||txid);

    return {
      tx,
      entry:entry||{},
      rawHex:String(rawHex||""),
      txid,
      hash,
      wtxid:wtxid||(!classification.flags.segwit?txid:""),
      status:{
        confirmed,
        confirmations,
        blockHeight,
        blockHash:String(status?.block_hash||""),
        blockTime:Number.isFinite(finite(status?.block_time))?finite(status.block_time)*1000:NaN
      },
      header,
      classification,
      inputs,
      outputs,
      opReturns,
      values:{
        inputSats:inputValue,
        outputSats:outputValue,
        feeSats:fee,
        inputBtc:Number.isFinite(inputValue)?inputValue/SATS:NaN,
        outputBtc:Number.isFinite(outputValue)?outputValue/SATS:NaN,
        feeBtc:Number.isFinite(fee)?fee/SATS:NaN,
        inputUsd:Number.isFinite(inputValue)&&Number.isFinite(btcUsd)?(inputValue/SATS)*btcUsd:NaN,
        outputUsd:Number.isFinite(outputValue)&&Number.isFinite(btcUsd)?(outputValue/SATS)*btcUsd:NaN,
        feeUsd:Number.isFinite(fee)&&Number.isFinite(btcUsd)?(fee/SATS)*btcUsd:NaN
      },
      stats:{
        version:finite(tx?.version),
        locktime:finite(tx?.locktime),
        inputCount:vin.length,
        outputCount:vout.length,
        size,
        vbytes,
        weight,
        feeRate,
        packageFeeRate,
        feePercent:Number.isFinite(fee)&&Number.isFinite(inputValue)&&inputValue>0?fee/inputValue:NaN,
        witnessBytes:inputs.reduce((sum,row)=>sum+row.witnessBytes,0),
        uniqueInputAddresses:new Set(inputs.map(row=>row.prevAddress).filter(Boolean)).size,
        uniqueOutputAddresses:new Set(outputs.map(row=>row.address).filter(Boolean)).size,
        dustOutputs:outputs.filter(row=>Number.isFinite(row.valueSats)&&row.valueSats>0&&row.valueSats<546).length
      },
      block:block||null,
      raw:tx
    };
  }

  NS.TxAnalyzer=Object.freeze({
    __version:1,
    analyze,
    hash256Hex,
    readPushes,
    scriptTypeName,
    rawHeader,
    classify
  });
})();

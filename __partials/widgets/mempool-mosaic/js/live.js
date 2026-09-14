(function(){
  "use strict";
  const W=window;
  if(W.ZZXMempoolMosaicLive?.__version>=2)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const txidOf=row=>{const id=String(row?.txid??row?.id??row?.hash??"").trim();return /^[0-9a-f]{64}$/i.test(id)?id:""};

  function normalizeTx(row,index=0){
    if(!row||typeof row!=="object")return null;
    const txid=txidOf(row);if(!txid)return null;
    const weight=finite(row.weight);
    let vsize=finite(row.vsize??row.vbytes??row.virtualSize??row.virtual_size);
    if(!(vsize>0)&&weight>0)vsize=weight/4;
    if(!(vsize>0))vsize=finite(row.size);
    const fee=finite(row.fee??row.fees??row.totalFee??row.total_fee);
    const feeRate=finite(row.feeRate??row.fee_rate??row.rate??row.effectiveFeePerVsize??(fee>0&&vsize>0?fee/vsize:NaN));
    const packageFeeRate=finite(row.packageFeeRate??row.effectiveFeeRate??row.ancestorFeeRate??feeRate);
    const value=finite(row.value??row.valueSats??row.outputValue??row.output_value);
    return {...row,txid,id:txid,vsize,vbytes:vsize,fee,feeRate,packageFeeRate,value,valueSats:value,projectedBlockIndex:0,projectedRank:index,__zzxLive:true};
  }

  function normalizeRows(rows){
    const out=[],seen=new Set();
    for(const raw of Array.isArray(rows)?rows:[]){
      const tx=normalizeTx(raw,out.length);if(!tx||seen.has(tx.txid))continue;
      seen.add(tx.txid);out.push(tx);
    }
    return out;
  }

  function blockTxPayload(message){
    const payload=message?.["mempool-block-transactions"]??message?.mempoolBlockTransactions??message?.mempool_block_transactions;
    if(payload==null)return null;
    if(Array.isArray(payload))return {replace:true,rows:payload,removed:[],index:0};
    if(typeof payload!=="object")return null;
    const index=finite(payload.index??payload.blockIndex??payload.block_index??payload.projectedBlockIndex??0);
    const full=payload.blockTransactions??payload.transactions??payload.txs??payload.items??payload.block?.transactions;
    if(Array.isArray(full))return {replace:true,rows:full,removed:[],index:Number.isFinite(index)?index:0};
    const added=payload.added??payload.add??payload.delta?.added??payload.delta?.add;
    const removed=payload.removed??payload.remove??payload.delta?.removed??payload.delta?.remove??[];
    if(Array.isArray(added)||Array.isArray(removed))return {replace:false,rows:Array.isArray(added)?added:[],removed:Array.isArray(removed)?removed:[],index:Number.isFinite(index)?index:0};
    return null;
  }

  function candidatePayload(message){
    const blocks=message?.["mempool-blocks"]??message?.mempoolBlocks??message?.mempool_blocks;
    return Array.isArray(blocks)?blocks:null;
  }

  class LiveNextBlock{
    constructor(opts={}){
      this.url=String(opts.url||"");this.onUpdate=typeof opts.onUpdate==="function"?opts.onUpdate:null;this.onState=typeof opts.onState==="function"?opts.onState:null;
      this.reconnectMaxMs=Math.max(5000,Number(opts.reconnectMaxMs)||30000);this.socket=null;this.timer=0;this.stopped=true;this.retryMs=1000;this.rows=new Map();this.candidates=[];this.lastUpdate=0;this.generation=0;
    }
    emitState(state,detail=""){try{this.onState?.({state,detail,at:Date.now()})}catch(_){}}
    snapshot(){return {transactions:[...this.rows.values()].sort((a,b)=>(finite(a.projectedRank)||0)-(finite(b.projectedRank)||0)),candidates:this.candidates.slice(),updatedAt:this.lastUpdate,url:this.url}}
    emit(){this.lastUpdate=Date.now();try{this.onUpdate?.(this.snapshot())}catch(_){}}
    start(){if(!this.url||!("WebSocket" in W)){this.emitState("unsupported");return false}this.stopped=false;this.connect();return true}
    stop(){this.stopped=true;W.clearTimeout(this.timer);this.timer=0;try{this.socket?.close?.()}catch(_){}this.socket=null;this.emitState("stopped")}
    reconnect(){if(this.stopped)return;W.clearTimeout(this.timer);const delay=this.retryMs;this.retryMs=Math.min(this.reconnectMaxMs,Math.round(this.retryMs*1.7));this.timer=W.setTimeout(()=>this.connect(),delay)}
    send(payload){try{if(this.socket?.readyState===W.WebSocket.OPEN){this.socket.send(JSON.stringify(payload));return true}}catch(_){}return false}
    connect(){
      if(this.stopped)return;const gen=++this.generation;this.emitState("connecting",this.url);let socket;
      try{socket=new W.WebSocket(this.url)}catch(error){this.emitState("error",String(error?.message||error));this.reconnect();return}
      this.socket=socket;
      socket.onopen=()=>{if(this.stopped||gen!==this.generation)return;this.retryMs=1000;this.emitState("live",this.url);this.send({action:"want",data:["mempool-blocks"]});this.send({"track-mempool-block":0})};
      socket.onmessage=event=>{
        if(this.stopped||gen!==this.generation)return;let message;try{message=JSON.parse(event.data)}catch(_){return}
        const blocks=candidatePayload(message);if(blocks)this.candidates=blocks;
        const payload=blockTxPayload(message);
        if(payload&&(!Number.isFinite(payload.index)||payload.index===0)){
          if(payload.replace){this.rows.clear();normalizeRows(payload.rows).forEach((row,i)=>{row.projectedRank=i;this.rows.set(row.txid,row)})}
          else{
            for(const raw of payload.removed||[]){const id=typeof raw==="string"?raw:txidOf(raw);if(id)this.rows.delete(id)}
            for(const raw of payload.rows||[]){const tx=normalizeTx(raw,this.rows.size);if(tx)this.rows.set(tx.txid,tx)}
            const ordered=[...this.rows.values()].sort((a,b)=>{
              const ar=finite(a.packageFeeRate??a.feeRate),br=finite(b.packageFeeRate??b.feeRate);if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br)return br-ar;
              const ai=finite(a.projectedRank),bi=finite(b.projectedRank);if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return ai-bi;
              return a.txid.localeCompare(b.txid);
            });
            this.rows=new Map();ordered.forEach((row,i)=>{row.projectedRank=i;this.rows.set(row.txid,row)});
          }
          this.emit();
        }else if(blocks)this.emit();
      };
      socket.onerror=()=>{if(!this.stopped&&gen===this.generation)this.emitState("error","websocket error")};
      socket.onclose=event=>{if(this.stopped||gen!==this.generation)return;this.emitState("reconnecting",`code ${event?.code||0}`);this.reconnect()};
    }
  }

  W.ZZXMempoolMosaicLive=Object.freeze({__version:2,normalizeTx,normalizeRows,blockTxPayload,candidatePayload,LiveNextBlock});
})();

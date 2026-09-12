// __partials/widgets/mempool-tiles/js/live.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLive?.__version>=1)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function txidOf(row){
    const id=String(row?.txid??row?.id??row?.hash??"").trim();
    return /^[0-9a-f]{64}$/i.test(id)?id:"";
  }

  function normalize(row,index=0){
    if(!row||typeof row!=="object")return null;
    const txid=txidOf(row);
    if(!txid)return null;

    const vsize=finite(row.vsize??row.vbytes??row.virtualSize);
    const fee=finite(row.fee??row.fees);
    const rate=finite(
      row.rate ??
      row.feeRate ??
      row.fee_rate ??
      (Number.isFinite(fee)&&Number.isFinite(vsize)&&vsize>0?fee/vsize:NaN)
    );

    return {
      ...row,
      txid,
      id:txid,
      vsize,
      vbytes:vsize,
      fee,
      feeRate:rate,
      packageFeeRate:finite(row.packageFeeRate??row.effectiveFeeRate??rate),
      projectedBlockIndex:0,
      projectedRank:index,
      __zzxTilesLive:true
    };
  }

  function blockPayload(message){
    const payload=
      message?.["mempool-block-transactions"] ??
      message?.mempoolBlockTransactions ??
      message?.mempool_block_transactions;

    if(payload==null)return null;

    if(Array.isArray(payload)){
      return {replace:true,rows:payload,removed:[],index:0};
    }

    if(typeof payload!=="object")return null;

    const index=finite(
      payload.index ??
      payload.blockIndex ??
      payload.block_index ??
      payload.projectedBlockIndex ??
      0
    );

    const full=
      payload.blockTransactions ??
      payload.transactions ??
      payload.txs ??
      payload.items ??
      payload.block?.transactions;

    if(Array.isArray(full)){
      return {
        replace:true,
        rows:full,
        removed:[],
        index:Number.isFinite(index)?index:0
      };
    }

    const added=
      payload.added ??
      payload.add ??
      payload.delta?.added ??
      payload.delta?.add;

    const removed=
      payload.removed ??
      payload.remove ??
      payload.delta?.removed ??
      payload.delta?.remove ??
      [];

    if(Array.isArray(added)||Array.isArray(removed)){
      return {
        replace:false,
        rows:Array.isArray(added)?added:[],
        removed:Array.isArray(removed)?removed:[],
        index:Number.isFinite(index)?index:0
      };
    }

    return null;
  }

  function blocksPayload(message){
    const blocks=
      message?.["mempool-blocks"] ??
      message?.mempoolBlocks ??
      message?.mempool_blocks;
    return Array.isArray(blocks)?blocks:null;
  }

  class LiveNextBlock{
    constructor({url,onUpdate,onState,reconnectMaxMs=30000}={}){
      this.url=String(url||"");
      this.onUpdate=typeof onUpdate==="function"?onUpdate:null;
      this.onState=typeof onState==="function"?onState:null;
      this.reconnectMaxMs=Math.max(5000,Number(reconnectMaxMs)||30000);
      this.socket=null;
      this.timer=0;
      this.retryMs=1000;
      this.stopped=true;
      this.rows=new Map();
      this.blocks=[];
      this.lastUpdate=0;
      this.generation=0;
    }

    state(state,detail=""){
      try{this.onState?.({state,detail,at:Date.now()})}catch(_){}
    }

    snapshot(){
      const rows=[...this.rows.values()]
        .sort((a,b)=>(finite(a.projectedRank)||0)-(finite(b.projectedRank)||0))
        .map((row,index)=>({...row,projectedRank:index}));

      return {
        transactions:rows,
        blocks:this.blocks.slice(),
        updatedAt:this.lastUpdate,
        url:this.url
      };
    }

    emit(){
      this.lastUpdate=Date.now();
      try{this.onUpdate?.(this.snapshot())}catch(_){}
    }

    start(){
      if(!this.url||!("WebSocket" in W))return false;
      this.stopped=false;
      this.connect();
      return true;
    }

    stop(){
      this.stopped=true;
      W.clearTimeout(this.timer);
      try{this.socket?.close()}catch(_){}
      this.socket=null;
      this.state("stopped");
    }

    reconnect(){
      if(this.stopped)return;
      W.clearTimeout(this.timer);
      const wait=this.retryMs;
      this.retryMs=Math.min(this.reconnectMaxMs,Math.round(this.retryMs*1.7));
      this.timer=W.setTimeout(()=>this.connect(),wait);
    }

    send(payload){
      try{
        if(this.socket?.readyState===W.WebSocket.OPEN){
          this.socket.send(JSON.stringify(payload));
        }
      }catch(_){}
    }

    connect(){
      if(this.stopped)return;

      const generation=++this.generation;
      this.state("connecting",this.url);

      let socket;
      try{
        socket=new W.WebSocket(this.url);
      }catch(error){
        this.state("error",String(error?.message||error));
        this.reconnect();
        return;
      }

      this.socket=socket;

      socket.onopen=()=>{
        if(this.stopped||generation!==this.generation)return;
        this.retryMs=1000;
        this.state("live",this.url);
        this.send({action:"want",data:["mempool-blocks"]});
        this.send({"track-mempool-block":0});
      };

      socket.onmessage=event=>{
        if(this.stopped||generation!==this.generation)return;

        let message;
        try{message=JSON.parse(event.data)}
        catch(_){return}

        const blocks=blocksPayload(message);
        if(blocks)this.blocks=blocks;

        const payload=blockPayload(message);

        if(payload&&(!Number.isFinite(payload.index)||payload.index===0)){
          if(payload.replace){
            this.rows.clear();
            let rank=0;
            for(const raw of payload.rows){
              const tx=normalize(raw,rank++);
              if(tx)this.rows.set(tx.txid,tx);
            }
          }else{
            for(const raw of payload.removed||[]){
              const txid=typeof raw==="string"?raw:txidOf(raw);
              if(txid)this.rows.delete(txid);
            }

            for(const raw of payload.rows||[]){
              const tx=normalize(raw,this.rows.size);
              if(tx)this.rows.set(tx.txid,tx);
            }
          }
          this.emit();
        }else if(blocks){
          this.emit();
        }
      };

      socket.onerror=()=>{
        if(this.stopped||generation!==this.generation)return;
        this.state("error","websocket error");
      };

      socket.onclose=event=>{
        if(this.stopped||generation!==this.generation)return;
        this.state("reconnecting",`code ${event?.code||0}`);
        this.reconnect();
      };
    }
  }

  W.ZZXMempoolTilesLive=Object.freeze({
    __version:1,
    normalize,
    blockPayload,
    blocksPayload,
    LiveNextBlock
  });
})();

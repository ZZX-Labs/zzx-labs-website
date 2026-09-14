// __partials/widgets/mempool-tiles/js/live.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesLive?.__version>=2)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};

  function txidOf(row){
    if(typeof row==="string"){
      return /^[0-9a-f]{64}$/i.test(row)?row:"";
    }

    const id=String(row?.txid??row?.id??row?.hash??"").trim();
    return /^[0-9a-f]{64}$/i.test(id)?id:"";
  }

  function normalize(row,index=0){
    if(!row||typeof row!=="object"||Array.isArray(row))return null;

    const txid=txidOf(row);
    if(!txid)return null;

    const vsize=finite(
      row.vsize ??
      row.vbytes ??
      row.virtualSize ??
      (Number.isFinite(finite(row.weight))?finite(row.weight)/4:NaN)
    );

    const fee=finite(
      row.fee ??
      row.fees ??
      row.feeSats
    );

    const rate=finite(
      row.rate ??
      row.feeRate ??
      row.fee_rate ??
      row.effectiveFeeRate ??
      (
        Number.isFinite(fee)&&
        Number.isFinite(vsize)&&
        vsize>0
          ? fee/vsize
          : NaN
      )
    );

    return {
      ...row,
      txid,
      id:txid,
      vsize,
      vbytes:vsize,
      fee,
      value:
        finite(
          row.value ??
          row.valueSats ??
          row.outputValue ??
          row.output_value
        ),
      feeRate:rate,
      packageFeeRate:finite(
        row.packageFeeRate ??
        row.effectiveFeeRate ??
        rate
      ),
      projectedBlockIndex:0,
      projectedRank:index,
      __zzxTilesLive:true
    };
  }

  function normalizeRows(rows){
    const out=[];
    const seen=new Set();

    for(const row of Array.isArray(rows)?rows:[]){
      const tx=normalize(row,out.length);
      if(!tx||seen.has(tx.txid))continue;
      seen.add(tx.txid);
      out.push(tx);
    }

    return out;
  }

  function blockPayload(message){
    const payload=
      message?.["mempool-block-transactions"] ??
      message?.mempoolBlockTransactions ??
      message?.mempool_block_transactions;

    if(payload==null)return null;

    if(Array.isArray(payload)){
      return {
        replace:true,
        rows:payload,
        removed:[],
        changed:[],
        index:0
      };
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
        changed:[],
        index:Number.isFinite(index)?index:0
      };
    }

    const delta=
      payload.delta&&typeof payload.delta==="object"
        ? payload.delta
        : {};

    const added=
      payload.added ??
      payload.add ??
      delta.added ??
      delta.add ??
      [];

    const removed=
      payload.removed ??
      payload.remove ??
      delta.removed ??
      delta.remove ??
      [];

    const changed=
      payload.changed ??
      delta.changed ??
      [];

    if(
      Array.isArray(added) ||
      Array.isArray(removed) ||
      Array.isArray(changed)
    ){
      return {
        replace:false,
        rows:Array.isArray(added)?added:[],
        removed:Array.isArray(removed)?removed:[],
        changed:Array.isArray(changed)?changed:[],
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
    constructor({
      urls,
      url,
      onUpdate,
      onState,
      reconnectMaxMs=30000
    }={}){
      const list=[
        ...(Array.isArray(urls)?urls:[]),
        ...(url?[url]:[])
      ]
        .map(value=>String(value||"").trim())
        .filter(Boolean);

      this.urls=[...new Set(list)];
      this.urlIndex=0;
      this.url=this.urls[0]||"";
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
      this.failuresOnUrl=0;
    }

    state(state,detail=""){
      try{
        this.onState?.({
          state,
          detail,
          url:this.url,
          at:Date.now()
        });
      }catch(_){}
    }

    snapshot(){
      const rows=[...this.rows.values()]
        .sort((a,b)=>{
          const ar=finite(a.projectedRank);
          const br=finite(b.projectedRank);

          if(Number.isFinite(ar)&&Number.isFinite(br)&&ar!==br){
            return ar-br;
          }

          const af=finite(a.packageFeeRate??a.feeRate);
          const bf=finite(b.packageFeeRate??b.feeRate);

          if(Number.isFinite(af)&&Number.isFinite(bf)&&af!==bf){
            return bf-af;
          }

          return String(a.txid).localeCompare(String(b.txid));
        })
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
      if(!this.urls.length||!("WebSocket" in W))return false;
      this.stopped=false;
      this.connect();
      return true;
    }

    stop(){
      this.stopped=true;
      W.clearTimeout(this.timer);

      try{
        if(this.socket){
          this.socket.onopen=null;
          this.socket.onmessage=null;
          this.socket.onerror=null;
          this.socket.onclose=null;
          this.socket.close();
        }
      }catch(_){}

      this.socket=null;
      this.state("stopped");
    }

    rotateUrl(){
      if(this.urls.length<=1)return;
      this.urlIndex=(this.urlIndex+1)%this.urls.length;
      this.url=this.urls[this.urlIndex];
      this.failuresOnUrl=0;
    }

    reconnect(){
      if(this.stopped)return;

      W.clearTimeout(this.timer);

      if(this.failuresOnUrl>=2){
        this.rotateUrl();
      }

      const wait=this.retryMs;
      this.retryMs=Math.min(
        this.reconnectMaxMs,
        Math.round(this.retryMs*1.6)
      );

      this.timer=W.setTimeout(
        ()=>this.connect(),
        wait
      );
    }

    send(payload){
      try{
        if(this.socket?.readyState===W.WebSocket.OPEN){
          this.socket.send(JSON.stringify(payload));
          return true;
        }
      }catch(_){}

      return false;
    }

    connect(){
      if(this.stopped)return;

      this.url=this.urls[this.urlIndex]||"";
      const generation=++this.generation;

      this.state("connecting",this.url);

      let socket;

      try{
        socket=new W.WebSocket(this.url);
      }catch(error){
        this.failuresOnUrl++;
        this.state("error",String(error?.message||error));
        this.reconnect();
        return;
      }

      this.socket=socket;

      socket.onopen=()=>{
        if(this.stopped||generation!==this.generation)return;

        this.retryMs=1000;
        this.failuresOnUrl=0;
        this.state("live",this.url);

        this.send({
          action:"want",
          data:["mempool-blocks"]
        });

        this.send({
          "track-mempool-block":0
        });
      };

      socket.onmessage=event=>{
        if(this.stopped||generation!==this.generation)return;

        let message;

        try{
          message=JSON.parse(event.data);
        }catch(_){
          return;
        }

        const blocks=blocksPayload(message);
        if(blocks)this.blocks=blocks;

        const payload=blockPayload(message);

        if(payload&&(!Number.isFinite(payload.index)||payload.index===0)){
          if(payload.replace){
            this.rows.clear();

            normalizeRows(payload.rows).forEach((row,index)=>{
              row.projectedRank=index;
              this.rows.set(row.txid,row);
            });
          }else{
            for(const idLike of payload.removed||[]){
              const id=txidOf(idLike);
              if(id)this.rows.delete(id);
            }

            for(const raw of payload.changed||[]){
              const id=txidOf(raw);
              if(!id)continue;

              const prior=this.rows.get(id);
              const merged=normalize(
                {
                  ...(prior||{}),
                  ...(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{}),
                  txid:id
                },
                finite(prior?.projectedRank)
              );

              if(merged)this.rows.set(id,merged);
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

        this.failuresOnUrl++;
        this.state(
          "reconnecting",
          `code ${event?.code||0}`
        );
        this.reconnect();
      };
    }
  }

  W.ZZXMempoolTilesLive=Object.freeze({
    __version:2,
    txidOf,
    normalize,
    normalizeRows,
    blockPayload,
    blocksPayload,
    LiveNextBlock
  });
})();

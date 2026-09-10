// __partials/widgets/btc-prs/js/model.js
(function(){
  "use strict";
  const W=window;
  if(Number(W.ZZXBitcoinPRModel?.__version||0)>=1)return;

  function state(row){
    if(row?.merged_at)return "merged";
    return row?.state==="closed"?"closed":"open";
  }
  function build(input){
    const now=Date.now();
    const rows=(input||[]).map(row=>({
      number:Number(row.number),
      title:String(row.title||"Untitled pull request"),
      url:String(row.html_url||row.url||""),
      author:String(row.user?.login||row.author||"unknown"),
      state:state(row),
      updatedAt:Date.parse(row.updated_at||row.updatedAt||row.created_at||"")||0,
      createdAt:Date.parse(row.created_at||row.createdAt||"")||0,
      base:String(row.base?.ref||row.base||""),
      head:String(row.head?.ref||row.head||""),
      draft:Boolean(row.draft)
    })).filter(row=>Number.isFinite(row.number)).sort((a,b)=>b.updatedAt-a.updatedAt);

    const counts={
      open:rows.filter(r=>r.state==="open").length,
      merged:rows.filter(r=>r.state==="merged").length,
      closed:rows.filter(r=>r.state==="closed").length,
      updated24h:rows.filter(r=>r.updatedAt&&now-r.updatedAt<=86400000).length
    };

    return Object.freeze({
      schema:"zzx-bitcoin-core-pr-model-v1",
      rows:Object.freeze(rows.map(Object.freeze)),
      counts:Object.freeze(counts)
    });
  }

  W.ZZXBitcoinPRModel=Object.freeze({__version:1,build});
})();

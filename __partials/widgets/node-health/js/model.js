// __partials/widgets/node-health/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeHealthModel?.__version||0)>=2)return;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function networkName(value){
    const s=String(value??"").trim().toLowerCase();
    return s||"other";
  }

  function denominator(snapshot,nodes){
    for(const value of [
      snapshot?.reachableNodes,
      snapshot?.reachable_nodes,
      snapshot?.totalNodes,
      snapshot?.total_nodes,
      snapshot?.nodeCount,
      snapshot?.node_count,
      nodes.length
    ]){
      const n=finite(value);
      if(n>0)return n;
    }
    return 0;
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Node Health received no normalized snapshot");
    }

    const nodes=Array.isArray(snapshot.nodes)?snapshot.nodes:[];
    const total=denominator(snapshot,nodes);

    let latestHeight=finite(snapshot.latestHeight);
    if(!Number.isFinite(latestHeight)){
      for(const node of nodes){
        const h=finite(node?.height);
        if(Number.isFinite(h)){
          latestHeight=Number.isFinite(latestHeight)?Math.max(latestHeight,h):h;
        }
      }
    }

    let heightKnown=0;
    let synced=0;
    let minor=0;
    let lagging=0;
    let stale=0;

    let nowObserved=0;
    let nowTrue=0;
    let nowFalse=0;

    let dayObserved=0;
    let dayTrue=0;
    let dayFalse=0;

    let duplicateExtra=0;

    const networks=new Map();

    for(const node of nodes){
      const network=networkName(node?.network);
      const row=networks.get(network)||{
        network,
        nodes:0,
        heightKnown:0,
        synced:0,
        behind:0
      };
      row.nodes+=1;

      const h=finite(node?.height);
      if(Number.isFinite(h)&&Number.isFinite(latestHeight)){
        heightKnown+=1;
        row.heightKnown+=1;
        const lag=Math.max(0,latestHeight-h);

        if(lag<=2){
          synced+=1;
          row.synced+=1;
        }else{
          row.behind+=1;
          if(lag<=6)minor+=1;
          else if(lag<=24)lagging+=1;
          else stale+=1;
        }
      }

      if(typeof node?.reachableNow==="boolean"){
        nowObserved+=1;
        if(node.reachableNow)nowTrue+=1;
        else nowFalse+=1;
      }

      if(typeof node?.reachable24h==="boolean"){
        dayObserved+=1;
        if(node.reachable24h)dayTrue+=1;
        else dayFalse+=1;
      }

      const dup=finite(node?.duplicateCount);
      if(Number.isFinite(dup)&&dup>1){
        duplicateExtra+=Math.max(0,Math.round(dup)-1);
      }

      networks.set(network,row);
    }

    const networkRows=[...networks.values()]
      .map(row=>Object.freeze({
        ...row,
        syncShare:row.heightKnown>0?row.synced/row.heightKnown:NaN,
        heightCoverage:row.nodes>0?row.heightKnown/row.nodes:NaN
      }))
      .sort((a,b)=>b.nodes-a.nodes||a.network.localeCompare(b.network));

    const heightCoverage=total>0?heightKnown/total:NaN;
    const nowCoverage=total>0?nowObserved/total:NaN;
    const dayCoverage=total>0?dayObserved/total:NaN;
    const syncShare=heightKnown>0?synced/heightKnown:NaN;
    const nowReachShare=nowObserved>0?nowTrue/nowObserved:NaN;
    const dayReachShare=dayObserved>0?dayTrue/dayObserved:NaN;

    return Object.freeze({
      schema:"zzx-node-health-model-v2",
      total,
      nodeCount:nodes.length,
      latestHeight:Number.isFinite(latestHeight)?latestHeight:null,

      heightKnown,
      heightUnknown:Math.max(0,total-heightKnown),
      heightCoverage:Number.isFinite(heightCoverage)?heightCoverage:null,
      synced,
      behind:minor+lagging+stale,
      minor,
      lagging,
      stale,
      syncShare:Number.isFinite(syncShare)?syncShare:null,

      nowObserved,
      nowUnknown:Math.max(0,total-nowObserved),
      nowTrue,
      nowFalse,
      nowCoverage:Number.isFinite(nowCoverage)?nowCoverage:null,
      nowReachShare:Number.isFinite(nowReachShare)?nowReachShare:null,

      dayObserved,
      dayUnknown:Math.max(0,total-dayObserved),
      dayTrue,
      dayFalse,
      dayCoverage:Number.isFinite(dayCoverage)?dayCoverage:null,
      dayReachShare:Number.isFinite(dayReachShare)?dayReachShare:null,

      duplicateExtra,
      networkRows:Object.freeze(networkRows)
    });
  }

  W.ZZXNodeHealthModel=Object.freeze({
    __version:2,
    build
  });
})();

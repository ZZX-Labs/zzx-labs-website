// __partials/widgets/nodes/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesModel?.__version||0)>=5)return;

  const NETWORK_ORDER=["ipv4","ipv6","tor","i2p","cjdns","other"];

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeNetwork(value){
    const s=String(value??"").trim().toLowerCase();
    if(!s)return "other";
    if(["ipv4","ip4","v4"].includes(s))return "ipv4";
    if(["ipv6","ip6","v6"].includes(s))return "ipv6";
    if(["tor","onion","torv3","tor-v3"].includes(s))return "tor";
    if(s==="i2p")return "i2p";
    if(s==="cjdns")return "cjdns";
    return "other";
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

  function networkCounts(snapshot,nodes){
    const counts={ipv4:0,ipv6:0,tor:0,i2p:0,cjdns:0,other:0};

    if(nodes.length){
      for(const node of nodes){
        counts[normalizeNetwork(node?.network)]+=1;
      }
      return {counts,mode:"per-node"};
    }

    const aggregate=snapshot?.byNetwork;
    if(aggregate&&typeof aggregate==="object"){
      for(const [rawKey,rawValue] of Object.entries(aggregate)){
        const value=finite(rawValue);
        if(Number.isFinite(value)&&value>=0){
          counts[normalizeNetwork(rawKey)]+=value;
        }
      }
      return {counts,mode:"aggregate"};
    }

    return {counts,mode:"unavailable"};
  }

  function located(node){
    const code=String(node?.country??"").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) && node?.geoSynthetic!==true;
  }

  function hasAsn(node){
    const s=String(node?.asn??"").trim().toUpperCase().replace(/\s+/g,"");
    return /^AS?\d+$/.test(s);
  }

  function hasLatency(node){
    const value=finite(node?.latencyMs);
    return Number.isFinite(value)&&value>=0;
  }

  function hasHeight(node){
    const value=finite(node?.height);
    return Number.isFinite(value)&&value>=0;
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Nodes overview received no normalized snapshot");
    }

    const nodes=Array.isArray(snapshot.nodes)?snapshot.nodes:[];
    const total=denominator(snapshot,nodes);
    const decoded=finite(snapshot.nodeCount);
    const nodeCount=Number.isFinite(decoded)?decoded:nodes.length;

    const net=networkCounts(snapshot,nodes);
    const networkObserved=NETWORK_ORDER.reduce(
      (sum,key)=>sum+Number(net.counts[key]||0),
      0
    );
    const networkCoverage=total>0?Math.min(1,networkObserved/total):NaN;

    const networkRows=NETWORK_ORDER.map(network=>({
      network,
      nodes:Number(net.counts[network]||0),
      share:total>0?Number(net.counts[network]||0)/total:NaN
    }))
      .filter(row=>row.nodes>0)
      .sort((a,b)=>
        b.nodes-a.nodes ||
        NETWORK_ORDER.indexOf(a.network)-NETWORK_ORDER.indexOf(b.network)
      );

    const geoKnown=nodes.reduce((n,node)=>n+(located(node)?1:0),0);
    const asnKnown=nodes.reduce((n,node)=>n+(hasAsn(node)?1:0),0);
    const latencyKnown=nodes.reduce((n,node)=>n+(hasLatency(node)?1:0),0);
    const heightKnown=nodes.reduce((n,node)=>n+(hasHeight(node)?1:0),0);

    const aggregateLatencyCount=finite(snapshot?.latency?.count);
    const latencyCount=
      latencyKnown>0
        ? latencyKnown
        : Number.isFinite(aggregateLatencyCount)&&aggregateLatencyCount>0
          ? aggregateLatencyCount
          : 0;

    const aggregateGeoJoin=finite(snapshot?.geography?.joined);
    const geographyCount=
      geoKnown>0
        ? geoKnown
        : Number.isFinite(aggregateGeoJoin)&&aggregateGeoJoin>0
          ? Math.min(total,aggregateGeoJoin)
          : 0;

    const aggregateAsnGroups=Object.keys(snapshot?.byAsn||{}).length;
    const latestHeight=finite(snapshot.latestHeight);

    const coverageDenominator=total>0?total:nodeCount;
    const coverage=(count)=>coverageDenominator>0?Math.min(1,count/coverageDenominator):NaN;

    const dominant=networkRows[0]||null;

    return Object.freeze({
      schema:"zzx-nodes-overview-model-v5",
      total,
      nodeCount,
      latestHeight:Number.isFinite(latestHeight)?latestHeight:null,

      networkMode:net.mode,
      networkCounts:Object.freeze({...net.counts}),
      networkRows:Object.freeze(networkRows.map(Object.freeze)),
      networkObserved,
      networkCoverage:Number.isFinite(networkCoverage)?networkCoverage:null,
      dominant,

      geoKnown:geographyCount,
      geoCoverage:Number.isFinite(coverage(geographyCount))?coverage(geographyCount):null,
      geoJoined:Number.isFinite(aggregateGeoJoin)?aggregateGeoJoin:0,

      asnKnown,
      asnCoverage:Number.isFinite(coverage(asnKnown))?coverage(asnKnown):null,
      asnGroups:aggregateAsnGroups,

      latencyKnown:latencyCount,
      latencyCoverage:Number.isFinite(coverage(latencyCount))?coverage(latencyCount):null,

      heightKnown,
      heightCoverage:Number.isFinite(coverage(heightKnown))?coverage(heightKnown):null
    });
  }

  W.ZZXNodesModel=Object.freeze({
    __version:5,
    NETWORK_ORDER:Object.freeze([...NETWORK_ORDER]),
    normalizeNetwork,
    build
  });
})();

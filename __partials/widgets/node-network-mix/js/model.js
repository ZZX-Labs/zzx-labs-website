// __partials/widgets/node-network-mix/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeNetworkMixModel?.__version||0)>=2)return;

  const ORDER=["ipv4","ipv6","tor","i2p","cjdns","other"];

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeNetwork(value){
    const s=String(value??"").trim().toLowerCase();

    if(!s)return "other";
    if(s==="onion"||s==="torv3"||s==="tor-v3"||s==="tor")return "tor";
    if(s==="ipv4"||s==="ip4"||s==="v4")return "ipv4";
    if(s==="ipv6"||s==="ip6"||s==="v6")return "ipv6";
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

  function fromNodes(nodes){
    const counts={ipv4:0,ipv6:0,tor:0,i2p:0,cjdns:0,other:0};

    for(const node of nodes){
      counts[normalizeNetwork(node?.network)]+=1;
    }

    return counts;
  }

  function fromAggregate(snapshot){
    const src=snapshot?.byNetwork;
    if(!src||typeof src!=="object")return null;

    const counts={ipv4:0,ipv6:0,tor:0,i2p:0,cjdns:0,other:0};
    let seen=0;

    for(const [rawKey,rawValue] of Object.entries(src)){
      const value=finite(rawValue);
      if(!(Number.isFinite(value)&&value>=0))continue;

      counts[normalizeNetwork(rawKey)]+=value;
      seen+=value;
    }

    return seen>0?counts:null;
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Node Network Mix received no normalized snapshot");
    }

    const nodes=Array.isArray(snapshot.nodes)?snapshot.nodes:[];
    const total=denominator(snapshot,nodes);

    let mode="per-node";
    let counts=nodes.length?fromNodes(nodes):null;

    if(!counts){
      counts=fromAggregate(snapshot);
      mode="aggregate";
    }

    counts=counts||{ipv4:0,ipv6:0,tor:0,i2p:0,cjdns:0,other:0};

    const classifiedKnown=
      counts.ipv4+
      counts.ipv6+
      counts.tor+
      counts.i2p+
      counts.cjdns;

    const observed=
      classifiedKnown+
      counts.other;

    const unclassified=Math.max(0,total-observed);

    const rows=ORDER.map(network=>({
      network,
      nodes:counts[network]||0,
      share:total>0?(counts[network]||0)/total:NaN
    }))
      .filter(row=>row.nodes>0)
      .sort((a,b)=>
        b.nodes-a.nodes ||
        ORDER.indexOf(a.network)-ORDER.indexOf(b.network)
      )
      .map((row,index)=>Object.freeze({
        ...row,
        rank:index+1
      }));

    const dominant=rows[0]||null;
    const coverage=total>0?Math.min(1,observed/total):NaN;
    const knownCoverage=total>0?Math.min(1,classifiedKnown/total):NaN;

    return Object.freeze({
      schema:"zzx-node-network-mix-model-v2",
      mode,
      total,
      observed,
      classifiedKnown,
      other:counts.other,
      unclassified,
      coverage:Number.isFinite(coverage)?coverage:null,
      knownCoverage:Number.isFinite(knownCoverage)?knownCoverage:null,
      counts:Object.freeze({...counts}),
      rows:Object.freeze(rows),
      dominant
    });
  }

  W.ZZXNodeNetworkMixModel=Object.freeze({
    __version:2,
    ORDER:Object.freeze([...ORDER]),
    normalizeNetwork,
    build
  });
})();

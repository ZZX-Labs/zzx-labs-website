// __partials/widgets/node-latency/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeLatencyModel?.__version||0)>=2)return;

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

  function percentile(sorted,p){
    if(!Array.isArray(sorted)||!sorted.length)return NaN;
    const rank=(sorted.length-1)*p;
    const low=Math.floor(rank);
    const high=Math.ceil(rank);
    if(low===high)return sorted[low];
    const weight=rank-low;
    return sorted[low]*(1-weight)+sorted[high]*weight;
  }

  function summarize(values){
    const rows=(values||[])
      .map(finite)
      .filter(value=>Number.isFinite(value)&&value>=0)
      .sort((a,b)=>a-b);

    if(!rows.length){
      return {
        count:0,
        min:NaN,
        max:NaN,
        avg:NaN,
        p50:NaN,
        p90:NaN,
        p95:NaN,
        p99:NaN
      };
    }

    return {
      count:rows.length,
      min:rows[0],
      max:rows[rows.length-1],
      avg:rows.reduce((sum,value)=>sum+value,0)/rows.length,
      p50:percentile(rows,.50),
      p90:percentile(rows,.90),
      p95:percentile(rows,.95),
      p99:percentile(rows,.99)
    };
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

  function aggregateFallback(snapshot,total){
    const lat=snapshot?.latency;
    if(!lat||typeof lat!=="object")return null;

    const count=finite(lat.count);
    if(!(count>0))return null;

    const result={
      count,
      min:finite(lat.min),
      max:finite(lat.max),
      avg:finite(lat.avg),
      p50:finite(lat.p50),
      p90:finite(lat.p90),
      p95:finite(lat.p95),
      p99:finite(lat.p99)
    };

    if(
      !Number.isFinite(result.avg) &&
      !Number.isFinite(result.p50) &&
      !Number.isFinite(result.p95)
    ){
      return null;
    }

    return Object.freeze({
      schema:"zzx-node-latency-model-v2",
      mode:"aggregate-only",
      total,
      sampleCount:count,
      unsampled:Math.max(0,total-count),
      coverage:total>0?Math.min(1,count/total):NaN,
      invalidCount:0,
      ...result,
      buckets:null,
      networkRows:Object.freeze([])
    });
  }

  function build(snapshot){
    if(!snapshot||typeof snapshot!=="object"){
      throw new Error("Node Latency received no normalized snapshot");
    }

    const nodes=Array.isArray(snapshot.nodes)?snapshot.nodes:[];
    const total=denominator(snapshot,nodes);
    const samples=[];
    const networks=new Map();
    let latencyFieldsSeen=0;
    let invalidCount=0;

    for(const node of nodes){
      const network=networkName(node?.network);
      const net=networks.get(network)||{
        network,
        nodes:0,
        samples:[]
      };
      net.nodes+=1;

      const raw=node?.latencyMs;
      if(raw!==null&&raw!==undefined&&!(typeof raw==="string"&&!raw.trim())){
        latencyFieldsSeen+=1;
        const value=finite(raw);

        if(Number.isFinite(value)&&value>=0){
          samples.push(value);
          net.samples.push(value);
        }else{
          invalidCount+=1;
        }
      }

      networks.set(network,net);
    }

    if(!samples.length){
      const fallback=aggregateFallback(snapshot,total);
      if(fallback)return fallback;
    }

    const summary=summarize(samples);
    const sampleCount=summary.count;
    const coverage=total>0?sampleCount/total:NaN;

    const buckets={
      fast:0,
      good:0,
      moderate:0,
      slow:0,
      verySlow:0
    };

    for(const value of samples){
      if(value<50)buckets.fast+=1;
      else if(value<100)buckets.good+=1;
      else if(value<250)buckets.moderate+=1;
      else if(value<500)buckets.slow+=1;
      else buckets.verySlow+=1;
    }

    const networkRows=[...networks.values()]
      .map(row=>{
        const stats=summarize(row.samples);
        return Object.freeze({
          network:row.network,
          nodes:row.nodes,
          sampleCount:stats.count,
          coverage:row.nodes>0?stats.count/row.nodes:NaN,
          p50:stats.p50,
          avg:stats.avg,
          p95:stats.p95
        });
      })
      .sort((a,b)=>
        b.sampleCount-a.sampleCount ||
        b.nodes-a.nodes ||
        a.network.localeCompare(b.network)
      );

    return Object.freeze({
      schema:"zzx-node-latency-model-v2",
      mode:"per-node",
      total,
      sampleCount,
      unsampled:Math.max(0,total-sampleCount),
      coverage:Number.isFinite(coverage)?coverage:null,
      invalidCount,
      fieldsSeen:latencyFieldsSeen,
      min:summary.min,
      max:summary.max,
      avg:summary.avg,
      p50:summary.p50,
      p90:summary.p90,
      p95:summary.p95,
      p99:summary.p99,
      buckets:Object.freeze(buckets),
      networkRows:Object.freeze(networkRows)
    });
  }

  W.ZZXNodeLatencyModel=Object.freeze({
    __version:2,
    percentile,
    summarize,
    build
  });
})();

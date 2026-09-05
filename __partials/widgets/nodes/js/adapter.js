// __partials/widgets/nodes/js/adapter.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesAdapter?.__version>=3)return;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function unwrap(payload){
    let cur=payload;

    for(let i=0;i<8;i++){
      if(!cur||typeof cur!=="object")return {};

      const next=
        cur.data ??
        cur.results ??
        cur.snapshot ??
        cur.latest;

      if(next&&next!==cur){
        cur=next;
        continue;
      }

      return cur;
    }

    return cur&&typeof cur==="object"?cur:{};
  }

  function parseTimestamp(value){
    if(value==null)return NaN;

    const numeric=finite(value);

    if(Number.isFinite(numeric)){
      return numeric>0&&numeric<2e12
        ? numeric*1000
        : numeric;
    }

    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:NaN;
  }

  function nodeMapCounts(nodes){
    const counts={
      total:0,
      ipv4:0,
      ipv6:0,
      tor:0,
      other:0
    };

    if(!nodes||typeof nodes!=="object"||Array.isArray(nodes)){
      return counts;
    }

    for(const address of Object.keys(nodes)){
      const s=String(address||"").toLowerCase();
      counts.total+=1;

      if(s.includes(".onion")){
        counts.tor+=1;
      }else if(s.startsWith("[")||s.includes("]:")){
        counts.ipv6+=1;
      }else{
        const host=s.replace(/:\d+$/,"");
        if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)){
          counts.ipv4+=1;
        }else if(host.includes(":")){
          counts.ipv6+=1;
        }else{
          counts.other+=1;
        }
      }
    }

    return counts;
  }

  function networkCounts(obj){
    const c=
      obj?.counts ??
      obj?.network_counts ??
      obj?.network ??
      {};

    return {
      reachable:finite(
        c.reachable ??
        c.reachable_nodes ??
        obj?.reachable_nodes
      ),
      unreachable:finite(
        c.unreachable ??
        c.unreachable_nodes ??
        obj?.unreachable_nodes
      ),
      ipv4:finite(
        c.ipv4 ??
        c.ipv4_nodes ??
        obj?.ipv4_nodes
      ),
      ipv6:finite(
        c.ipv6 ??
        c.ipv6_nodes ??
        obj?.ipv6_nodes
      ),
      tor:finite(
        c.tor ??
        c.onion ??
        c.tor_nodes ??
        c.onion_nodes ??
        obj?.tor_nodes ??
        obj?.onion_nodes
      ),
      other:finite(
        c.other ??
        c.i2p ??
        c.cjdns ??
        obj?.other_nodes
      )
    };
  }

  function normalize(payload,kind){
    const d=unwrap(payload);
    const mapped=nodeMapCounts(d.nodes);
    const net=networkCounts(d);

    let total=finite(
      d.total_nodes ??
      d.totalNodes ??
      d.nodes_total ??
      d.total ??
      net.reachable
    );

    if(!(total>0)&&mapped.total>0)total=mapped.total;

    const reachable=
      Number.isFinite(net.reachable)&&net.reachable>0
        ? net.reachable
        : total;

    const ipv4=
      Number.isFinite(net.ipv4)
        ? net.ipv4
        : mapped.ipv4;

    const ipv6=
      Number.isFinite(net.ipv6)
        ? net.ipv6
        : mapped.ipv6;

    const tor=
      Number.isFinite(net.tor)
        ? net.tor
        : mapped.tor;

    let other=
      Number.isFinite(net.other)
        ? net.other
        : mapped.other;

    if(
      !(other>0) &&
      Number.isFinite(reachable) &&
      [ipv4,ipv6,tor].every(Number.isFinite)
    ){
      other=Math.max(0,reachable-ipv4-ipv6-tor);
    }

    const latestHeight=finite(
      d.latest_height ??
      d.latestHeight ??
      d.block_height ??
      d.height?.latest ??
      d.height
    );

    const updatedMs=parseTimestamp(
      d.generated_at ??
      d.updated_at ??
      d.timestamp ??
      d.ts
    );

    return {
      kind:String(kind||"unknown"),
      totalNodes:Number.isFinite(total)?total:NaN,
      reachableNodes:Number.isFinite(reachable)?reachable:NaN,
      unreachableNodes:Number.isFinite(net.unreachable)?net.unreachable:NaN,
      latestHeight,
      updatedMs,
      ipv4:Number.isFinite(ipv4)?ipv4:NaN,
      ipv6:Number.isFinite(ipv6)?ipv6:NaN,
      tor:Number.isFinite(tor)?tor:NaN,
      other:Number.isFinite(other)?other:NaN,
      hasNodeMap:mapped.total>0
    };
  }

  W.ZZXNodesAdapter=Object.freeze({
    __version:3,
    normalize
  });
})();

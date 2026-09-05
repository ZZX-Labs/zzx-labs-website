// __partials/widgets/knots-vs-core/js/provider.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXKnotsCoreProvider?.__version>=3)return;

  async function load(){
    if(!W.ZZXBitnodesData)throw new Error("ZZXBitnodesData unavailable");

    const [latestResult,aggregateResult]=await Promise.allSettled([
      W.ZZXBitnodesData.latest?.(),
      W.ZZXBitnodesData.aggregate?.()
    ]);

    const latest=latestResult.status==="fulfilled"?latestResult.value:null;
    const aggregate=aggregateResult.status==="fulfilled"?aggregateResult.value:null;

    let counts=null;
    let sourceParts=[];

    if(latest?.nodes && typeof latest.nodes==="object"){
      counts=W.ZZXKnotsCoreModel.parseSnapshotNodes(latest.nodes);
      sourceParts.push("latest snapshot nodes");
    }

    if((!counts || !(counts.total>0)) && W.ZZXBitnodesData.deriveAgentRows){
      try{
        const rows=W.ZZXBitnodesData.deriveAgentRows(latest||aggregate);
        const parsed=W.ZZXKnotsCoreModel.parseAgentRows(rows);

        if(parsed.total>0){
          counts=parsed;
          sourceParts.push("deriveAgentRows");
        }
      }catch(_){}
    }

    if(!counts || !(counts.total>0)){
      const topAgents=
        aggregate?.top?.agents ||
        aggregate?.agents ||
        [];

      const parsed=W.ZZXKnotsCoreModel.parseAgentRows(topAgents);
      if(parsed.total>0){
        counts=parsed;
        sourceParts.push("aggregate agents");
      }
    }

    if(!counts || !(counts.total>0)){
      throw new Error("no user-agent/client counts available in local Bitnodes data");
    }

    const network={
      unreachable:Number(
        aggregate?.counts?.unreachable ??
        aggregate?.unreachable_nodes
      )
    };

    const generated=
      aggregate?.generated_at ||
      latest?.generated_at ||
      latest?.timestamp ||
      null;

    return {
      model:W.ZZXKnotsCoreModel.finalize(counts,network),
      generated,
      source:sourceParts.join(" + ") || "ZZXBitnodesData"
    };
  }

  W.ZZXKnotsCoreProvider=Object.freeze({
    __version:3,
    load
  });
})();

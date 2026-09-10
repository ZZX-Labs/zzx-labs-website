(function(){
  "use strict";
  const W=window;
  if(W.ZZXKnotsCoreProvider?.__version>=5)return;

  async function load(force=false){
    if(!W.ZZXBitnodes?.load)throw new Error("ZZXBitnodes v7 unavailable");
    if(!W.ZZXNodesByVersionModel?.build)throw new Error("ZZXNodesByVersionModel unavailable");
    if(!W.ZZXKnotsCoreModel?.build)throw new Error("ZZXKnotsCoreModel unavailable");

    const shared=await W.ZZXBitnodes.load(force);
    const snapshot=shared?.snapshot;
    if(!snapshot)throw new Error("shared Bitnodes snapshot unavailable");

    let versionData=W.ZZXNodesByVersionLatest||W.ZZXNodesByVersion||null;
    if(
      !Array.isArray(versionData?.rows) ||
      !versionData.rows.length ||
      versionData.schema!=="zzx-nodes-by-version-export-v2"
    ){
      versionData=W.ZZXNodesByVersionModel.build(snapshot);
    }

    const model=W.ZZXKnotsCoreModel.build(versionData,snapshot,shared.raw);
    if(!(Number(model.total)>0))throw new Error("no reachable/versioned node population available");

    return Object.freeze({
      model,
      versionData,
      snapshot,
      generated:Number(snapshot.updatedMs)||null,
      source:shared.source||snapshot.source||"ZZXBitnodes",
      transport:shared.transport||"shared",
      stale:!!shared.stale
    });
  }

  W.ZZXKnotsCoreProvider=Object.freeze({__version:5,load});
})();

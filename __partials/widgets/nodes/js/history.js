// __partials/widgets/nodes/js/history.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXNodesHistory?.__version>=3)return;

  function load(){
    try{
      const raw=localStorage.getItem(
        W.ZZXNodesSources.historyKey
      );

      const rows=JSON.parse(raw||"[]");
      return Array.isArray(rows)
        ? rows.filter(
            row=>
              Array.isArray(row) &&
              Number.isFinite(Number(row[0])) &&
              Number.isFinite(Number(row[1]))
          )
        : [];
    }catch(_){
      return [];
    }
  }

  function save(rows){
    try{
      localStorage.setItem(
        W.ZZXNodesSources.historyKey,
        JSON.stringify(
          rows.slice(
            -W.ZZXNodesSources.historyMax
          )
        )
      );
    }catch(_){}
  }

  function push(total){
    const n=Number(total);
    if(!(Number.isFinite(n)&&n>0))return load();

    const rows=load();
    const now=Date.now();
    const last=rows[rows.length-1];

    // Avoid duplicate points when multiple widgets/mounts refresh together.
    if(
      !last ||
      Math.abs(now-Number(last[0]))>60_000 ||
      Number(last[1])!==n
    ){
      rows.push([now,n]);
      save(rows);
    }

    return rows;
  }

  W.ZZXNodesHistory=Object.freeze({
    __version:3,
    load,
    push
  });
})();

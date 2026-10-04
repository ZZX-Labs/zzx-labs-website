// __partials/widgets/btc-notabletxs/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXNotableTxModel?.__version >= 1) return;

  function finite(v) {
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function maxFinite(rows,key) {
    const values=rows.map(r=>finite(r[key])).filter(Number.isFinite);
    return values.length ? Math.max(...values) : NaN;
  }

  function build(rows) {
    const items=(Array.isArray(rows)?rows:[]).map(row=>{
      const fee=finite(row.fee);
      const vsize=finite(row.vsize);
      const value=finite(row.value);
      const feerate=Number.isFinite(fee)&&Number.isFinite(vsize)&&vsize>0?fee/vsize:NaN;

      return {
        ...row,
        fee,
        vsize,
        value,
        feerate,
        score:0,
        reason:"recent"
      };
    });

    const maxValue=maxFinite(items,"value");
    const maxFee=maxFinite(items,"fee");
    const maxRate=maxFinite(items,"feerate");
    const maxVsize=maxFinite(items,"vsize");

    for (const item of items) {
      const components=[
        Number.isFinite(item.value)&&maxValue>0 ? item.value/maxValue : 0,
        Number.isFinite(item.fee)&&maxFee>0 ? item.fee/maxFee : 0,
        Number.isFinite(item.feerate)&&maxRate>0 ? item.feerate/maxRate : 0,
        Number.isFinite(item.vsize)&&maxVsize>0 ? item.vsize/maxVsize : 0
      ];

      item.score=components.reduce((a,b)=>a+b,0);

      const reasons=[
        ["large value",components[0]],
        ["high fee",components[1]],
        ["high fee rate",components[2]],
        ["large vsize",components[3]]
      ].sort((a,b)=>b[1]-a[1]);

      item.reason=reasons[0][1]>0 ? reasons[0][0] : "recent";
    }

    return {
      items,
      maxValue,
      maxFee,
      maxRate,
      maxVsize
    };
  }

  function sort(items,key) {
    const rows=[...(items || [])];

    const field =
      key === "value" ? "value" :
      key === "fee" ? "fee" :
      key === "feerate" ? "feerate" :
      key === "vsize" ? "vsize" :
      "score";

    rows.sort((a,b)=>{
      const av=finite(a[field]),bv=finite(b[field]);
      if (Number.isFinite(av) && Number.isFinite(bv)) return bv-av;
      if (Number.isFinite(bv)) return 1;
      if (Number.isFinite(av)) return -1;
      return String(a.txid).localeCompare(String(b.txid));
    });

    return rows;
  }

  W.ZZXNotableTxModel = Object.freeze({
    __version:1,
    build,
    sort
  });
})();

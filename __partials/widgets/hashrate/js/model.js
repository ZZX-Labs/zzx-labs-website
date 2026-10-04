// __partials/widgets/hashrate/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateModel?.__version||0)>=2)return;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function timestampMs(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<=0)return NaN;
    return n<2e12?n*1000:n;
  }

  function toEH(value){
    const n=finite(value);
    if(!Number.isFinite(n)||n<0)return NaN;

    // Mempool-compatible mining feeds publish H/s. Values already expressed
    // in EH/s remain small enough to pass through unchanged.
    return n>1e12?n/1e18:n;
  }

  function normalizePoint(row){
    if(Array.isArray(row)){
      const t=timestampMs(row[0]);
      const eh=toEH(row[1]);
      return Number.isFinite(t)&&Number.isFinite(eh)
        ? {t,eh}
        : null;
    }

    const t=timestampMs(
      row?.timestamp ??
      row?.time ??
      row?.t ??
      row?.date
    );

    const eh=toEH(
      row?.avgHashrate ??
      row?.hashrate ??
      row?.hashRate ??
      row?.value ??
      row?.h
    );

    return Number.isFinite(t)&&Number.isFinite(eh)
      ? {t,eh}
      : null;
  }

  function normalizeHistory(payload){
    const source=
      payload?.hashrates ??
      payload?.history ??
      payload?.data ??
      payload?.values ??
      [];

    if(!Array.isArray(source))return [];

    const byTime=new Map();

    for(const raw of source){
      const point=normalizePoint(raw);
      if(!point)continue;
      byTime.set(point.t,point);
    }

    return [...byTime.values()].sort((a,b)=>a.t-b.t);
  }

  function stats(history){
    const values=history
      .map(point=>finite(point?.eh))
      .filter(value=>Number.isFinite(value)&&value>=0);

    if(!values.length){
      return {
        count:0,
        average:NaN,
        high:NaN,
        low:NaN,
        first:NaN,
        last:NaN,
        change:NaN,
        changePct:NaN
      };
    }

    const total=values.reduce((sum,value)=>sum+value,0);
    const first=values[0];
    const last=values.at(-1);
    const change=last-first;
    const changePct=first>0?change/first:NaN;

    return {
      count:values.length,
      average:total/values.length,
      high:Math.max(...values),
      low:Math.min(...values),
      first,
      last,
      change,
      changePct
    };
  }

  function build(payload){
    if(!payload||typeof payload!=="object"){
      throw new Error("Hashrate payload unavailable");
    }

    const history=normalizeHistory(payload);
    const s=stats(history);

    const currentFromPayload=toEH(
      payload.currentHashrate ??
      payload.current_hashrate ??
      payload.hashrate ??
      payload.current
    );

    const current=
      Number.isFinite(currentFromPayload)
        ? currentFromPayload
        : s.last;

    const difficulty=finite(
      payload.currentDifficulty ??
      payload.current_difficulty ??
      payload.difficulty
    );

    const updated=
      history.length
        ? history.at(-1).t
        : timestampMs(
            payload.updated ??
            payload.updatedAt ??
            payload.timestamp
          );

    return Object.freeze({
      schema:"zzx-hashrate-model-v2",
      history:Object.freeze(history.map(Object.freeze)),
      currentEH:Number.isFinite(current)?current:null,
      currentZH:Number.isFinite(current)?current/1000:null,
      difficulty:Number.isFinite(difficulty)?difficulty:null,
      stats:Object.freeze({
        count:s.count,
        average:Number.isFinite(s.average)?s.average:null,
        high:Number.isFinite(s.high)?s.high:null,
        low:Number.isFinite(s.low)?s.low:null,
        first:Number.isFinite(s.first)?s.first:null,
        last:Number.isFinite(s.last)?s.last:null,
        change:Number.isFinite(s.change)?s.change:null,
        changePct:Number.isFinite(s.changePct)?s.changePct:null
      }),
      updatedMs:Number.isFinite(updated)?updated:null
    });
  }

  function energy(currentEH,efficiencyJTH=30){
    const eh=finite(currentEH);
    const efficiency=finite(efficiencyJTH);

    if(!(eh>=0)||!(efficiency>0)){
      return {
        watts:NaN,
        gigawatts:NaN,
        gwh1:NaN,
        gwh24:NaN
      };
    }

    // 1 EH/s = 1,000,000 TH/s.
    const watts=eh*1e6*efficiency;
    const gigawatts=watts/1e9;

    return {
      watts,
      gigawatts,
      gwh1:gigawatts,
      gwh24:gigawatts*24
    };
  }

  W.ZZXHashrateModel=Object.freeze({
    __version:2,
    toEH,
    normalizeHistory,
    stats,
    build,
    energy
  });
})();

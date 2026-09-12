// __partials/widgets/difficulty-adjustment/js/provider.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXDifficultyProvider?.__version >= 2) return;

  const RETARGET_BLOCKS = 2016;
  const TARGET_BLOCK_MS = 10 * 60 * 1000;
  const MAX_REASONABLE_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;
  const MAX_REASONABLE_PAST_MS = 12 * 60 * 60 * 1000;

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function clamp(value,min,max){
    return Math.min(max,Math.max(min,value));
  }

  function bases(core) {
    const normalize = v => String(v || "").trim().replace(/\/+$/g, "");
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalize).filter(Boolean))];
  }

  async function getJSON(url) {
    if (W.ZZXAPI?.fetchRaw) {
      const r = await W.ZZXAPI.fetchRaw(url, {
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });
      return await r.json();
    }

    const r = await fetch(url, {
      cache:"no-store",
      credentials:"omit"
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function timestampMs(value){
    if(value===null||value===undefined||value==="") return NaN;

    if(typeof value==="string" && !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())){
      const parsed=Date.parse(value);
      return Number.isFinite(parsed)?parsed:NaN;
    }

    const n=finite(value);
    if(!Number.isFinite(n) || n<=0) return NaN;

    const abs=Math.abs(n);

    // Normalize by magnitude. Current Unix milliseconds are ~1.7e12 and
    // therefore must remain milliseconds rather than being multiplied by 1000.
    if(abs < 1e11) return n*1000;      // seconds
    if(abs < 1e14) return n;           // milliseconds
    if(abs < 1e17) return n/1000;      // microseconds
    return n/1e6;                      // nanoseconds
  }

  function remainingTimeMs(rawValue,remainingBlocks){
    const raw=finite(rawValue);
    if(!Number.isFinite(raw) || raw<0) return NaN;

    // mempool.space reports remainingTime in milliseconds. Compare both
    // interpretations against remaining blocks so compatible mirrors that
    // expose seconds are normalized correctly too.
    const expected=Number.isFinite(remainingBlocks)
      ? Math.max(0,remainingBlocks)*TARGET_BLOCK_MS
      : NaN;

    const asMs=raw;
    const asSeconds=raw*1000;

    if(!Number.isFinite(expected) || expected<=0){
      return asMs;
    }

    function distance(candidate){
      if(candidate===expected) return 0;
      const a=Math.max(candidate,1);
      const b=Math.max(expected,1);
      return Math.abs(Math.log(a/b));
    }

    return distance(asMs)<=distance(asSeconds)
      ? asMs
      : asSeconds;
  }

  function saneRetarget(ms,now,remainingBlocks){
    if(!Number.isFinite(ms)) return false;

    if(ms < now-MAX_REASONABLE_PAST_MS) return false;
    if(ms > now+MAX_REASONABLE_FUTURE_MS) return false;

    if(Number.isFinite(remainingBlocks) && remainingBlocks>0 && ms<now-60000){
      return false;
    }

    return true;
  }

  function normalize(raw){
    const now=Date.now();

    let remaining=finite(
      raw?.remainingBlocks ??
      raw?.blocksRemaining
    );

    let progress=finite(
      raw?.progressPercent ??
      raw?.progress
    );

    if(Number.isFinite(remaining)){
      remaining=clamp(Math.round(remaining),0,RETARGET_BLOCKS);
    }else if(Number.isFinite(progress)){
      progress=clamp(progress,0,100);
      remaining=clamp(
        Math.round(RETARGET_BLOCKS-(RETARGET_BLOCKS*(progress/100))),
        0,
        RETARGET_BLOCKS
      );
    }

    const completed=Number.isFinite(remaining)
      ? RETARGET_BLOCKS-remaining
      : NaN;

    if(!Number.isFinite(progress) && Number.isFinite(completed)){
      progress=(completed/RETARGET_BLOCKS)*100;
    }

    if(Number.isFinite(progress)){
      progress=clamp(progress,0,100);
    }

    const timeMs=remainingTimeMs(
      raw?.remainingTimeMs ??
      raw?.remainingTime,
      remaining
    );

    const rawRetarget=
      raw?.estimatedRetargetDate ??
      raw?.estimatedRetargetTimestamp ??
      raw?.nextRetargetTime;

    let retargetMs=timestampMs(rawRetarget);
    let retargetSanity="invalid";
    let retargetNote="API retarget timestamp failed sanity validation.";

    if(saneRetarget(retargetMs,now,remaining)){
      retargetSanity="valid";
      retargetNote="Retarget timestamp normalized and sanity-checked.";
    }else{
      const derived=Number.isFinite(timeMs)?now+timeMs:NaN;

      if(saneRetarget(derived,now,remaining)){
        retargetMs=derived;
        retargetSanity="derived";
        retargetNote=
          "API retarget timestamp was missing or invalid; derived from normalized remaining time.";
      }else{
        retargetMs=NaN;
        retargetSanity="invalid";
        retargetNote=
          "No sane retarget timestamp could be produced from the current payload.";
      }
    }

    const change=finite(
      raw?.difficultyChange ??
      raw?.difficultyChangePercent ??
      raw?.estimatedDifficultyAdjustment
    );

    const previous=finite(
      raw?.previousRetarget ??
      raw?.previousDifficultyChange
    );

    return {
      difficultyChangePercent:change,
      progressPercent:progress,
      remainingBlocks:remaining,
      completedBlocks:completed,
      remainingTimeMs:timeMs,
      estimatedRetargetMs:retargetMs,
      previousRetargetPercent:previous,
      retargetSanity,
      retargetNote,
      rawEstimatedRetarget:rawRetarget ?? null,
      rawRemainingTime:
        raw?.remainingTimeMs ??
        raw?.remainingTime ??
        null
    };
  }

  async function load(core) {
    let lastError = null;

    for (const base of bases(core)) {
      try {
        const raw=await getJSON(`${base}/v1/difficulty-adjustment`);
        const data=normalize(raw);

        if(
          !Number.isFinite(data.progressPercent) &&
          !Number.isFinite(data.remainingBlocks) &&
          !Number.isFinite(data.difficultyChangePercent)
        ){
          throw new Error("difficulty-adjustment payload contained no usable fields");
        }

        return {
          data,
          raw,
          base
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("difficulty-adjustment API unavailable");
  }

  W.ZZXDifficultyProvider = Object.freeze({
    __version:2,
    RETARGET_BLOCKS,
    TARGET_BLOCK_MS,
    timestampMs,
    remainingTimeMs,
    saneRetarget,
    normalize,
    load
  });
})();

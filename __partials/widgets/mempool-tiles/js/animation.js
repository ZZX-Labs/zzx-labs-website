// __partials/widgets/mempool-tiles/js/animation.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXMempoolTilesAnimation?.__version>=1)return;

  function ease(t){
    return 1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
  }

  function run(duration,onFrame,onDone){
    const ms=Math.max(0,Number(duration)||0);
    const started=performance.now();
    let raf=0;
    let cancelled=false;

    function frame(now){
      if(cancelled)return;
      const raw=ms>0?(now-started)/ms:1;
      const t=Math.max(0,Math.min(1,raw));
      onFrame?.(ease(t),t);

      if(t<1){
        raf=W.requestAnimationFrame(frame);
      }else{
        onDone?.();
      }
    }

    raf=W.requestAnimationFrame(frame);

    return ()=>{
      cancelled=true;
      W.cancelAnimationFrame(raf);
    };
  }

  W.ZZXMempoolTilesAnimation=Object.freeze({
    __version:1,
    ease,
    run
  });
})();

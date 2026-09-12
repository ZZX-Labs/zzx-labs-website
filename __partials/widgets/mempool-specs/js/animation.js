// __partials/widgets/mempool-specs/js/animation.js
(function(){
  "use strict";
  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Anim?.__version>=4)return;

  const reduced=()=>W.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

  class Anim{
    constructor(opts={}){this.ms=Number.isFinite(opts.ms)?opts.ms:820;this.raf=0;this.running=false}
    stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
    play(onFrame){
      this.stop();
      if(reduced()){onFrame?.(1);return}
      this.running=true;const t0=performance.now();
      const tick=now=>{
        if(!this.running)return;
        const u=Math.max(0,Math.min(1,(now-t0)/this.ms));
        onFrame?.(ease(u));
        if(u<1)this.raf=requestAnimationFrame(tick);else this.stop();
      };
      this.raf=requestAnimationFrame(tick);
    }
  }

  NS.Anim=Object.freeze({__version:4,Anim});
})();

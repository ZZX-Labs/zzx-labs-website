// __partials/widgets/mempool-specs/js/animation.js
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});

  if(NS.Anim?.__version>=5)return;

  const reduced=()=>W.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  const ease=t=>t<.5
    ? 4*t*t*t
    : 1-Math.pow(-2*t+2,3)/2;

  class Anim{
    constructor(opts={}){
      this.ms=Number.isFinite(opts.ms)?opts.ms:720;
      this.raf=0;
      this.running=false;
    }

    stop(){
      this.running=false;

      if(this.raf){
        W.cancelAnimationFrame(this.raf);
      }

      this.raf=0;
    }

    play(onFrame){
      this.stop();

      if(reduced()){
        onFrame?.(1);
        return;
      }

      this.running=true;
      const t0=W.performance.now();

      const tick=now=>{
        if(!this.running)return;

        const u=Math.max(
          0,
          Math.min(1,(now-t0)/this.ms)
        );

        onFrame?.(ease(u));

        if(u<1){
          this.raf=W.requestAnimationFrame(tick);
        }else{
          this.stop();
        }
      };

      this.raf=W.requestAnimationFrame(tick);
    }
  }

  NS.Anim=Object.freeze({
    __version:5,
    Anim
  });
})();

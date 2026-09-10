// __partials/widgets/hashrate-by-nation/js/viewport.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationViewport?.__version||0)>=3)return;

  function attach(root){
    if(!root)return ()=>{};

    let frame=0;

    const apply=()=>{
      frame=0;
      const width=Math.max(
        0,
        root.getBoundingClientRect().width||0
      );

      root.dataset.hbnLayout=
        width<520?"phone":
        width<820?"mobile":
        width<1050?"compact":
        "wide";
    };

    const schedule=()=>{
      if(frame)return;
      frame=W.requestAnimationFrame(apply);
    };

    apply();

    if("ResizeObserver" in W){
      const observer=new ResizeObserver(schedule);
      observer.observe(root);

      return ()=>{
        observer.disconnect();
        if(frame)W.cancelAnimationFrame(frame);
      };
    }

    W.addEventListener("resize",schedule,{passive:true});

    return ()=>{
      W.removeEventListener("resize",schedule);
      if(frame)W.cancelAnimationFrame(frame);
    };
  }

  W.ZZXHashrateNationViewport=Object.freeze({
    __version:3,
    attach
  });
})();

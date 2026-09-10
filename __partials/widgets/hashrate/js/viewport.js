// __partials/widgets/hashrate/js/viewport.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateViewport?.__version||0)>=2)return;

  function attach(root){
    if(!root)return ()=>{};

    let frame=0;
    const apply=()=>{
      frame=0;
      const width=Math.max(0,root.getBoundingClientRect().width||0);
      root.dataset.hrLayout=
        width<520?"phone":
        width<760?"mobile":
        width<980?"compact":
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

  W.ZZXHashrateViewport=Object.freeze({
    __version:2,
    attach
  });
})();

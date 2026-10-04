// __partials/widgets/knots-vs-core/js/viewport.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXKnotsCoreViewport?.__version||0)>=6)return;

  function attach(root){
    if(!root)return ()=>{};

    let frame=0;
    const apply=()=>{
      frame=0;
      const width=Math.max(0,root.getBoundingClientRect().width||0);
      root.dataset.kvcLayout=
        width<560?"phone":
        width<800?"mobile":
        width<1040?"compact":
        "wide";
    };

    const schedule=()=>{
      if(frame)return;
      frame=W.requestAnimationFrame(apply);
    };

    apply();

    if("ResizeObserver" in W){
      const ro=new ResizeObserver(schedule);
      ro.observe(root);
      return ()=>{
        ro.disconnect();
        if(frame)W.cancelAnimationFrame(frame);
      };
    }

    W.addEventListener("resize",schedule,{passive:true});
    return ()=>{
      W.removeEventListener("resize",schedule);
      if(frame)W.cancelAnimationFrame(frame);
    };
  }

  W.ZZXKnotsCoreViewport=Object.freeze({
    __version:6,
    attach
  });
})();

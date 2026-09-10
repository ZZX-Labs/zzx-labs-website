// __partials/widgets/node-network-mix/js/viewport.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodeNetworkMixViewport?.__version||0)>=2)return;

  function attach(root){
    if(!root)return ()=>{};

    let raf=0;

    const apply=()=>{
      raf=0;
      const width=Math.max(0,root.getBoundingClientRect().width||0);
      root.dataset.nodeNetworkMixLayout=
        width<460?"phone":
        width<760?"mobile":
        "wide";
    };

    const schedule=()=>{
      if(raf)return;
      raf=W.requestAnimationFrame(apply);
    };

    apply();

    if("ResizeObserver" in W){
      const observer=new ResizeObserver(schedule);
      observer.observe(root);
      return ()=>{
        observer.disconnect();
        if(raf)W.cancelAnimationFrame(raf);
      };
    }

    W.addEventListener("resize",schedule,{passive:true});
    return ()=>{
      W.removeEventListener("resize",schedule);
      if(raf)W.cancelAnimationFrame(raf);
    };
  }

  W.ZZXNodeNetworkMixViewport=Object.freeze({
    __version:2,
    attach
  });
})();

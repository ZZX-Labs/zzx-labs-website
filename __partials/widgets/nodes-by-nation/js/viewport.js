// __partials/widgets/nodes-by-nation/js/viewport.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByNationViewport?.__version||0)>=4)return;

  function attach(root){
    if(!root)return ()=>{};

    let raf=0;

    const apply=()=>{
      raf=0;
      const width=Math.max(0,root.getBoundingClientRect().width||0);
      root.dataset.nbnLayout=
        width<460?"phone":
        width<760?"mobile":
        width<1000?"compact":
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

  W.ZZXNodesByNationViewport=Object.freeze({
    __version:4,
    attach
  });
})();

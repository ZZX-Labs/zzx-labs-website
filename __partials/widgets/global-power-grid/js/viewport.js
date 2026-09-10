// __partials/widgets/global-power-grid/js/viewport.js
(function(){
  "use strict";const W=window;
  if(Number(W.ZZXGlobalPowerGridViewport?.__version||0)>=1)return;
  function attach(root){
    if(!root)return()=>{};
    let raf=0;
    const apply=()=>{raf=0;const w=root.getBoundingClientRect().width||0;root.dataset.gpgLayout=w<560?"phone":w<820?"mobile":w<1050?"compact":"wide"};
    const schedule=()=>{if(!raf)raf=requestAnimationFrame(apply)};
    apply();
    if("ResizeObserver"in W){const ro=new ResizeObserver(schedule);ro.observe(root);return()=>{ro.disconnect();if(raf)cancelAnimationFrame(raf)}}
    addEventListener("resize",schedule,{passive:true});return()=>{removeEventListener("resize",schedule);if(raf)cancelAnimationFrame(raf)}
  }
  W.ZZXGlobalPowerGridViewport=Object.freeze({__version:1,attach});
})();

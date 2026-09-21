(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerPurchasingPowerRegistry?.__version>=1)return;
  const pages=new Map();
  function register(spec){
    if(!spec||!spec.id)return null;
    const value=Object.freeze({
      id:String(spec.id),
      label:String(spec.label||spec.id),
      order:Number(spec.order||0),
      panel:"references"
    });
    pages.set(value.id,value);
    return value;
  }
  function get(id){return pages.get(String(id||""))||null}
  function list(){return [...pages.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label))}
  W.ZZXBitcoinTickerPurchasingPowerRegistry=Object.freeze({__version:1,register,get,list});
})();

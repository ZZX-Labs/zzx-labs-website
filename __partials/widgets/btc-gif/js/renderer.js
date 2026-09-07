(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCGifRenderer?.__version>=2)return;
  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function size(canvas){
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.max(1,finite(W.devicePixelRatio)||1);
    const width=Math.max(1,Math.round((rect.width||640)*dpr));
    const height=Math.max(1,Math.round((rect.height||360)*dpr));
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    return {width,height,dpr};
  }
  function fit(ctx,img,width,height){
    if(!img?.naturalWidth||!img?.naturalHeight)return;
    const scale=Math.max(width/img.naturalWidth,height/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
  }
  function draw(canvas,img){
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    const {width,height}=size(canvas);
    ctx.fillStyle="#000";
    ctx.fillRect(0,0,width,height);
    try{fit(ctx,img,width,height)}catch(_){}
  }
  W.ZZXBTCGifRenderer=Object.freeze({__version:2,draw,size});
})();

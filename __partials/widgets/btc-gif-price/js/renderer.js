(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCGifPriceRenderer?.__version>=3)return;
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
  function num(v,d=2){
    const n=finite(v);
    return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):"—";
  }
  function money(v){
    const n=finite(v);
    return Number.isFinite(n)?`$${n.toLocaleString(undefined,{maximumFractionDigits:2})}`:"—";
  }
  function pct(v){
    const n=finite(v);
    return Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(2)}%`:"—";
  }
  function draw(canvas,img,t,condition){
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    const {width,height,dpr}=size(canvas);
    ctx.fillStyle="#000";
    ctx.fillRect(0,0,width,height);
    try{fit(ctx,img,width,height)}catch(_){}

    const panelH=Math.max(112*dpr,height*.38);
    const y=height-panelH;
    const g=ctx.createLinearGradient(0,y,0,height);
    g.addColorStop(0,"rgba(0,0,0,.10)");
    g.addColorStop(.18,"rgba(0,0,0,.82)");
    g.addColorStop(1,"rgba(0,0,0,.97)");
    ctx.fillStyle=g;
    ctx.fillRect(0,y,width,panelH);

    const pad=12*dpr;
    const small=Math.max(9*dpr,10*dpr);
    const med=Math.max(11*dpr,12*dpr);
    const big=Math.max(18*dpr,23*dpr);
    const line1=height-78*dpr;
    const line2=height-54*dpr;
    const line3=height-32*dpr;
    const line4=height-12*dpr;

    ctx.textBaseline="alphabetic";
    ctx.font=`${big}px ui-monospace,monospace`;
    ctx.fillStyle="#c0d674";
    ctx.fillText(`${money(t?.priceUsd)} / BTC`,pad,line1);

    const change=pct(t?.priceChange24hPct);
    ctx.font=`${med}px ui-monospace,monospace`;
    ctx.fillStyle=finite(t?.priceChange24hPct)<0?"#d67474":"#e6a42b";
    const cw=ctx.measureText(change).width;
    ctx.fillText(change,Math.max(pad,width-pad-cw),line1);

    ctx.font=`${small}px ui-monospace,monospace`;
    ctx.fillStyle="#d8d8d8";
    const row2=[
      `VOL ${num(t?.volume24hBtc,1)} BTC`,
      `FEE ${num(t?.fastFeeSatVb,1)} sat/vB`,
      `MP ${num(t?.mempoolVMB,1)} vMB`,
      `HR ${num(t?.hashrateEH,1)} EH/s`
    ].join("  ·  ");
    ctx.fillText(row2,pad,line2);

    const row3=[
      `LN ${num(t?.lightningChannels,0)} ch`,
      `CAP ${num(t?.lightningCapacityBtc,1)} BTC`,
      `BLK ${Number.isFinite(finite(t?.blockHeight))?Math.trunc(finite(t.blockHeight)).toLocaleString():"—"}`
    ].join("  ·  ");
    ctx.fillStyle="#e6a42b";
    ctx.fillText(row3,pad,line3);

    const label=String(condition?.winner?.label||condition?.winner?.id||"Neutral").toUpperCase();
    const availability=(t?.availability||[]).join("+")||"partial";
    ctx.fillStyle="#9b9b9b";
    ctx.fillText(`${label}  ·  ${availability}`,pad,line4);
  }
  W.ZZXBTCGifPriceRenderer=Object.freeze({__version:3,draw,size});
})();

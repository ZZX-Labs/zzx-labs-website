(() => {
  "use strict";

  function sizeCanvas(canvas,minHeight=260) {
    const dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(320,Math.round(rect.width));
    const h=Math.max(minHeight,Math.round(rect.height||minHeight));
    const pw=Math.round(w*dpr), ph=Math.round(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx,w,h};
  }

  function grid(ctx,w,h) {
    ctx.fillStyle="#050505";
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="rgba(255,255,255,.03)";
    ctx.lineWidth=1;
    for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  }

  function drawGenerated(canvas,type,frequency,gain) {
    const {ctx,w,h}=sizeCanvas(canvas,260);
    grid(ctx,w,h);
    ctx.strokeStyle="#c0d674";
    ctx.lineWidth=2;
    ctx.beginPath();

    for(let x=0;x<w;x++) {
      const t=x/w*.012;
      let v;
      if(type==="sine")v=Math.sin(2*Math.PI*frequency*t);
      else if(type==="square")v=Math.sin(2*Math.PI*frequency*t)>=0?1:-1;
      else if(type==="sawtooth")v=2*((frequency*t)-Math.floor(.5+frequency*t));
      else if(type==="triangle")v=2*Math.abs(2*((frequency*t)-Math.floor(frequency*t+.5)))-1;
      else v=Math.sin(x*12.9898)*Math.cos(x*.137);
      const y=h/2-v*gain*(h*.42);
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();

    ctx.fillStyle="#969696";
    ctx.font='10px "IBM Plex Mono", monospace';
    ctx.fillText(`${type} · ${frequency} Hz`,8,14);
  }

  function drawAnalyserWave(canvas, analyser, timeData) {
    const {ctx,w,h}=sizeCanvas(canvas,330);
    grid(ctx,w,h);
    analyser.getByteTimeDomainData(timeData);
    ctx.strokeStyle="#c0d674";
    ctx.lineWidth=2;
    ctx.beginPath();

    const step=w/timeData.length;
    for(let i=0;i<timeData.length;i++) {
      const v=(timeData[i]-128)/128;
      const x=i*step;
      const y=h/2-v*(h*.42);
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  function drawAnalyserSpectrum(canvas, analyser, freqData) {
    const {ctx,w,h}=sizeCanvas(canvas,330);
    grid(ctx,w,h);
    analyser.getByteFrequencyData(freqData);
    const bw=w/freqData.length;

    for(let i=0;i<freqData.length;i++) {
      const n=freqData[i]/255;
      ctx.fillStyle=n>.72?"#e6a42b":"#c0d674";
      ctx.fillRect(i*bw,h-n*h,Math.max(1,bw*.82),n*h);
    }

    ctx.fillStyle="#969696";
    ctx.font='10px "IBM Plex Mono", monospace';
    ctx.fillText("FFT spectrum · 0 Hz → Nyquist",8,14);
  }

  window.AudioLabVisuals=Object.freeze({
    drawGenerated,
    drawAnalyserWave,
    drawAnalyserSpectrum
  });
})();

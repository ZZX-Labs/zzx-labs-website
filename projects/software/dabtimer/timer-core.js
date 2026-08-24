(()=>{"use strict";
class PhaseTimer{
  constructor(onTick,onPhase,onDone){
    this.onTick=onTick; this.onPhase=onPhase; this.onDone=onDone; this.reset();
  }
  configure(phases){
    this.phases=phases.map(x=>({...x,durationMs:Math.max(0,+x.durationMs||0)}));
    this.reset(false);
  }
  reset(notify=true){
    this.running=false; this.index=0; this.phaseStarted=0; this.elapsedBefore=0;
    if(this.raf) cancelAnimationFrame(this.raf);
    this.raf=0;
    if(notify) this.emit();
  }
  start(){
    if(!this.phases?.length||this.running)return;
    this.running=true; this.phaseStarted=performance.now(); this.loop();
  }
  pause(){
    if(!this.running)return;
    this.elapsedBefore+=performance.now()-this.phaseStarted;
    this.running=false; cancelAnimationFrame(this.raf); this.emit();
  }
  loop=()=>{
    if(!this.running)return;
    const now=performance.now(),p=this.phases[this.index],
      elapsed=this.elapsedBefore+now-this.phaseStarted,
      remain=Math.max(0,p.durationMs-elapsed);
    this.onTick?.(p,remain,elapsed,this.index,this.phases.length);
    if(remain<=0){
      this.index++; this.elapsedBefore=0; this.phaseStarted=now;
      if(this.index>=this.phases.length){
        this.running=false; this.onDone?.(); return;
      }
      this.onPhase?.(this.phases[this.index],this.index);
    }
    this.raf=requestAnimationFrame(this.loop);
  };
  emit(){
    const p=this.phases?.[this.index];
    if(p)this.onTick?.(p,Math.max(0,p.durationMs-this.elapsedBefore),this.elapsedBefore,this.index,this.phases.length);
  }
}
window.DabPhaseTimer=PhaseTimer;
})();

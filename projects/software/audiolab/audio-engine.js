(() => {
  "use strict";

  class AudioLabEngine {
    constructor() {
      this.ctx=null;
      this.input=null;
      this.filter=null;
      this.shaper=null;
      this.dry=null;
      this.delay=null;
      this.feedback=null;
      this.wet=null;
      this.master=null;
      this.analyser=null;
      this.activeSources=new Set();
      this.liveSynth=null;
    }

    ensure() {
      if(this.ctx) return this.ctx;

      this.ctx=new (window.AudioContext||window.webkitAudioContext)();

      this.input=this.ctx.createGain();
      this.filter=this.ctx.createBiquadFilter();
      this.shaper=this.ctx.createWaveShaper();
      this.dry=this.ctx.createGain();
      this.delay=this.ctx.createDelay(2);
      this.feedback=this.ctx.createGain();
      this.wet=this.ctx.createGain();
      this.master=this.ctx.createGain();
      this.analyser=this.ctx.createAnalyser();

      this.filter.type="lowpass";
      this.filter.frequency.value=16000;
      this.filter.Q.value=.7;
      this.shaper.curve=AudioLabDSP.makeDistortionCurve(0);
      this.shaper.oversample="4x";

      this.dry.gain.value=1;
      this.delay.delayTime.value=0;
      this.feedback.gain.value=.2;
      this.wet.gain.value=0;
      this.master.gain.value=.8;
      this.analyser.fftSize=2048;
      this.analyser.smoothingTimeConstant=.72;

      this.input.connect(this.filter);
      this.filter.connect(this.shaper);

      this.shaper.connect(this.dry);
      this.dry.connect(this.master);

      this.shaper.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.wet.connect(this.master);

      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      return this.ctx;
    }

    updateFx(settings) {
      this.ensure();
      this.filter.type=settings.filterType;
      this.filter.frequency.setTargetAtTime(Number(settings.filterFrequency),this.ctx.currentTime,.01);
      this.filter.Q.setTargetAtTime(Number(settings.filterQ),this.ctx.currentTime,.01);
      this.shaper.curve=AudioLabDSP.makeDistortionCurve(Number(settings.drive));
      this.delay.delayTime.setTargetAtTime(Number(settings.delay),this.ctx.currentTime,.01);
      this.feedback.gain.setTargetAtTime(Number(settings.feedback),this.ctx.currentTime,.01);
      this.wet.gain.setTargetAtTime(Number(settings.wet),this.ctx.currentTime,.01);
      this.master.gain.setTargetAtTime(Number(settings.master),this.ctx.currentTime,.01);
    }

    sourceChain(gain=.5,pan=0) {
      this.ensure();
      const gainNode=this.ctx.createGain();
      gainNode.gain.value=Number(gain);
      const panNode=this.ctx.createStereoPanner();
      panNode.pan.value=Number(pan);
      gainNode.connect(panNode);
      panNode.connect(this.input);
      return {gainNode,panNode};
    }

    playSynth({wave="sine",frequency=440,gain=.35,pan=0}) {
      this.stopSynth();
      this.ensure();
      const chain=this.sourceChain(gain,pan);
      let source;

      if(wave==="noise") {
        const len=this.ctx.sampleRate*2;
        const buffer=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
        const data=buffer.getChannelData(0);
        for(let i=0;i<len;i++)data[i]=Math.random()*2-1;
        source=this.ctx.createBufferSource();
        source.buffer=buffer;
        source.loop=true;
      } else {
        source=this.ctx.createOscillator();
        source.type=wave;
        source.frequency.value=Number(frequency);
      }

      source.connect(chain.gainNode);
      source.start();
      this.liveSynth={source,...chain};
      return this.liveSynth;
    }

    stopSynth() {
      if(this.liveSynth) {
        try{this.liveSynth.source.stop();}catch{}
        try{this.liveSynth.source.disconnect();}catch{}
        this.liveSynth=null;
      }
    }

    async decode(file) {
      this.ensure();
      return this.ctx.decodeAudioData(await file.arrayBuffer());
    }

    playBuffer(buffer,{gain=.8,pan=0,loop=false,onended=null}={}) {
      this.ensure();
      const source=this.ctx.createBufferSource();
      const chain=this.sourceChain(gain,pan);
      source.buffer=buffer;
      source.loop=Boolean(loop);
      source.connect(chain.gainNode);
      this.activeSources.add(source);
      source.onended=()=>{
        this.activeSources.delete(source);
        onended?.();
      };
      source.start();
      return {source,...chain};
    }

    stopAll() {
      this.stopSynth();
      for(const source of [...this.activeSources]) {
        try{source.stop();}catch{}
        this.activeSources.delete(source);
      }
    }
  }

  window.AudioLabEngine=AudioLabEngine;
})();

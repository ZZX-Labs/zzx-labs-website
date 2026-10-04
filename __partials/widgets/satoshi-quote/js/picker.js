// __partials/widgets/satoshi-quote/js/picker.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXSatoshiQuotePicker?.__version>=3)return;

  function secureIndex(n){
    const size=Number(n);
    if(!(Number.isInteger(size)&&size>0))return 0;
    if(size===1)return 0;

    const max=0x100000000;
    const limit=max-(max%size);
    const buf=new Uint32Array(1);

    do{
      crypto.getRandomValues(buf);
    }while(buf[0]>=limit);

    return buf[0]%size;
  }

  function shuffle(values){
    const out=[...(values||[])];

    for(let i=out.length-1;i>0;i--){
      const j=secureIndex(i+1);
      [out[i],out[j]]=[out[j],out[i]];
    }

    return out;
  }

  class Picker{
    constructor(){
      this.pool=[];
      this.order=[];
      this.cursor=-1;
      this.history=[];
      this.historyCursor=-1;
    }

    reset(items){
      this.pool=[...(items||[])];
      this.order=shuffle(
        this.pool.map((_,index)=>index)
      );
      this.cursor=-1;
      this.history=[];
      this.historyCursor=-1;
    }

    current(){
      if(this.historyCursor<0)return null;
      return this.pool[this.history[this.historyCursor]]||null;
    }

    next(){
      if(!this.pool.length)return null;

      if(this.historyCursor<this.history.length-1){
        this.historyCursor+=1;
        return this.current();
      }

      this.cursor+=1;

      if(this.cursor>=this.order.length){
        const last=this.history.length
          ? this.history[this.history.length-1]
          : -1;

        this.order=shuffle(
          this.pool.map((_,index)=>index)
        );

        if(
          this.order.length>1 &&
          this.order[0]===last
        ){
          const swapIndex=1+secureIndex(this.order.length-1);
          [this.order[0],this.order[swapIndex]]=[
            this.order[swapIndex],
            this.order[0]
          ];
        }

        this.cursor=0;
      }

      const index=this.order[this.cursor];
      this.history.push(index);

      if(this.history.length>256){
        this.history.shift();
      }

      this.historyCursor=this.history.length-1;
      return this.current();
    }

    prev(){
      if(this.historyCursor<=0)return this.current();
      this.historyCursor-=1;
      return this.current();
    }
  }

  W.ZZXSatoshiQuotePicker=Object.freeze({
    __version:3,
    secureIndex,
    shuffle,
    Picker
  });
})();

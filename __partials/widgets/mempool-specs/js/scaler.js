// __partials/widgets/mempool-specs/js/scaler.js
// v6 — BTC-value square scaling + compatibility vsize APIs
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Scaler?.__version>=6)return;

  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  const DEFAULTS={
    areaCellsPerVByte:1/850,
    minSideCells:1,
    maxSideCells:22,
    minAreaCells:1,
    maxAreaCells:2600,
    curveK:1,
    curveGamma:.92,
    valueK:.05,
    feeRateK:.02,
    weightToVBytes:1/4,

    // Spectacles value scaling. Tile *shape* is always square. These settings
    // only select the integer square side from the transaction's BTC value.
    valueMinSide:1,
    valueMaxSide:10,
    valueLowQuantile:.02,
    valueHighQuantile:.995,
    valueCurve:.74
  };

  function quantile(sorted,q){
    if(!sorted.length)return NaN;
    const p=clamp(Number(q)||0,0,1)*(sorted.length-1);
    const lo=Math.floor(p);
    const hi=Math.ceil(p);
    if(lo===hi)return sorted[lo];
    const t=p-lo;
    return sorted[lo]+(sorted[hi]-sorted[lo])*t;
  }

  class Scaler{
    constructor(opts={}){
      this.cfg={...DEFAULTS,...(opts||{})};
    }

    vbytesFromTx(tx){
      let vb=Number(tx?.vbytes??tx?.vsize);
      if(!Number.isFinite(vb)||vb<=0){
        const w=Number(tx?.weight);
        if(Number.isFinite(w)&&w>0)vb=w*this.cfg.weightToVBytes;
      }
      if(!Number.isFinite(vb)||vb<=0){
        const size=Number(tx?.size);
        if(Number.isFinite(size)&&size>0)vb=size;
      }
      return Number.isFinite(vb)&&vb>0?vb:NaN;
    }

    areaCellsFromVBytes(vb){
      const v=Number(vb);
      if(!Number.isFinite(v)||v<=0)return this.cfg.minAreaCells;
      return Math.max(
        this.cfg.minAreaCells,
        Math.round(clamp(v*this.cfg.areaCellsPerVByte,this.cfg.minAreaCells,this.cfg.maxAreaCells))
      );
    }

    areaCellsFromTx(tx,opts={}){
      let area=this.areaCellsFromVBytes(this.vbytesFromTx(tx));

      const feeUsd=Number(tx?.feeUsd);
      if(Number.isFinite(feeUsd)&&feeUsd>0){
        area*=1+this.cfg.valueK*Math.log10(1+feeUsd);
      }

      const feeRate=Number(tx?.packageFeeRate??tx?.feeRate);
      if(Number.isFinite(feeRate)&&feeRate>0){
        area*=1+this.cfg.feeRateK*Math.log10(1+feeRate);
      }

      return Math.max(
        this.cfg.minAreaCells,
        Math.round(clamp(area,this.cfg.minAreaCells,this.cfg.maxAreaCells))
      );
    }

    sideFromArea(area){
      let side=Math.sqrt(Math.max(1,Number(area)||1))*this.cfg.curveK;
      side=Math.pow(side,this.cfg.curveGamma);
      return Math.max(
        this.cfg.minSideCells,
        Math.round(clamp(side,this.cfg.minSideCells,this.cfg.maxSideCells))
      );
    }

    sideCellsFromVBytes(vb){
      return this.sideFromArea(this.areaCellsFromVBytes(vb));
    }

    sideCellsFromTx(tx,opts={}){
      return this.sideFromArea(this.areaCellsFromTx(tx,opts));
    }

    sideCellsFromWeight(weight){
      const w=Number(weight);
      return Number.isFinite(w)&&w>0
        ? this.sideCellsFromVBytes(w*this.cfg.weightToVBytes)
        : this.cfg.minSideCells;
    }

    makeBtcValueScale(items,opts={}){
      const values=(Array.isArray(items)?items:[])
        .map(row=>Number(row?.valueSats))
        .filter(value=>Number.isFinite(value)&&value>=0)
        .sort((a,b)=>a-b);

      const minSide=Math.max(
        1,
        Math.floor(Number(opts.minSide??this.cfg.valueMinSide)||1)
      );

      const maxSide=Math.max(
        minSide,
        Math.floor(Number(opts.maxSide??this.cfg.valueMaxSide)||this.cfg.valueMaxSide)
      );

      const lowQ=Number(opts.lowQuantile??this.cfg.valueLowQuantile);
      const highQ=Number(opts.highQuantile??this.cfg.valueHighQuantile);
      const curve=Math.max(.2,Number(opts.curve??this.cfg.valueCurve)||this.cfg.valueCurve);

      const low=values.length
        ? Math.max(0,quantile(values,lowQ))
        : 0;

      const high=values.length
        ? Math.max(low+1,quantile(values,highQ))
        : 1;

      return {
        minSide,
        maxSide,
        low,
        high,
        logLow:Math.log1p(low),
        logHigh:Math.log1p(high),
        curve,
        known:values.length
      };
    }

    sideCellsFromValueSats(valueSats,scale){
      const s=scale||this.makeBtcValueScale([]);
      const value=Number(valueSats);

      // Unknown or zero-value transactions never disappear. A 1x1 square is
      // still a real, selectable transaction tile.
      if(!Number.isFinite(value)||value<=s.low){
        return s.minSide;
      }

      if(value>=s.high){
        return s.maxSide;
      }

      const logValue=Math.log1p(Math.max(0,value));
      const span=Math.max(1e-9,s.logHigh-s.logLow);
      const t=clamp((logValue-s.logLow)/span,0,1);
      const shaped=Math.pow(t,s.curve);

      return clamp(
        s.minSide+Math.round(shaped*(s.maxSide-s.minSide)),
        s.minSide,
        s.maxSide
      );
    }

    areaCellsFromValueSats(valueSats,scale){
      const side=this.sideCellsFromValueSats(valueSats,scale);
      return side*side;
    }
  }

  Scaler.__version=6;
  Scaler.DEFAULTS=Object.freeze({...DEFAULTS});
  Scaler.quantile=quantile;
  NS.Scaler=Scaler;
})();

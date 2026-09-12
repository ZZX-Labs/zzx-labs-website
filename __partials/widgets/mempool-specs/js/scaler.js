// __partials/widgets/mempool-specs/js/scaler.js
// v5 — transaction vsize/fee scaling with compatibility APIs
(function(){
  "use strict";

  const W=window;
  const NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});
  if(NS.Scaler?.__version>=5)return;

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
    weightToVBytes:1/4
  };

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
  }

  Scaler.__version=5;
  Scaler.DEFAULTS=Object.freeze({...DEFAULTS});
  NS.Scaler=Scaler;
})();

(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinSupplyModel?.__version>=1)return;

  const SATS_PER_BTC=100000000n;
  const HALVING_INTERVAL=210000n;
  const INITIAL_SUBSIDY=5000000000n;
  const MAX_SUBSIDY_ERAS=33n;
  const FINAL_POSITIVE_SUBSIDY_HEIGHT=6929999n;
  const ZERO_SUBSIDY_HEIGHT=6930000n;

  let terminal=0n;
  for(let era=0n;era<MAX_SUBSIDY_ERAS;era++){
    const subsidy=INITIAL_SUBSIDY>>era;
    if(subsidy<=0n)break;
    terminal+=subsidy*HALVING_INTERVAL;
  }

  function heightInt(height){
    const n=Number(height);
    if(!Number.isFinite(n)||n<0)throw new Error("invalid block height");
    return BigInt(Math.floor(n));
  }

  function subsidySatsAtHeight(height){
    const h=heightInt(height);
    const era=h/HALVING_INTERVAL;
    if(era>=MAX_SUBSIDY_ERAS)return 0n;
    return INITIAL_SUBSIDY>>era;
  }

  function issuedSatsAtHeight(height){
    let blocks=heightInt(height)+1n;
    let era=0n;
    let total=0n;

    while(blocks>0n&&era<MAX_SUBSIDY_ERAS){
      const subsidy=INITIAL_SUBSIDY>>era;
      if(subsidy<=0n)break;
      const take=blocks>HALVING_INTERVAL?HALVING_INTERVAL:blocks;
      total+=take*subsidy;
      blocks-=take;
      era+=1n;
    }

    return total>terminal?terminal:total;
  }

  function remainingSatsAtHeight(height){
    const issued=issuedSatsAtHeight(height);
    return terminal>issued?terminal-issued:0n;
  }

  function eraAtHeight(height){
    return Number(heightInt(height)/HALVING_INTERVAL);
  }

  function nextHalvingHeight(height){
    const h=heightInt(height);
    const era=h/HALVING_INTERVAL;
    if(era>=MAX_SUBSIDY_ERAS-1n)return Number(ZERO_SUBSIDY_HEIGHT);
    return Number((era+1n)*HALVING_INTERVAL);
  }

  function blocksToNextHalving(height){
    const h=heightInt(height);
    const next=BigInt(nextHalvingHeight(Number(h)));
    return next>h?Number(next-h):0;
  }

  function positiveSubsidyBlocksRemaining(height){
    const h=heightInt(height);
    if(h>=FINAL_POSITIVE_SUBSIDY_HEIGHT)return 0;
    return Number(FINAL_POSITIVE_SUBSIDY_HEIGHT-h);
  }

  function btcFromSats(sats){
    const x=BigInt(sats);
    const whole=x/SATS_PER_BTC;
    const frac=(x%SATS_PER_BTC).toString().padStart(8,"0");
    return `${whole}.${frac}`;
  }

  function pct(part,totalValue){
    const a=Number(part),b=Number(totalValue);
    return b>0&&Number.isFinite(a)&&Number.isFinite(b)?a/b*100:NaN;
  }

  W.ZZXBitcoinSupplyModel=Object.freeze({
    __version:1,
    SATS_PER_BTC,
    HALVING_INTERVAL,
    INITIAL_SUBSIDY,
    MAX_SUBSIDY_ERAS,
    TERMINAL_SATS:terminal,
    TERMINAL_BTC:Number(terminal)/1e8,
    FINAL_POSITIVE_SUBSIDY_HEIGHT:Number(FINAL_POSITIVE_SUBSIDY_HEIGHT),
    ZERO_SUBSIDY_HEIGHT:Number(ZERO_SUBSIDY_HEIGHT),
    subsidySatsAtHeight,
    issuedSatsAtHeight,
    remainingSatsAtHeight,
    eraAtHeight,
    nextHalvingHeight,
    blocksToNextHalving,
    positiveSubsidyBlocksRemaining,
    btcFromSats,
    pct
  });
})();

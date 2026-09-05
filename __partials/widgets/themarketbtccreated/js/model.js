// __partials/widgets/themarketbtccreated/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTheMarketBTCCreatedModel?.__version>=4)return;

  const HALVING=210000;
  const TARGET_SECONDS=600;
  const SUPPLY_LIMIT=21000000;

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function positive(v,label){
    const n=finite(v);
    if(!(n>0))throw new Error(`${label} must be positive`);
    return n;
  }

  function nonnegative(v,label){
    const n=finite(v);
    if(!(n>=0))throw new Error(`${label} must be non-negative`);
    return n;
  }

  function networkFromHeight(height,supply){
    const h=Math.max(0,Math.trunc(finite(height)));
    if(!Number.isFinite(h))return null;

    const era=Math.floor(h/HALVING);
    const reward=50/Math.pow(2,era);
    const nextReward=reward/2;
    const nextHalving=(era+1)*HALVING;
    const blocksRemaining=Math.max(0,nextHalving-h);
    const countdown=blocksRemaining*TARGET_SECONDS;
    const remaining=Math.max(0,SUPPLY_LIMIT-finite(supply));

    return {
      height:h,
      remaining,
      remainingPct:(remaining/SUPPLY_LIMIT)*100,
      minedYear:((365.2425*24*60*60)/TARGET_SECONDS)*reward,
      reward,
      nextReward,
      nextHalving,
      blocksRemaining,
      countdown,
      halvingAt:new Date(Date.now()+countdown*1000).toISOString()
    };
  }

  function normalize(data){
    if(!data||typeof data!=="object"){
      throw new Error("invalid TheMarketBTCCreated payload");
    }

    const source=String(data.source||"");
    const isV3=source==="zzx_themarketbtccreated_deadopop_v3";
    const isV2=source==="zzx_themarketbtccreated_deadopop_v2";

    if(!isV3&&!isV2){
      throw new Error(
        `unsupported TheMarketBTCCreated schema: ${source||"missing source"}`
      );
    }

    const i=data.inputs||{};
    const o=data.outputs||{};
    const net=data.network||{};

    const globalCap=positive(
      i.current_global_crypto_market_cap_usd,
      "global market cap"
    );

    const btcCap=positive(
      i.current_bitcoin_market_cap_usd,
      "BTC market cap"
    );

    const spot=positive(
      i.spot_btc_price_usd,
      "BTC spot"
    );

    const supply=positive(
      i.btc_circulating_supply,
      "BTC circulating supply"
    );

    const deadLoss=nonnegative(
      i.deadopop_cumulative_estimated_value_lost_usd,
      "DeadOPop cumulative loss"
    );

    const shitcoinCap=Number.isFinite(finite(
      i.current_non_bitcoin_market_cap_usd
    ))
      ? finite(i.current_non_bitcoin_market_cap_usd)
      : Math.max(0,globalCap-btcCap);

    const theoretical=globalCap/supply;
    const adjusted=(globalCap+deadLoss)/supply;

    const deltaUSD=theoretical-spot;
    const deltaPct=(deltaUSD/spot)*100;
    const totalDeltaUSD=adjusted-spot;
    const totalDeltaPct=(totalDeltaUSD/spot)*100;

    const capturePct=(btcCap/(globalCap+deadLoss))*100;
    const inverseCapturePct=100-capturePct;

    const deadTotal=finite(i.deadopop_total_dead_coins);
    const deadValued=finite(i.deadopop_valued_dead_coins);
    const deadUnvalued=finite(i.deadopop_unvalued_dead_coins);

    let deadCoverage=finite(i.deadopop_valuation_coverage_percent);

    if(
      !Number.isFinite(deadCoverage) &&
      Number.isFinite(deadTotal) &&
      deadTotal>0 &&
      Number.isFinite(deadValued)
    ){
      deadCoverage=(deadValued/deadTotal)*100;
    }

    const publishedNetwork={
      height:finite(net.block_height),
      remaining:finite(net.btc_remaining_to_mine),
      remainingPct:finite(net.btc_remaining_to_mine_percent),
      minedYear:finite(net.estimated_btc_mined_this_year),
      reward:finite(net.current_block_reward_btc),
      nextReward:finite(net.next_block_reward_btc),
      nextHalving:finite(net.next_halving_height),
      blocksRemaining:finite(net.blocks_remaining_until_halving),
      halvingAt:String(net.estimated_halving_at||""),
      countdown:finite(net.halving_countdown_seconds)
    };

    const fallbackNetwork=networkFromHeight(
      publishedNetwork.height,
      supply
    );

    const pick=(a,b)=>
      Number.isFinite(a)?a:b;

    const network={
      height:pick(publishedNetwork.height,fallbackNetwork?.height),
      remaining:pick(publishedNetwork.remaining,fallbackNetwork?.remaining),
      remainingPct:pick(publishedNetwork.remainingPct,fallbackNetwork?.remainingPct),
      minedYear:pick(publishedNetwork.minedYear,fallbackNetwork?.minedYear),
      reward:pick(publishedNetwork.reward,fallbackNetwork?.reward),
      nextReward:pick(publishedNetwork.nextReward,fallbackNetwork?.nextReward),
      nextHalving:pick(publishedNetwork.nextHalving,fallbackNetwork?.nextHalving),
      blocksRemaining:pick(publishedNetwork.blocksRemaining,fallbackNetwork?.blocksRemaining),
      halvingAt:publishedNetwork.halvingAt||fallbackNetwork?.halvingAt||"",
      countdown:pick(publishedNetwork.countdown,fallbackNetwork?.countdown)
    };

    return {
      schemaVersion:isV3?"v3":"v2-compat",
      updatedAt:String(data.updated_at||""),
      modelName:String(data.model?.name||"TheMarketBTCCreated + DeadOPop"),
      warning:String(
        data.model?.warning||
        "Appraisal/accounting model, not a prediction of spot price."
      ),
      marketSource:String(data.market_data_source||"unknown"),
      blockSource:String(data.block_data_source||"unknown"),

      globalCap,
      btcCap,
      shitcoinCap,
      deadLoss,
      deadTotal,
      deadValued,
      deadUnvalued,
      deadCoverage,

      spot,
      supply,
      theoretical:Number.isFinite(finite(o.the_market_btc_created_price_usd))
        ? finite(o.the_market_btc_created_price_usd)
        : theoretical,
      adjusted:Number.isFinite(finite(o.deadopop_adjusted_appraised_btc_price_usd))
        ? finite(o.deadopop_adjusted_appraised_btc_price_usd)
        : adjusted,

      deltaUSD:Number.isFinite(finite(o.baseline_delta_usd))
        ? finite(o.baseline_delta_usd)
        : deltaUSD,
      deltaPct:Number.isFinite(finite(o.baseline_delta_percent))
        ? finite(o.baseline_delta_percent)
        : deltaPct,
      invDeltaPct:Number.isFinite(finite(o.inverse_baseline_delta_percent))
        ? finite(o.inverse_baseline_delta_percent)
        : -deltaPct,

      totalDeltaUSD:Number.isFinite(finite(o.total_delta_usd))
        ? finite(o.total_delta_usd)
        : totalDeltaUSD,
      totalDeltaPct:Number.isFinite(finite(o.total_delta_percent))
        ? finite(o.total_delta_percent)
        : totalDeltaPct,
      invTotalDeltaPct:Number.isFinite(finite(o.inverse_total_delta_percent))
        ? finite(o.inverse_total_delta_percent)
        : -totalDeltaPct,

      capturePct:Number.isFinite(finite(
        o.btc_capture_percent_of_created_market_plus_deadopop
      ))
        ? finite(o.btc_capture_percent_of_created_market_plus_deadopop)
        : capturePct,

      inverseCapturePct:Number.isFinite(finite(o.inverse_unabsorbed_percent))
        ? finite(o.inverse_unabsorbed_percent)
        : inverseCapturePct,

      multiple:Number.isFinite(finite(o.appraisal_multiple_over_spot))
        ? finite(o.appraisal_multiple_over_spot)
        : adjusted/spot,

      network
    };
  }

  W.ZZXTheMarketBTCCreatedModel=Object.freeze({
    __version:4,
    normalize,
    networkFromHeight
  });
})();

"use strict";

const fs=require("fs");
const vm=require("vm");

global.window=global;
global.ZZXFX={
  async rate(){throw new Error("network FX fallback should not be required by local fixture test");}
};

function load(path){
  vm.runInThisContext(fs.readFileSync(path,"utf8"),{filename:path});
}
function json(path){return JSON.parse(fs.readFileSync(path,"utf8"));}
function req(ok,msg){if(!ok)throw new Error(msg);}

load("__partials/widgets/bitcoin-ticker/js/fx.js");
load("__partials/widgets/bitcoin-ticker/js/selection.js");
load("__partials/widgets/bitcoin-ticker/js/units.js");

const latest=json("bitcoin/bpi/api/latest.json");
const exchangesData=json("bitcoin/bpi/api/exchanges.json");
const currenciesData=json("bitcoin/bpi/api/currencies.json");
const ratesData=json("bitcoin/bpi/api/exchange_rates.json");
const symbolsData=json("bitcoin/bpi/api/symbols.json");

const config={
  latest,
  exchangesData,
  currenciesData,
  ratesData,
  symbolsData,
  fiat:ZZXBitcoinTickerFX.catalog(currenciesData),
  symbols:ZZXBitcoinTickerFX.symbols(symbolsData),
  rates:ZZXBitcoinTickerFX.localRates(ratesData)
};

req(config.fiat.order.includes("USD"),"USD missing from fiat catalog");
req(config.rates.get("USD")===1,"USD FX base missing");
req(config.symbols.get("USD")==="$","USD symbol missing");

const bpi=ZZXBitcoinTickerSelection.resolve(config,"bpi");
req(Number.isFinite(bpi?.priceUsd)&&bpi.priceUsd>0,"repo latest.json does not resolve canonical BPI");

const globalBpi=ZZXBitcoinTickerSelection.resolve(config,"global-bpi");
req(Number.isFinite(globalBpi?.priceUsd)&&globalBpi.priceUsd>0,"repo latest.json does not resolve Global BPI");

const eligible=[...ZZXBitcoinTickerSelection.exchangeMap(config)]
  .filter(([id])=>ZZXBitcoinTickerSelection.resolve(config,`exchange:${id}`));
req(eligible.length>0,"no eligible exchange source resolves from repo fixtures");

const units=ZZXBitcoinTickerUnits.units;
req(Array.isArray(units)&&units.length>=4,"denomination registry unexpectedly small");
for(const unit of units){
  const v=ZZXBitcoinTickerUnits.value(bpi.priceUsd,unit);
  req(Number.isFinite(v)&&v>=0,`invalid denomination value for ${unit.label}`);
}

(async()=>{
  const usd=await ZZXBitcoinTickerFX.rate(config,"USD");
  req(usd.rate===1,"USD FX rate failed");

  const localCode=config.fiat.order.find(code=>code!=="USD"&&Number(config.rates.get(code))>0);
  if(localCode){
    const r=await ZZXBitcoinTickerFX.rate(config,localCode);
    req(Number.isFinite(r.rate)&&r.rate>0,`local FX rate failed for ${localCode}`);
    const q=ZZXBitcoinTickerFX.quoteFromUsd(bpi.priceUsd,r.rate);
    req(Number.isFinite(q)&&q>0,`quote conversion failed for ${localCode}`);
  }

  console.log(
    `bitcoin_ticker_data_selftest: PASS price=${bpi.priceUsd} `+
    `fiat=${config.fiat.order.length} rates=${config.rates.size} eligible_exchanges=${eligible.length} units=${units.length}`
  );
})().catch(error=>{
  console.error(error);
  process.exit(1);
});

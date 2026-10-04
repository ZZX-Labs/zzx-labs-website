"use strict";

const fs=require("fs");
const vm=require("vm");

const events=[];
global.window=global;
global.CustomEvent=class CustomEvent{
  constructor(type,init={}){this.type=type;this.detail=init.detail;}
};
global.dispatchEvent=event=>{events.push(event);return true;};
global.ZZXBPIRegistry={
  selected:null,
  setSelected(value){this.selected=value;}
};

global.ZZXGlobalBPI={
  price_usd:101000,
  volume_24h_btc:22222,
  updated_at:"2026-09-21T20:00:00Z",
  method:"test-global"
};

const source=fs.readFileSync(
  "__partials/widgets/bitcoin-ticker/js/selection.js",
  "utf8"
);
vm.runInThisContext(source,{filename:"selection.js"});

function requireTrue(value,message){
  if(!value)throw new Error(message);
}

const config={
  exchangesData:{
    sources:{
      alpha:{label:"Alpha",enabled:true},
      bad:{label:"Bad",enabled:true,status:"quarantined-test"}
    }
  },
  latest:{
    price_usd:100000,
    high_24h:103000,
    low_24h:98000,
    volume_24h_btc:12345,
    updated_at:"2026-09-21T20:00:00Z",
    exchanges:{
      alpha:{label:"Alpha",price_usd:100250,raw_price_usd:100250,volume_24h_btc:1000,weight:.4,updated_at:"2026-09-21T20:00:00Z"},
      beta:{label:"Beta",price_usd:99750,raw_price_usd:99750,volume_24h_btc:900,weight:.3,updated_at:"2026-09-21T20:00:00Z"},
      bad:{label:"Bad",price_usd:200000,raw_price_usd:200000,volume_24h_btc:100,weight:.3,updated_at:"2026-09-21T20:00:00Z"}
    }
  }
};

const bpi=ZZXBitcoinTickerSelection.resolve(config,"bpi");
requireTrue(bpi?.priceUsd===100000,"canonical BPI resolution failed");

const globalBpi=ZZXBitcoinTickerSelection.resolve(config,"global-bpi");
requireTrue(globalBpi?.priceUsd===101000,"global BPI resolution failed");

const alpha=ZZXBitcoinTickerSelection.resolve(config,"exchange:alpha");
requireTrue(alpha?.priceUsd===100250,"eligible exchange resolution failed");

const bad=ZZXBitcoinTickerSelection.resolve(config,"exchange:bad");
requireTrue(bad===null,"quarantined exchange must not resolve");

const published=ZZXBitcoinTickerSelection.publish({
  sourceId:"bpi",
  sourceType:"bpi",
  label:"BPI",
  currency:"USD",
  priceUsd:100000,
  priceQuote:100000,
  fxRate:1,
  fxProvider:"USD-base",
  highUsd:103000,
  lowUsd:98000,
  volumeBtc:12345,
  timestamp:"2026-09-21T20:00:00Z",
  mode:"bpi"
});

requireTrue(ZZXBPISelection===published,"ZZXBPISelection publication failed");
requireTrue(ZZXSelectedBPI===published,"ZZXSelectedBPI compatibility publication failed");
requireTrue(ZZXBPIRegistry.selected===published,"BPI registry publication failed");
requireTrue(events.some(e=>e.type==="zzx:bpi-selection"&&e.detail===published),"zzx:bpi-selection event missing");
requireTrue(Object.isFrozen(published),"published selection must remain immutable");

console.log("bitcoin_ticker_selection_selftest: PASS");

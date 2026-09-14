"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");
const root=path.resolve(__dirname,"..");

function assert(condition,message){
  if(!condition)throw new Error(message);
}

function context(extra={}){
  const value={console,Map,Set,Date,Math,Number,String,Array,Object,JSON,Intl,...extra};
  value.window=value;
  vm.createContext(value);
  return value;
}

function load(ctx,file){
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),ctx,{filename:file});
}

function source(file){
  return fs.readFileSync(path.join(root,file),"utf8");
}

function tx(index){
  const txid=index.toString(16).padStart(64,"0");
  return {
    txid,
    id:txid,
    valueSats:Math.max(1,Math.round(Math.exp((index%61)/7)*100)),
    vsize:60+(index*7919)%120000,
    feeSats:100+(index*101)%500000,
    feeRate:.1+(index*17)%250,
    packageFeeRate:.1+(index*17)%250,
    rank:index,
    firstSeen:Date.now()-index*1000,
    type:index%9?"standard":"data",
    rbf:index%3===0
  };
}

function atlasTests(){
  const ctx=context();
  for(const file of ["js/sorter.js","js/scaler.js","js/packer.js","js/layout.js"]){
    load(ctx,file);
  }

  for(const count of [1,2,3,4,5,6,7,8,9,10,11,14,15,16,17,31,64,127,512,1000,3000,5000]){
    const candidate=Array.from({length:count},(_,index)=>tx(index+1));
    const layout=ctx.ZZXMempoolMosaicLayout.build({
      candidate,
      candidateVsize:candidate.reduce((sum,row)=>sum+row.vsize,0),
      targetVbytes:1_000_000
    },{scaleMode:"value",sortMode:"priority",seed:0xdeadbeef});

    assert(layout.sourceCount===count,`candidate identity count failed at ${count}`);
    assert(Math.abs(layout.coverage-1)<1e-9,`coverage failed at ${count}`);

    if(ctx.ZZXMempoolMosaicPacker.isConstructible(count)){
      assert(layout.fragmentCount===0,`unexpected continuation leaf at ${count}`);
      assert(layout.leafCount===count,`one-square-per-transaction failed at ${count}`);
      assert(new Set(layout.tiles.map(tile=>tile.txid)).size===count,`duplicate transaction identity at ${count}`);
    }

    for(const tile of layout.tiles){
      assert(tile.side>0,`non-positive square at ${count}`);
      assert(tile.x>=-1e-10&&tile.y>=-1e-10,"negative square origin");
      assert(tile.x+tile.side<=1+1e-9&&tile.y+tile.side<=1+1e-9,"square exceeded atlas");
    }

    for(let y=0;y<72;y++)for(let x=0;x<72;x++){
      const hit=ctx.ZZXMempoolMosaicLayout.hit(layout,(x+.5)/72,(y+.5)/72);
      assert(hit?.txid,`sampled atlas gap at ${count}:${x},${y}`);
    }
  }
}

function themeTests(){
  const ctx=context({fetch:async()=>{throw new Error("offline")}});
  load(ctx,"js/themes.js");
  const themes=ctx.ZZXMempoolMosaicThemes.list();
  assert(themes.length>=32,"fewer than 32 themes");
  assert(new Set(themes.map(theme=>theme.id)).size===themes.length,"duplicate theme id");
}

function widgetContractTests(){
  const html=source("widget.html");
  const widget=source("widget.js");
  const inspector=source("js/inspector.js");
  const css=source("widget.css");
  const required=[
    "data-widget-root=\"mempool-mosaic\"","data-mm-canvas","data-mm-stage",
    "data-mm-summary","data-mm-theme-select","data-mm-coverage-value",
    "data-mm-reader-list","data-mm-inspector-body","data-mm-raw-json","data-mm-raw-hex"
  ];
  for(const token of required)assert(html.includes(token),`missing widget contract ${token}`);
  for(const file of [html,widget,inspector,css]){
    assert(!/mempool-tiles|ZZXMempoolTiles|data-mt-|--mt-|\.mt-/.test(file),"cross-widget namespace leak");
  }
  const modulePaths=[...widget.matchAll(/\["ZZXMempoolMosaic[^\"]+","([^"]+\.js)",\d+\]/g)].map(match=>match[1]);
  assert(modulePaths.length===16,"unexpected module manifest size");
  for(const file of modulePaths)assert(fs.existsSync(path.join(root,file)),`missing runtime module ${file}`);
}

async function readerFallbackTests(){
  const backing=new Map();
  const localStorage={
    getItem:key=>backing.has(key)?backing.get(key):null,
    setItem:(key,value)=>backing.set(key,String(value))
  };
  let ctx=context({localStorage});
  load(ctx,"js/reader-store.js");
  const txid="ab".repeat(32);
  await ctx.ZZXMempoolMosaicReaderStore.pin(txid,{txid,vsize:141,feeRate:4.2,valueSats:21000},64);
  assert((await ctx.ZZXMempoolMosaicReaderStore.list()).length===1,"reader pin failed");

  ctx=context({localStorage});
  load(ctx,"js/reader-store.js");
  const restored=await ctx.ZZXMempoolMosaicReaderStore.list();
  assert(restored.length===1&&restored[0].txid===txid,"reader summary did not survive reload");
}

(async()=>{
  atlasTests();
  themeTests();
  widgetContractTests();
  await readerFallbackTests();
  console.log("Mempool Mosaic self-test: PASS");
})().catch(error=>{
  console.error(error.stack||error);
  process.exitCode=1;
});

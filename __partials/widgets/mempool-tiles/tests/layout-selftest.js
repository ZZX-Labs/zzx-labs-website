#!/usr/bin/env node
"use strict";

global.window=global;
require("../js/sorter.js");
require("../js/scaler.js");
require("../js/layout.js");
require("../js/themes.js");

const L=global.ZZXMempoolTilesLayout;
const T=global.ZZXMempoolTilesThemes;

function assert(condition,message){
  if(!condition)throw new Error(message);
}

function tx(index){
  const id=index.toString(16).padStart(64,"0").slice(-64);
  return {
    txid:id,
    rank:index,
    vsize:90+((index*7919)%100000),
    valueSats:500+((index*15485863)%5000000000),
    feeRate:.2+((index*3571)%12000)/100,
    packageFeeRate:.2+((index*3571)%12000)/100,
    rbf:index%3===0,
    type:index%11===0?"op_return":"p2wpkh"
  };
}

function verifyTree(node){
  if(!node?.children?.length)return node?node.side*node.side:0;
  let sum=0;
  for(const child of node.children){
    assert(child.x>=node.x-1e-12,"child escapes parent left");
    assert(child.y>=node.y-1e-12,"child escapes parent top");
    assert(child.x+child.side<=node.x+node.side+1e-12,"child escapes parent right");
    assert(child.y+child.side<=node.y+node.side+1e-12,"child escapes parent bottom");
    sum+=verifyTree(child);
  }
  const own=node.side*node.side;
  assert(Math.abs(sum-own)<1e-9,`area conservation failed: ${sum} != ${own}`);
  return own;
}

for(const count of [1,4,6,7,9,10,12,15,64,257,1000,2500,4096]){
  const model={candidate:Array.from({length:count},(_,i)=>tx(i))};
  const layout=L.build(model,{scaleMode:"vsize",sortMode:"priority",seed:0xdeadbeef});
  assert(layout.tiles.length===count,`count ${count}: wrong tile count`);
  assert(layout.byTxid.size===count,`count ${count}: duplicate/missing txids`);
  assert(layout.exactCover===true,`count ${count}: expected exact cover`);
  assert(Math.abs(layout.tiles.reduce((s,t)=>s+t.side*t.side,0)-1)<1e-9,`count ${count}: tile area != 1`);
  verifyTree(layout.root);

  for(const tile of layout.tiles){
    assert(tile.side>0,"non-positive square side");
    assert(tile.x>=-1e-12&&tile.y>=-1e-12,"negative tile coordinate");
    assert(tile.x+tile.side<=1+1e-12&&tile.y+tile.side<=1+1e-12,"tile exceeds field");
    const hit=L.hit(layout,tile.cx,tile.cy);
    assert(hit?.txid===tile.txid,`center hit mismatch for ${tile.txid}`);
  }

  const metricOrder=layout.tiles.slice().sort((a,b)=>b.vsize-a.vsize);
  for(let i=1;i<metricOrder.length;i++){
    assert(metricOrder[i-1].area+1e-15>=metricOrder[i].area,`count ${count}: metric-to-area ordering regressed`);
  }
}

assert(T.list().length===32,`expected 32 themes, got ${T.list().length}`);
assert(T.set("deadbeef").id==="deadbeef","theme selection failed");

console.log("mempool-tiles layout selftest: PASS");
console.log(`themes: ${T.list().length}`);

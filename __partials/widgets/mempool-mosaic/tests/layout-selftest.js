#!/usr/bin/env node
"use strict";

global.window=global;
require("../js/sorter.js");
require("../js/scaler.js");
require("../js/mosaic-packer.js");
require("../js/layout.js");
require("../js/themes.js");

const P=global.ZZXMempoolMosaicPacker;
const L=global.ZZXMempoolMosaicLayout;
const T=global.ZZXMempoolMosaicThemes;

function assert(condition,message){if(!condition)throw new Error(message);}

function tx(index){
  const txid=index.toString(16).padStart(64,"0").slice(-64);
  return {
    txid,
    rank:index,
    vsize:90+((index*7919)%100000),
    valueSats:500+((index*15485863)%5000000000),
    feeSats:250+((index*9001)%300000),
    feeRate:.2+((index*3571)%12000)/100,
    packageFeeRate:.2+((index*3571)%12000)/100,
    firstSeen:1_700_000_000_000+index*1000,
    rbf:index%3===0,
    type:index%11===0?"op_return":"p2wpkh"
  };
}

function verifyTree(node){
  if(!node)return 0;
  if(!node.children?.length){
    assert(node.side>0,"leaf has non-positive side");
    return node.side*node.side;
  }
  let sum=0;
  for(const child of node.children){
    assert(child.x>=node.x-1e-12,"child escapes parent left");
    assert(child.y>=node.y-1e-12,"child escapes parent top");
    assert(child.x+child.side<=node.x+node.side+1e-12,"child escapes parent right");
    assert(child.y+child.side<=node.y+node.side+1e-12,"child escapes parent bottom");
    assert(Math.abs(child.side-(node.side/node.grid))<1e-12,"child is not square subdivision");
    sum+=verifyTree(child);
  }
  const own=node.side*node.side;
  assert(Math.abs(sum-own)<1e-9,`area conservation failed ${sum} != ${own}`);
  return own;
}

for(let count=1;count<=512;count++){
  const next=P.nextConstructible(count);
  assert(next>=count,`count ${count}: next constructible moved backwards`);
  assert(next-count<24,`count ${count}: constructible search escaped bound`);
  assert(P.isConstructible(next),`count ${count}: next count not constructible`);
  const rep=P.representation(next);
  assert(1+3*rep.a+8*rep.b===next,`count ${count}: bad representation`);
}

for(const count of [1,2,3,4,5,6,7,8,9,10,11,12,14,15,31,64,257,1000,2500,4096]){
  const candidate=Array.from({length:count},(_,i)=>tx(i));
  const layout=L.build({candidate},{scaleMode:"value",sortMode:"mosaic",seed:0xdeadbeef});
  assert(layout.schema==="zzx-mempool-mosaic-v3",`count ${count}: wrong schema`);
  assert(layout.sourceCount===count,`count ${count}: wrong source count`);
  assert(layout.leafCount===layout.tiles.length,`count ${count}: leaf/tile mismatch`);
  assert(layout.leafCount>=count,`count ${count}: lost leaves`);
  assert(layout.fragmentCount===layout.leafCount-count,`count ${count}: fragment accounting mismatch`);
  assert(layout.byTxid.size===count,`count ${count}: primary mapping mismatch`);
  assert(layout.exactCover===true,`count ${count}: not marked exact cover`);
  assert(Math.abs(layout.coverage-1)<1e-9,`count ${count}: coverage != 1`);
  assert(Math.abs(layout.tiles.reduce((s,t)=>s+t.side*t.side,0)-1)<1e-9,`count ${count}: tile area != 1`);
  verifyTree(layout.root);

  for(const tile of layout.tiles){
    assert(tile.side>0,"non-positive tile side");
    assert(Math.abs(tile.area-tile.side*tile.side)<1e-15,"tile area not square side²");
    assert(tile.x>=-1e-12&&tile.y>=-1e-12,"negative tile coordinate");
    assert(tile.x+tile.side<=1+1e-12&&tile.y+tile.side<=1+1e-12,"tile escapes field");
    const hit=L.hit(layout,tile.cx,tile.cy);
    assert(hit?.txid===tile.txid,`center hit mismatch for ${tile.txid}`);
  }

  const primary=[...layout.byTxid.values()].sort((a,b)=>b.valueSats-a.valueSats);
  for(let i=1;i<primary.length;i++){
    assert(primary[i-1].area+1e-15>=primary[i].area,`count ${count}: value-to-area monotonicity regressed`);
  }

  if(layout.plan?.a+layout.plan?.b>=4){
    const ratio=layout.plan.b/Math.max(1,layout.plan.a+layout.plan.b);
    assert(ratio>=.35,`count ${count}: mosaic plan unexpectedly lost 3x3 character (${ratio})`);
  }
}

assert(T.list().length===32,`expected 32 themes, got ${T.list().length}`);
assert(T.set("deadbeef").id==="deadbeef","theme selection failed");
console.log("mempool-mosaic square/layout selftest: PASS");
console.log(`themes: ${T.list().length}`);

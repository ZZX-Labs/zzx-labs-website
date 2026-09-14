"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm");
const root=path.resolve(__dirname,"..");
const assert=(c,m)=>{if(!c)throw new Error(m)};
function context(extra={}){const v={console,Map,Set,Date,Math,Number,String,Array,Object,JSON,Intl,Int32Array,AbortController,setTimeout,clearTimeout,...extra};v.window=v;v.location={href:"https://zzx-labs.io/"};vm.createContext(v);return v}
function load(ctx,f){vm.runInContext(fs.readFileSync(path.join(root,f),"utf8"),ctx,{filename:f})}
(async()=>{
 const ctx=context();
 load(ctx,"js/sources.js");
 const bases=ctx.ZZXMempoolTilesSources.apiBases({ctx:{api:{MEMPOOL:"https://mempool.space/api"}}});
 assert(bases[0]==="https://mempool.space/api","configured mempool base not preferred");
 assert(!bases.includes("/bitcoin/mempool/api"),"dead local mempool route still injected");
 const ws=ctx.ZZXMempoolTilesSources.websocketUrls({ctx:{api:{MEMPOOL:"https://mempool.space/api"}}});
 assert(ws.includes("wss://mempool.space/api/v1/ws"),"public websocket fallback missing");
 const themeCtx=context({fetch:async()=>{throw new Error("offline")}});load(themeCtx,"js/themes.js");assert(themeCtx.ZZXMempoolTilesThemes.get&&themeCtx.ZZXMempoolTilesThemes.load,"theme API missing");
 const backing=new Map(),localStorage={getItem:k=>backing.has(k)?backing.get(k):null,setItem:(k,v)=>backing.set(k,String(v))};
 const rctx=context({localStorage});load(rctx,"js/reader-store.js");const id="ab".repeat(32);await rctx.ZZXMempoolTilesReaderStore.pin(id,{txid:id,vsize:141,feeRate:4.2},64);assert((await rctx.ZZXMempoolTilesReaderStore.list()).length===1,"reader store failed");
 console.log("Mempool Tiles runtime self-test: PASS");
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

(() => {
"use strict";
const $=id=>document.getElementById(id),state={metrics:null,lastHeight:null,timer:null,history:[]};
function notify(t){if("Notification"in window&&Notification.permission==="granted")new Notification("BlockClock",{body:t});}
function check(m){
 const hits=[];
 if(m.fees.fastest>=Math.max(0,+$("aa-fee").value||0))hits.push(`Fast fee ${m.fees.fastest} sat/vB.`);
 if(m.mempool.count>=Math.max(0,+$("aa-count").value||0))hits.push(`Mempool ${m.mempool.count} transactions.`);
 if($("aa-block").value==="yes"&&state.lastHeight!=null&&m.height>state.lastHeight)hits.push(`New block ${m.height}.`);
 hits.forEach(notify);$("aa-output").textContent=JSON.stringify({hits},null,2);
}
function draw(){
 const c=$("ap-canvas"),ctx=c.getContext("2d"),r=c.getBoundingClientRect(),w=Math.max(300,Math.round(r.width)),h=Math.max(220,Math.round(r.height||300)),dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
 c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);if(state.history.length<2)return;
 const v=state.history.map(x=>x.fees.fastest),lo=Math.min(...v),hi=Math.max(...v),rg=Math.max(1,hi-lo),pad=30;ctx.strokeStyle="#c0d674";ctx.lineWidth=2;ctx.beginPath();v.forEach((y,i)=>{const x=pad+(w-pad*2)*i/(v.length-1),py=h-30-(y-lo)/rg*(h-60);i?ctx.lineTo(x,py):ctx.moveTo(x,py);});ctx.stroke();
}
function apply(m){check(m);state.lastHeight=state.metrics?.height??state.lastHeight;state.metrics=m;state.history.push(m);if(state.history.length>120)state.history.shift();$("ap-height").textContent=m.height.toLocaleString();$("ap-fee").textContent=`${m.fees.fastest} sat/vB`;$("ap-mempool").textContent=Number(m.mempool.count).toLocaleString();$("ap-epoch").textContent=m.epoch.epoch;$("ap-status").textContent=`${m.source} · ${new Date(m.updatedAt).toLocaleTimeString()}`;draw();}
function manual(){const m=BlockClockCore.normalized({height:+$("am-height").value||0,mempoolCount:+$("am-count").value||0,mempoolVsize:0,mempoolTotalFee:0,fees:{fastestFee:+$("am-fee").value||0,halfHourFee:+$("am-fee").value||0,hourFee:+$("am-fee").value||0,economyFee:+$("am-fee").value||0},source:"manual",lastBlockTimeMs:Date.now()});apply(m);$("as-output").textContent=JSON.stringify(m,null,2);$("ap-live").textContent="DATA: MANUAL";$("ap-live").className="runtime-badge ok";}
async function live(){const base=$("as-url").value.replace(/\/+$/,""),badge=$("ap-live");badge.textContent="DATA: FETCHING";badge.className="runtime-badge partial";try{const [hR,mR,fR]=await Promise.all([fetch(`${base}/blocks/tip/height`,{cache:"no-store"}),fetch(`${base}/mempool`,{cache:"no-store"}),fetch(`${base}/v1/fees/recommended`,{cache:"no-store"})]);if(!hR.ok||!mR.ok||!fR.ok)throw new Error("Provider HTTP error.");const h=+await hR.text(),mp=await mR.json(),fees=await fR.json(),m=BlockClockCore.normalized({height:h,mempoolCount:mp.count||0,mempoolVsize:mp.vsize||0,mempoolTotalFee:mp.total_fee||0,fees,source:base,lastBlockTimeMs:Date.now()});apply(m);$("as-output").textContent=JSON.stringify(m,null,2);badge.textContent="DATA: LIVE";badge.className="runtime-badge ok";}catch(e){badge.textContent="DATA: ERROR";badge.className="runtime-badge bad";$("as-output").textContent=`ERROR: ${e.message}`;}}
function update(){return $("as-mode").value==="live"?live():manual();}
function auto(){if(state.timer){clearInterval(state.timer);state.timer=null;$("as-auto").textContent="AUTO: OFF";}else{const s=Math.max(2,+$("as-sec").value||15);state.timer=setInterval(update,s*1000);$("as-auto").textContent=`AUTO: ${s}S`;update();}}
$("as-now").addEventListener("click",update);$("as-auto").addEventListener("click",auto);$("aa-test").addEventListener("click",()=>state.metrics&&check(state.metrics));$("aa-permission").addEventListener("click",async()=>{$("aa-output").textContent="Notification"in window?`Notification permission: ${await Notification.requestPermission()}`:"Notification API unavailable.";});
manual();
window.BlockClockAPK=Object.freeze({version:"0.1.0-alpha-web",declaredApkPath:"/projects/software/blockclock-apk/blockclock.apk",apkBundled:false,getMetrics:()=>state.metrics});
window.ZZXHooks?.emit("blockclock-apk:ready",{version:"0.1.0-alpha-web",apkBundled:false});
})();

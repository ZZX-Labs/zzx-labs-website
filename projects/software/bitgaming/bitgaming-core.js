(() => {
"use strict";const te=new TextEncoder(),hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function randomHex(n=32){return hex(crypto.getRandomValues(new Uint8Array(n)));}
async function sha256(s){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(String(s)))));}
async function draw({serverSeed,clientSeed,max}){const k=await crypto.subtle.importKey("raw",te.encode(serverSeed),{name:"HMAC",hash:"SHA-256"},false,["sign"]),digest=hex(new Uint8Array(await crypto.subtle.sign("HMAC",k,te.encode(clientSeed)))),result=parseInt(digest.slice(0,13),16)%Math.max(2,max)+1;return{commitment:await sha256(serverSeed),clientSeed,max,result,digest};}
function odds(win,total,edgePct=0){win=Math.max(1,+win||1);total=Math.max(win,+total||2);const p=win/total,edge=Math.max(0,+edgePct||0)/100;return{probability:p,percent:p*100,fairDecimalOdds:1/p,edgeAdjustedDecimalOdds:(1-edge)/p};}
window.BitGamingCore=Object.freeze({randomHex,sha256,draw,odds});
})();

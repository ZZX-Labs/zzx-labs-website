(() => {
"use strict";
const te=new TextEncoder();
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function randomHex(n=32){return hex(crypto.getRandomValues(new Uint8Array(n)));}
async function sha256(s){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(String(s)))));}
async function hmac(key,msg){const k=await crypto.subtle.importKey("raw",te.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(new Uint8Array(await crypto.subtle.sign("HMAC",k,te.encode(msg))));}
async function round(server,player,game,max=100){const digest=await hmac(server,`${player}|${game}|${max}`),n=parseInt(digest.slice(0,13),16);let result;if(game==="coin")result=n%2?"TAILS":"HEADS";else if(game==="dice")result=n%6+1;else result=n%Math.max(2,max)+1;return{digest,result};}
window.BitCasinoCore=Object.freeze({randomHex,sha256,hmac,round});
})();

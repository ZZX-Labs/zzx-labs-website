(() => {
"use strict";const te=new TextEncoder(),hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function randomHex(n=32){return hex(crypto.getRandomValues(new Uint8Array(n)));}
async function sha256(s){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(String(s)))));}
async function digest(seed,msg){const k=await crypto.subtle.importKey("raw",te.encode(seed),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",k,te.encode(msg)));}
async function deck(seed,client){const suits=["S","H","D","C"],ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],a=[];for(const s of suits)for(const r of ranks)a.push(r+s);let counter=0;for(let i=a.length-1;i>0;i--){const d=await digest(seed,`${client}:${counter++}`),n=(d[0]<<24|d[1]<<16|d[2]<<8|d[3])>>>0,j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function score(hand){let total=0,aces=0;for(const c of hand){const r=c.slice(0,-1);if(r==="A"){total+=11;aces++;}else if(["J","Q","K"].includes(r))total+=10;else total+=+r;}while(total>21&&aces){total-=10;aces--;}return total;}
window.BitJackCore=Object.freeze({randomHex,sha256,deck,score});
})();

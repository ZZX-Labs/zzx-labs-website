(() => {
"use strict";
const te=new TextEncoder();
async function sha256(s){const d=await crypto.subtle.digest("SHA-256",te.encode(String(s)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
const ACTIONS={
"system-info":{label:"Collect system info",purpose:"Read OS/version/uptime/resource summary from an authorized local collector."},
"service-status":{label:"Check service status",purpose:"Read status for a named service from sanitized telemetry."},
"log-review":{label:"Review application logs",purpose:"Request a bounded log-review artifact from the authorized local workflow."},
"file-hash":{label:"Verify file hash",purpose:"Compare a file digest supplied by the authorized endpoint workflow."},
"connectivity":{label:"Connectivity health check",purpose:"Evaluate reachability/status metadata supplied by the authorized workflow."}
};
async function appendAudit(log,event){const prev=log.at(-1)?.hash||"GENESIS",record={index:log.length,at:new Date().toISOString(),prevHash:prev,event},hash=await sha256(JSON.stringify(record));log.push({...record,hash});return log.at(-1);}
async function verify(log){let prev="GENESIS";for(let i=0;i<log.length;i++){const x=log[i],h=await sha256(JSON.stringify({index:x.index,at:x.at,prevHash:x.prevHash,event:x.event}));if(x.index!==i||x.prevHash!==prev||x.hash!==h)return{valid:false,failedIndex:i};prev=x.hash;}return{valid:true,entries:log.length,head:prev};}
window.BlekRATCore=Object.freeze({ACTIONS,sha256,appendAudit,verify});
})();

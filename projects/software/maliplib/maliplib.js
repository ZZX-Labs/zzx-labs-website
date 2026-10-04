(()=>{"use strict";
const $=id=>document.getElementById(id);
let rows=[];
function ipType(ip){
 const v=ip.trim();
 if(/^127\./.test(v)||v==="::1")return"loopback";
 if(/^10\./.test(v)||/^192\.168\./.test(v)||/^172\.(1[6-9]|2\d|3[01])\./.test(v)||/^fc/i.test(v)||/^fd/i.test(v))return"private";
 if(/^169\.254\./.test(v)||/^fe80:/i.test(v))return"link-local";
 if(v.includes(":"))return"IPv6";
 if(/^(\d{1,3}\.){3}\d{1,3}$/.test(v))return"IPv4";
 return"invalid";
}
function score(rec){
 let s=0,reasons=[];
 if(rec.blocklist){s+=45;reasons.push("user-supplied blocklist hit")}
 if(rec.tor){s+=20;reasons.push("user-supplied Tor indicator")}
 if(rec.proxy){s+=15;reasons.push("user-supplied proxy/VPN indicator")}
 if(rec.abuse>0){s+=Math.min(20,rec.abuse);reasons.push("user-supplied abuse score")}
 if(["private","loopback","link-local"].includes(rec.type)){s=0;reasons=["non-public address"]}
 return{score:Math.min(100,s),reasons};
}
function parse(){
 const lines=$("ip-input").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 rows=lines.map((ip,i)=>{
  const type=ipType(ip), rec={ip,type,asn:$("default-asn").value.trim()||null,country:$("default-country").value.trim()||null,blocklist:$("flag-blocklist").checked,tor:$("flag-tor").checked,proxy:$("flag-proxy").checked,abuse:+$("abuse-score").value||0};
  return{...rec,...score(rec)};
 });
 render();
}
function render(){
 const tb=$("ip-results");tb.replaceChildren();
 rows.forEach(r=>{const tr=document.createElement("tr"),cl=r.score>=60?"risk-high":r.score>=25?"risk-mid":"risk-low";tr.innerHTML=`<td>${r.ip}</td><td>${r.type}</td><td>${r.asn||"—"}</td><td>${r.country||"—"}</td><td class="${cl}">${r.score}</td><td>${r.reasons.join("; ")||"none"}</td>`;tb.append(tr)});
 const pub=rows.filter(r=>["IPv4","IPv6"].includes(r.type)).length;
 $("total").textContent=rows.length;$("public").textContent=pub;$("high").textContent=rows.filter(r=>r.score>=60).length;$("invalid").textContent=rows.filter(r=>r.type==="invalid").length;
 $("json-output").textContent=JSON.stringify({schema:"zzx.maliplib.batch.v1",generated:new Date().toISOString(),records:rows},null,2);
}
$("analyze").onclick=parse;
$("sample").onclick=()=>{$("ip-input").value="8.8.8.8\n1.1.1.1\n192.168.1.1\n127.0.0.1\n2001:4860:4860::8888";parse()};
$("export-json").onclick=()=>{const t=JSON.stringify({schema:"zzx.maliplib.batch.v1",records:rows},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="maliplib-results.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("sample").click();
window.MalIPLib=Object.freeze({version:"0.2.0-web",liveEnrichment:false});
})();

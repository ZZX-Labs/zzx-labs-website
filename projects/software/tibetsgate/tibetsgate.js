(()=>{"use strict";
const $=id=>document.getElementById(id);let profile=null;
const controls=[
["disk","Encrypted storage","Protect data at rest using host-supported full-disk/container encryption."],
["firewall","Default-deny firewall","Limit inbound exposure; explicitly allow required services only."],
["vpn","WireGuard transport","Use reviewed peer configurations and protect private key material externally."],
["updates","Update discipline","Track OS/package/security updates and verify release signatures."],
["backups","Encrypted backups","Maintain offline/versioned backups and test restoration."],
["audit","Local audit logs","Keep minimal local logs for configuration and security changes."],
["dns","Resolver privacy","Use a trusted/local resolver policy appropriate to deployment."],
["secrets","Secret separation","Keep secrets out of source, exported reports, and browser storage."]
];
function score(){
 const enabled=controls.filter(([id])=>$(id).checked).length;
 const s=Math.round(enabled/controls.length*100);$("score").textContent=s+"%";$("bar").style.width=s+"%";return s
}
controls.forEach(([id])=>$(id).onchange=score);
$("build").onclick=()=>{
 profile={schema:"zzx.tibetsgate.profile.v1",created:new Date().toISOString(),name:$("name").value.trim(),environment:$("env").value,threatModel:$("threat").value,controls:Object.fromEntries(controls.map(([id,label])=>[id,{enabled:$(id).checked,label}])),score:score(),notes:$("notes").value.trim(),execution:false,secretsIncluded:false};
 $("output").textContent=JSON.stringify(profile,null,2);render()
};
function render(){const e=$("guards");e.replaceChildren();controls.forEach(([id,label,desc])=>{const d=document.createElement("div");d.className="guard";d.innerHTML=`<strong>${$(id).checked?"ON":"OFF"} · ${label}</strong><p>${desc}</p>`;e.append(d)})}
$("nft").onclick=()=>{$("snippet").textContent=`# Review before use — example nftables baseline\nflush ruleset\n\ntable inet filter {\n  chain input {\n    type filter hook input priority 0; policy drop;\n    iifname "lo" accept\n    ct state established,related accept\n    # add only explicitly required inbound services\n  }\n  chain forward { type filter hook forward priority 0; policy drop; }\n  chain output { type filter hook output priority 0; policy accept; }\n}\n`};
$("wg").onclick=()=>{$("snippet").textContent=`# WireGuard profile skeleton — NO PRIVATE KEYS STORED HERE\n[Interface]\nAddress = 10.77.0.2/32\n# PrivateKey = <supply externally at deployment>\n\n[Peer]\nPublicKey = <peer-public-key>\nAllowedIPs = 10.77.0.0/24\nEndpoint = <peer-host>:51820\nPersistentKeepalive = 25\n`};
$("export").onclick=()=>{if(!profile)$("build").click();const t=JSON.stringify(profile,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="tibetsgate-profile.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("build").click();window.TibetsGate=Object.freeze({version:"0.1.0-alpha-web",executesSystemChanges:false});
})();

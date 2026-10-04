(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={route:null,config:"",monitoring:null};
  function route(){state.route={primary:$("bo-primary").value,torSocks:$("bo-tor").value.trim(),i2pEndpoint:$("bo-i2p").value.trim(),vpnProfile:$("bo-vpn").value.trim(),proxyDns:$("bo-dns").value==="1",killSwitch:$("bo-kill").value};$("bo-route-output").textContent=JSON.stringify(state.route,null,2);return state.route;}
  function config(){const r=state.route||route();state.config=BitOnionCore.buildConfig(r,{onion:$("bo-onion").value==="1",listen:$("bo-listen").value==="1",dnsseed:$("bo-dnsseed").value==="1"});$("bo-conf-output").textContent=state.config;return state.config;}
  function health(){const status=JSON.parse($("bo-health-json").value),result=BitOnionCore.evaluate(status,state.route||route());$("bo-health-output").textContent=JSON.stringify(result,null,2);}
  function monitoring(){state.monitoring={interface:$("bo-iface").value.trim(),bitcoinPort:Number($("bo-port").value)||8333,captureFilter:$("bo-filter").value.trim(),checks:["Confirm the selected interface belongs to the intended node path.","Verify Tor/I2P/VPN route state before packet inspection.","Use nmap only against systems you own or are authorized to assess.","Use Wireshark/tshark capture filters to observe expected Bitcoin P2P traffic.","Confirm no unintended clearnet Bitcoin peer traffic is present when strict routing is intended."]};$("bo-monitor-output").textContent=JSON.stringify(state.monitoring,null,2);}
  function exportProfile(){const value={schema:"zzx.bitonion.profile.v1",exportedAt:new Date().toISOString(),route:state.route||route(),bitcoinConfig:state.config||config(),monitoring:state.monitoring};const b=new Blob([JSON.stringify(value,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=`bitonion-profile-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);$("bo-export-output").textContent=JSON.stringify(value,null,2);}
  $("bo-build-route").addEventListener("click",route);
  $("bo-build-conf").addEventListener("click",()=>{try{config();}catch(e){$("bo-conf-output").textContent=`ERROR: ${e.message}`;}});
  $("bo-health-run").addEventListener("click",()=>{try{health();}catch(e){$("bo-health-output").textContent=`ERROR: ${e.message}`;}});
  $("bo-monitor-plan").addEventListener("click",monitoring);
  $("bo-export").addEventListener("click",exportProfile);
  route();config();monitoring();
  window.BitOnion=Object.freeze({version:"0.1.0-alpha-web",buildRoute:route,buildConfig:config,evaluate:BitOnionCore.evaluate,getState:()=>({route:state.route,config:state.config,monitoring:state.monitoring})});
  window.ZZXHooks?.emit("bitonion:ready",{version:"0.1.0-alpha-web"});
})();

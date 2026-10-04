(() => {
  "use strict";
  function validHostPort(s){return /^[^:\s]+:\d{1,5}$/.test(String(s||"").trim());}
  function buildConfig(route,opts) {
    const lines=["# BitOnion generated privacy fragment"];
    if(route.primary==="tor") {
      if(!validHostPort(route.torSocks))throw new Error("Invalid Tor SOCKS host:port.");
      lines.push(`proxy=${route.torSocks}`,"onlynet=onion");
      if(opts.onion)lines.push(`onion=${route.torSocks}`);
    } else if(route.primary==="i2p") {
      if(!validHostPort(route.i2pEndpoint))throw new Error("Invalid I2P endpoint.");
      lines.push("onlynet=i2p",`i2psam=${route.i2pEndpoint}`);
    }
    lines.push(`listen=${opts.listen?1:0}`,`dnsseed=${opts.dnsseed?1:0}`,`listenonion=${opts.onion?1:0}`);
    return lines.join("\n")+"\n";
  }
  function evaluate(status,route) {
    const issues=[];
    if(route.primary==="tor"&&!status?.tor?.running)issues.push("Primary route is Tor but Tor is not reported running.");
    if(route.primary==="i2p"&&!status?.i2p?.running)issues.push("Primary route is I2P but I2P is not reported running.");
    if(route.primary==="vpn"&&!status?.vpn?.running)issues.push("Primary route is VPN but VPN is not reported running.");
    if(route.killSwitch==="strict"&&route.primary==="tor"&&Number(status?.bitcoin?.peers)>0&&Number(status?.bitcoin?.onionPeers)<=0)issues.push("Bitcoin peers are active but no onion peers are reported under strict Tor routing.");
    return {ok:issues.length===0,issues,status};
  }
  window.BitOnionCore=Object.freeze({validHostPort,buildConfig,evaluate});
})();

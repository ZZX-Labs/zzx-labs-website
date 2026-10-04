// __partials/widgets/nodes/js/ui.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesUI?.__version||0)>=5)return;

  function label(network){
    const names={
      ipv4:"IPv4",
      ipv6:"IPv6",
      tor:"Tor",
      i2p:"I2P",
      cjdns:"CJDNS",
      other:"Other"
    };
    return names[network]||String(network||"Other");
  }

  W.ZZXNodesUI=Object.freeze({
    __version:5,
    label
  });
})();

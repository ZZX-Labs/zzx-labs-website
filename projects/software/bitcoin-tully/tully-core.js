(() => {
  "use strict";
  function classify(path){
    const p=String(path).toLowerCase(),name=p.split(/[\\/]/).pop();
    if(name==="wallet.dat")return{kind:"Bitcoin Core wallet.dat",priority:"high"};
    if(/wallets?[\\/]/.test(p)&&(/\.(dat|sqlite|db)$/.test(name)||!/\./.test(name)))return{kind:"wallet directory artifact",priority:"high"};
    if(/bitcoin\.conf$/.test(name))return{kind:"bitcoin.conf",priority:"medium"};
    if(/peers\.dat$/.test(name))return{kind:"peers.dat",priority:"low"};
    if(/\.bak$|backup|wallet[-_ ]?backup/.test(p))return{kind:"backup candidate",priority:"medium"};
    if(/\.json$|\.txt$|\.csv$/.test(name)&&/(descriptor|xpub|address|wallet)/.test(p))return{kind:"wallet metadata candidate",priority:"medium"};
    return{kind:"other",priority:"normal"};
  }
  async function sha256(file){const b=await file.arrayBuffer(),d=await crypto.subtle.digest("SHA-256",b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
  window.TullyCore=Object.freeze({classify,sha256});
})();

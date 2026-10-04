(() => {
  "use strict";
  function multisig(m,n,keys,wrap="wsh"){m=+m;n=+n;if(m<1||n<1||m>n)throw new Error("Need 1 ≤ m ≤ n.");if(keys.length!==n)throw new Error(`Expected ${n} public keys/placeholders.`);const inner=`sortedmulti(${m},${keys.join(",")})`;return wrap==="sh-wsh"?`sh(wsh(${inner}))`:`wsh(${inner})`;}
  function timelock(type,value,key){value=Math.floor(+value);if(!(value>0))throw new Error("Positive timelock required.");if(type==="csv-blocks")return `${value} OP_CHECKSEQUENCEVERIFY OP_DROP ${key} OP_CHECKSIG`;return `${value} OP_CHECKLOCKTIMEVERIFY OP_DROP ${key} OP_CHECKSIG`;}
  function htlc(hash,recv,refund,height){return`OP_IF\n  OP_SHA256 ${hash} OP_EQUALVERIFY\n  ${recv} OP_CHECKSIG\nOP_ELSE\n  ${Math.floor(+height)} OP_CHECKLOCKTIMEVERIFY OP_DROP\n  ${refund} OP_CHECKSIG\nOP_ENDIF`;}
  function tests(s){const out=[];try{multisig(s.multisig.m,s.multisig.n,s.multisig.keys,s.multisig.wrap);out.push({name:"multisig-threshold",ok:true});}catch(e){out.push({name:"multisig-threshold",ok:false,error:e.message});}out.push({name:"timelock-positive",ok:Number(s.timelock.value)>0});if(s.dlc){const rows=s.dlc.payouts||[],totals=rows.map(x=>(+x.partyA_sats||0)+(+x.partyB_sats||0));out.push({name:"dlc-payout-total-consistency",ok:totals.length<2||totals.every(x=>x===totals[0]),totals});}return out;}
  window.BitContractCore=Object.freeze({multisig,timelock,htlc,tests});
})();

(()=>{"use strict";
const FX={};
FX.uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now();
FX.now=()=>new Date().toISOString();
FX.esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
FX.sha256=async s=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")};
FX.download=(t,n,ty="application/json")=>{const b=new Blob([t],{type:ty}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)};
FX.allowedPair=(p,r)=>{p=String(p||"").toUpperCase().replace(/\s/g,"");const a=r==="CA"?"BTC/CAD":"BTC/USD";if(p!==a)throw new Error(`Bitcoin-only build: allowed pair is ${a}.`);return p};
FX.forbiddenSecretFields=["seed","seed_phrase","mnemonic","private_key","privateKey","xprv","wallet_password","walletPassword","macaroon","root_ssh_key","hotwallet_key"];
FX.rejectSecrets=o=>{for(const k of Object.keys(o||{}))if(FX.forbiddenSecretFields.includes(k))throw new Error(`Forbidden secret field: ${k}`);return o};

class OrderBook{
 constructor(region){this.region=region;this.orders=[];this.trades=[];this.seq=0}
 async add(o){
  FX.rejectSecrets(o);FX.allowedPair(o.pair,this.region);
  if(!["buy","sell"].includes(o.side))throw new Error("side must be buy/sell");
  if(!(Number(o.price)>0&&Number(o.qty)>0))throw new Error("price/qty must be positive");
  const x={id:FX.uid(),seq:++this.seq,created:FX.now(),owner:String(o.owner||"client"),side:o.side,price:+o.price,qty:+o.qty,remaining:+o.qty,pair:o.pair,type:o.type||"limit",status:"open",custody:"none"};
  x.intentHash=await FX.sha256(JSON.stringify(x));this.orders.push(x);this.match();return x
 }
 cancel(id,owner){const o=this.orders.find(x=>x.id===id);if(!o)throw new Error("order not found");if(owner&&o.owner!==owner)throw new Error("owner mismatch");if(o.status!=="open")throw new Error("order is not open");o.status="cancelled";return o}
 match(){
  const bids=this.orders.filter(o=>o.side==="buy"&&o.status==="open"&&o.remaining>0).sort((a,b)=>b.price-a.price||a.seq-b.seq);
  const asks=this.orders.filter(o=>o.side==="sell"&&o.status==="open"&&o.remaining>0).sort((a,b)=>a.price-b.price||a.seq-b.seq);
  while(bids.length&&asks.length&&bids[0].price>=asks[0].price){
   const b=bids[0],s=asks[0],q=Math.min(b.remaining,s.remaining),p=s.seq<b.seq?s.price:b.price;
   const t={id:FX.uid(),created:FX.now(),pair:b.pair,price:p,qty:q,buyer:b.owner,seller:s.owner,buyOrder:b.id,sellOrder:s.id,settlement:"noncustodial-pending"};
   this.trades.unshift(t);b.remaining-=q;s.remaining-=q;
   if(b.remaining<=1e-12){b.remaining=0;b.status="filled";bids.shift()}
   if(s.remaining<=1e-12){s.remaining=0;s.status="filled";asks.shift()}
  }
 }
 snapshot(){return{bids:this.orders.filter(o=>o.side==="buy"&&o.status==="open").sort((a,b)=>b.price-a.price),asks:this.orders.filter(o=>o.side==="sell"&&o.status==="open").sort((a,b)=>a.price-b.price),trades:this.trades,orders:this.orders}}
}
class OfferBook{
 constructor(region){this.region=region;this.offers=[]}
 async add(o){
  FX.rejectSecrets(o);FX.allowedPair(o.pair,this.region);
  if(!["buy","sell"].includes(o.side))throw new Error("side must be buy/sell");
  if(!(Number(o.price)>0&&Number(o.qty)>0))throw new Error("price/qty must be positive");
  const x={id:FX.uid(),created:FX.now(),maker:String(o.maker||"peer"),side:o.side,price:+o.price,qty:+o.qty,remaining:+o.qty,pair:o.pair,rail:o.rail||"onchain-psbt",relay:o.relay||"relay-1",expiresMinutes:+o.expiresMinutes||60,status:"open",custody:"none"};
  x.offerHash=await FX.sha256(JSON.stringify(x));this.offers.push(x);return x
 }
 route(side,qty,maxPeers=6){
  qty=+qty;if(!(qty>0))throw new Error("qty must be positive");
  const opp=side==="buy"?"sell":"buy",c=this.offers.filter(o=>o.side===opp&&o.status==="open"&&o.remaining>0).sort((a,b)=>side==="buy"?a.price-b.price:b.price-a.price);
  let rem=qty,n=0;const legs=[];
  for(const o of c){if(rem<=1e-12||legs.length>=maxPeers)break;const q=Math.min(rem,o.remaining);legs.push({offer:o.id,maker:o.maker,price:o.price,qty:q,rail:o.rail,relay:o.relay});n+=q*o.price;rem-=q}
  const f=qty-rem;return{side,requestedQty:qty,fillableQty:f,unfilledQty:Math.max(0,rem),averagePrice:f?n/f:0,legs}
 }
}
class Settlement{
 constructor(trade,r,m){
  this.id=FX.uid();this.created=FX.now();this.trade=trade;this.region=r;this.mode=m;this.asset="BTC";this.quote=r==="CA"?"CAD":"USD";
  this.states=["matched","quote-rail-committed","bitcoin-psbt-prepared","user-signatures-external","policy-validated","broadcast-or-lightning-settlement","confirmed"];this.i=0;
  this.exchangePrivateKeys=false;this.withdrawalWallet=false;this.customerCustody="user-controlled";
 }
 advance(){if(this.i<this.states.length-1)this.i++;return this.states[this.i]}
 current(){return this.states[this.i]}
}
class Quorum{
 constructor(required=3){this.required=required;this.members=["security","operations","compliance","release","incident"];this.approvals=new Set()}
 approve(x){if(!this.members.includes(x))throw new Error("unknown role");this.approvals.add(x);return this.status()}
 reset(){this.approvals.clear();return this.status()}
 status(){return{required:this.required,members:this.members,approvals:[...this.approvals],satisfied:this.approvals.size>=this.required}}
}
Object.assign(FX,{OrderBook,OfferBook,Settlement,Quorum});
window.FreedomXCore=Object.freeze(FX);
})();

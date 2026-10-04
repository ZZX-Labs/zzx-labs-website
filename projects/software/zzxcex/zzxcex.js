(()=>{"use strict";const $=id=>document.getElementById(id);let state={seed:1,mid:68000,bids:[],asks:[],fills:[],cash:100000,btc:0};const c=$("chart"),x=c.getContext("2d");
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function buildBook(){
 const seed=+($("seed").value)||1,r=rng(seed),mid=+($("mid").value)||68000,spread=Math.max(.5,+$("spread").value||20),levels=Math.max(5,Math.min(40,+$("levels").value||12));state.seed=seed;state.mid=mid;state.bids=[];state.asks=[];
 for(let i=0;i<levels;i++){const gap=spread/2+i*(spread*.45+r()*spread*.55),qty=.002+r()*.16;state.bids.push({price:mid-gap,qty});state.asks.push({price:mid+gap,qty:.002+r()*.16})}
 renderBook();draw()
}
function renderBook(){const b=$("bids"),a=$("asks");b.replaceChildren();a.replaceChildren();state.bids.forEach(v=>{const d=document.createElement("div");d.className="book-row bid";d.innerHTML=`<span>${v.price.toFixed(2)}</span><span>${v.qty.toFixed(5)} BTC</span>`;b.append(d)});state.asks.forEach(v=>{const d=document.createElement("div");d.className="book-row ask";d.innerHTML=`<span>${v.price.toFixed(2)}</span><span>${v.qty.toFixed(5)} BTC</span>`;a.append(d)});$("best-bid").textContent=state.bids[0]?.price.toFixed(2)||"—";$("best-ask").textContent=state.asks[0]?.price.toFixed(2)||"—";$("sim-mid").textContent=state.mid.toFixed(2)}
$("generate").onclick=buildBook;
function fill(side,qty,limit){
 const book=side==="buy"?state.asks:state.bids,sign=side==="buy"?1:-1;let remain=qty,cost=0,done=0;
 for(const level of book){if(remain<=0)break;if(limit && (side==="buy"?level.price>limit:level.price<limit))break;const take=Math.min(remain,level.qty);remain-=take;done+=take;cost+=take*level.price}
 if(!done)return null;const avg=cost/done;
 if(side==="buy"){if(cost>state.cash)return null;state.cash-=cost;state.btc+=done}else{if(done>state.btc)return null;state.cash+=cost;state.btc-=done}
 const f={at:new Date().toISOString(),side,requested:qty,filled:done,avgPrice:avg,notional:cost,unfilled:remain,simulated:true};state.fills.push(f);return f
}
$("order").onclick=()=>{const side=$("side").value,type=$("otype").value,qty=Math.max(0,+$("qty").value||0),limit=type==="limit"?Math.max(0,+$("limit").value||0):null;const f=fill(side,qty,limit);$("order-out").textContent=f?JSON.stringify(f,null,2):"NO SIMULATED FILL: price/quantity/balance constraint.";renderPortfolio()};
function renderPortfolio(){$("cash").textContent=state.cash.toFixed(2);$("btc").textContent=state.btc.toFixed(8);$("equity").textContent=(state.cash+state.btc*state.mid).toFixed(2);$("fills").textContent=state.fills.length}
$("reset").onclick=()=>{state.cash=100000;state.btc=0;state.fills=[];renderPortfolio()};
function draw(){x.fillStyle="#050505";x.fillRect(0,0,c.width,c.height);const all=[...state.bids,...state.asks],prices=all.map(v=>v.price),mn=Math.min(...prices),mx=Math.max(...prices);x.strokeStyle="#343434";x.beginPath();x.moveTo(c.width/2,10);x.lineTo(c.width/2,c.height-20);x.stroke();for(const [side,arr] of [["bid",state.bids],["ask",state.asks]]){x.strokeStyle=side==="bid"?"#c0d674":"#e06c75";x.beginPath();let cum=0;arr.forEach((v,i)=>{cum+=v.qty;const px=20+(v.price-mn)/(mx-mn)*(c.width-40),py=c.height-30-Math.min(c.height-50,cum*220);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}}
$("stress").onclick=()=>{const shock=+$("shock").value||0,newMid=state.mid*(1+shock/100),equity=state.cash+state.btc*newMid;$("stress-out").textContent=JSON.stringify({shockPercent:shock,referenceMid:state.mid,stressedMid:newMid,btc:state.btc,cash:state.cash,stressedEquity:equity,pnlVsInitial:equity-100000,simulationOnly:true},null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cex.research.v1",exported:new Date().toISOString(),state:{...state},liveTrading:false,custody:false,credentials:false},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zzxcex-research.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
buildBook();renderPortfolio();window.ZZXCEX=Object.freeze({version:"0.1.0-alpha-web",liveTrading:false,custody:false});
})();

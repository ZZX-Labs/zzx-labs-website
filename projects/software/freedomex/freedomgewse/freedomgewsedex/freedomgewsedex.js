(()=>{"use strict";
const $=id=>document.getElementById(id),FX=FreedomXCore,REGION="CA",MODE="DEX",PAIR="BTC/CAD";
const market=new FX.OfferBook(REGION),quorum=new FX.Quorum(3),events=[],settlements=[];
let peerResearch=new PeerDEXResearchEngine(42),peerOffers=[],lastMC=null,lastRoute=null,lastConcentration=null;
let amm=null,lastAmmSwap=null,lastAmmRoute=null,lastAmmLiquidity=null;
const ev=(type,data={})=>{events.unshift({at:FX.now(),type,...data});renderEvents()};
const money=n=>new Intl.NumberFormat(REGION==="CA"?"en-CA":"en-US",{maximumFractionDigits:2}).format(+n||0);

function renderLive(){
 const tb=$("live-offers");tb.replaceChildren();
 market.offers.filter(o=>o.status==="open").forEach(o=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${FX.esc(o.maker)}</td><td>${o.side}</td><td>${money(o.price)}</td><td>${o.remaining.toFixed(8)}</td><td>${o.rail}</td><td>${o.relay}</td>`;tb.append(tr)});
}
async function seedLive(){
 const base=115000;
 for(let i=0;i<16;i++)await market.add({maker:`peer-${i+1}`,side:i%2?"buy":"sell",price:base+(i%2?-1:1)*(60+i*25),qty:+(.015+i*.006).toFixed(8),pair:PAIR,rail:i%3===0?"lightning":"onchain-psbt",relay:`relay-${1+i%3}`});
 renderLive();ev("peer_liquidity_seeded",{pair:PAIR});
}
$("seed-live-offers").onclick=seedLive;$("meme-toggle").onclick=()=>FreedomXMeme.toggle();
$("submit-offer").onclick=async()=>{try{const o=await market.add({maker:$("maker").value.trim(),side:$("offer-side").value,price:+$("offer-price").value,qty:+$("offer-qty").value,pair:PAIR,rail:$("rail").value,relay:$("relay").value.trim()});$("offer-output").textContent=JSON.stringify(o,null,2);renderLive();ev("peer_offer_relayed",{id:o.id,hash:o.offerHash})}catch(e){$("offer-output").textContent="ERROR: "+e.message}};
$("route-live").onclick=()=>{try{lastRoute=market.route($("route-side").value,+$("route-qty").value,Math.max(1,+$("max-peers").value||4));$("route-live-output").textContent=JSON.stringify(lastRoute,null,2);ev("peer_route_built",{legs:lastRoute.legs.length,filled:lastRoute.fillableQty})}catch(e){$("route-live-output").textContent="ERROR: "+e.message}};

function applyAmm(){
 amm=new DEXResearchEngine(Math.max(.0001,+$("reserve-btc").value||100),Math.max(.01,+$("reserve-quote").value||11500000),Math.max(0,+$("amm-fee").value||30));
 $("pool-output").textContent=JSON.stringify({model:"constant-product research pool",reserveBTC:amm.x,reserveQuote:amm.y,feeBps:amm.feeBps,midPrice:amm.mid(),constantProduct:amm.x*amm.y,productionCustody:false,note:"Research-only liquidity mathematics; not a production fiat-onchain AMM claim."},null,2);
}
$("apply-pool").onclick=applyAmm;
$("quote-swap").onclick=()=>{if(!amm)applyAmm();const a=Math.max(.000001,+$("swap-amount").value||.5);lastAmmSwap=$("swap-side").value==="sell"?amm.quoteBTCIn(a):amm.quoteQuoteIn(a);$("swap-output").textContent=JSON.stringify(lastAmmSwap,null,2);ev("amm_swap_quoted",{side:lastAmmSwap.side})};
$("run-amm-route").onclick=()=>{if(!amm)applyAmm();const a=Math.max(.000001,+$("amm-route-btc").value||1),m=amm.mid();lastAmmRoute=amm.route(a,[{name:"Pool A",btc:amm.x,quote:amm.y,feeBps:amm.feeBps},{name:"Pool B",btc:amm.x*.65,quote:amm.x*.65*m*1.002,feeBps:20},{name:"Pool C",btc:amm.x*1.5,quote:amm.x*1.5*m*.998,feeBps:40}]);const tb=$("amm-route-body");tb.replaceChildren();lastAmmRoute.forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${r.name}</td><td>${r.outputQuote.toFixed(2)}</td><td>${r.avgPrice.toFixed(2)}</td><td>${r.slippagePct.toFixed(4)}%</td>`;tb.append(tr)});ev("amm_route_compared",{pools:lastAmmRoute.length})};
$("quote-liquidity").onclick=()=>{if(!amm)applyAmm();lastAmmLiquidity=amm.liquidityShares(Math.max(0,+$("add-btc").value),Math.max(0,+$("add-quote").value));$("liquidity-output").textContent=JSON.stringify(lastAmmLiquidity,null,2);ev("amm_liquidity_quoted")};

function genPeerResearch(){
 peerResearch=new PeerDEXResearchEngine((+$("seed").value||42)>>>0);
 peerOffers=peerResearch.offers(+$("mid").value||115000,Math.max(4,+$("offer-count").value||20),Math.max(1,+$("spread-bps").value||25),.10);
 const tb=$("research-offers");tb.replaceChildren();peerOffers.forEach(o=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${o.maker}</td><td>${o.side}</td><td>${o.price.toFixed(2)}</td><td>${o.btc.toFixed(8)}</td><td>${o.rail}</td><td>${o.latencyMs} ms</td><td>${(o.reliability*100).toFixed(2)}%</td>`;tb.append(tr)});
}
$("gen-research-offers").onclick=genPeerResearch;
function drawMC(mc){const c=$("chart"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);const vals=[mc.fillRateMean*100,Math.min(100,mc.slippageBpsMean),Math.min(100,mc.slippageBpsP95),Math.min(100,mc.meanPeers*10)],labs=["fill %","mean slip","p95 slip","peers×10"];vals.forEach((v,i)=>{const bw=(w-80)/4,bh=v/100*(h-70);x.fillStyle=i===0?"#c0d674":"#e6a42b";x.fillRect(40+i*bw,h-35-bh,bw*.55,bh);x.fillStyle="#e8e8e8";x.font="12px monospace";x.fillText(labs[i],40+i*bw,h-12)})}
$("run-monte-carlo").onclick=()=>{peerResearch=new PeerDEXResearchEngine((+$("seed").value||42)>>>0);lastMC=peerResearch.monteCarlo({mid:+$("mid").value||115000,iterations:Math.max(100,+$("iterations").value||1000),btc:Math.max(.000001,+$("research-qty").value||.1),spreadBps:Math.max(1,+$("spread-bps").value||25),peerFailure:Math.max(0,Math.min(1,+$("peer-failure").value||0)),maxPeers:Math.max(1,+$("research-max-peers").value||4)});drawMC(lastMC);$("backtest-output").textContent=JSON.stringify(lastMC,null,2)};
$("run-concentration").onclick=()=>{if(!peerOffers.length)genPeerResearch();lastConcentration=peerResearch.concentration(peerOffers);$("risk-output").textContent=JSON.stringify(lastConcentration,null,2)};

$("make-settlement").onclick=()=>{if(!lastRoute?.legs?.length){$("settlement-output").textContent="Build a live peer route first.";return}const trade={id:FX.uid(),price:lastRoute.averagePrice,qty:lastRoute.fillableQty,buyer:$("route-side").value==="buy"?"local-peer":"route-peers",seller:$("route-side").value==="sell"?"local-peer":"route-peers"},p=new FX.Settlement(trade,REGION,MODE);settlements.unshift(p);showSettlement();ev("direct_settlement_plan_created",{id:p.id})};
function showSettlement(){const p=settlements[0];if(!p)return;$("settlement-output").textContent=JSON.stringify({id:p.id,current:p.current(),states:p.states,asset:p.asset,quote:p.quote,customerCustody:p.customerCustody,exchangePrivateKeys:p.exchangePrivateKeys,withdrawalWallet:p.withdrawalWallet},null,2)}
$("advance-settlement").onclick=()=>{const p=settlements[0];if(p){p.advance();showSettlement();ev("settlement_advanced",{id:p.id,state:p.current()})}};
document.querySelectorAll("[data-approver]").forEach(b=>b.onclick=()=>{$("quorum-output").textContent=JSON.stringify(quorum.approve(b.dataset.approver),null,2);ev("operator_approval",{role:b.dataset.approver})});
$("reset-quorum").onclick=()=>{$("quorum-output").textContent=JSON.stringify(quorum.reset(),null,2)};
function renderEvents(){const e=$("event-log");e.replaceChildren();events.slice(0,40).forEach(v=>{const a=document.createElement("article");a.className="z-list-item";a.innerHTML=`<strong>${FX.esc(v.type)}</strong><p>${new Date(v.at).toLocaleString()}</p><pre>${FX.esc(JSON.stringify(v,null,2))}</pre>`;e.append(a)})}
$("export-state").onclick=()=>{const doc={schema:"zzx.freedomx.dex.v3.1",project:"freedomgewsedex",region:REGION,mode:MODE,pair:PAIR,bitcoinOnly:true,noncustodial:true,livePeerMarket:{offers:market.offers},lastPeerRoute:lastRoute,originalAmmResearch:{pool:amm?{reserveBTC:amm.x,reserveQuote:amm.y,feeBps:amm.feeBps}:null,lastSwap:lastAmmSwap,lastRoute:lastAmmRoute,lastLiquidity:lastAmmLiquidity},peerResearch:{offers:peerOffers,lastMonteCarlo:lastMC,lastConcentration},settlements:settlements.map(s=>({id:s.id,current:s.current(),trade:s.trade})),quorum:quorum.status(),events};const t=JSON.stringify(doc,null,2);FX.download(t,"freedomgewsedex-state.json");$("export-output").textContent=t};
applyAmm();genPeerResearch();renderLive();renderEvents();$("quorum-output").textContent=JSON.stringify(quorum.status(),null,2);
window.FreedomXApp=Object.freeze({version:"0.3.1-alpha-web",region:REGION,mode:MODE,bitcoinOnly:true,noncustodial:true,originalAmmResearchPreserved:true});
window.ZZXHooks?.emit("freedomgewsedex:ready",{version:"0.3.1-alpha-web"});
})();

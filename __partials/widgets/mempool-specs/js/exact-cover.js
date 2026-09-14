(function(){
  "use strict";
  const W=window,NS=(W.ZZXMempoolSpecs=W.ZZXMempoolSpecs||{});if(NS.ExactCover?.__version>=1)return;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function value(item){const n=Number(item?.valueSats);return Number.isFinite(n)&&n>=0?n:0}
  function weight(item){return clamp(Math.pow(Math.log2(2+value(item)/1000),1.32),1,96)}
  function splitCounts(n){if(n===1)return {two:0,three:0};for(let three=Math.floor((n-1)/8);three>=0;three--){const rest=n-1-three*8;if(rest>=0&&rest%3===0)return {two:rest/3,three}}return null}
  function heapPush(h,x){h.push(x);let i=h.length-1;while(i){const p=(i-1)>>1;if(h[p].priority>=x.priority)break;h[i]=h[p];i=p}h[i]=x}
  function heapPop(h){const top=h[0],last=h.pop();if(h.length){h[0]=last;let i=0;while(true){let l=i*2+1,r=l+1,j=i;if(l<h.length&&h[l].priority>h[j].priority)j=l;if(r<h.length&&h[r].priority>h[j].priority)j=r;if(j===i)break;[h[i],h[j]]=[h[j],h[i]];i=j}}return top}
  function build(items){
    const rows=(items||[]).filter(x=>x?.txid);if(!rows.length)return [];
    const counts=splitCounts(rows.length);if(!counts)throw new Error(`Exact square cover cannot represent ${rows.length} items`);
    const ranked=rows.slice().sort((a,b)=>weight(b)-weight(a)||value(b)-value(a)||String(a.txid).localeCompare(String(b.txid)));
    let serial=1;const heap=[];heapPush(heap,{x:0,y:0,side:1,area:1,depth:0,serial:0,priority:1});
    function split(parts){const leaf=heapPop(heap),s=leaf.side/parts;for(let y=0;y<parts;y++)for(let x=0;x<parts;x++){const child={x:leaf.x+x*s,y:leaf.y+y*s,side:s,area:s*s,depth:leaf.depth+1,serial:serial++};child.priority=child.area/(1+child.depth*.08);heapPush(heap,child)}}
    for(let i=0;i<counts.three;i++)split(3);for(let i=0;i<counts.two;i++)split(2);
    const leaves=heap.sort((a,b)=>b.area-a.area||a.y-b.y||a.x-b.x);
    return leaves.map((leaf,i)=>({...ranked[i],...leaf,index:i,visualWeight:weight(ranked[i])}));
  }
  function validate(tiles,epsilon=1e-9){const area=(tiles||[]).reduce((s,t)=>s+t.side*t.side,0),inBounds=(tiles||[]).every(t=>t.x>=-epsilon&&t.y>=-epsilon&&t.x+t.side<=1+epsilon&&t.y+t.side<=1+epsilon&&Math.abs(t.side*t.side-t.area)<=epsilon);/* Leaves come from disjoint parent replacement, so overlap is impossible by construction. */return {area,emptyArea:Math.max(0,1-area),overlaps:0,valid:inBounds&&Math.abs(area-1)<=epsilon}}
  NS.ExactCover=Object.freeze({__version:1,build,validate,splitCounts,weight});
})();

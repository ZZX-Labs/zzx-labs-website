(() => {
  "use strict";
  const $=id=>document.getElementById(id),store=new ZZXLocalStore("zzx-backinabit-vault-v1"),state={plan:null};
  function localNow(){const d=new Date(),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,19);}
  function sats(n){return BitcoinTime.formatSats(n);}
  function dl(t,n){const b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function build(){
    const start=Math.max(0,Number($("vault-start").value)||0),annual=Math.max(0,Number($("vault-annual").value)||0),years=Math.max(10,Math.min(20,Math.floor(Number($("vault-years").value)||15))),count=Math.max(2,Math.min(8,Math.floor(Number($("vault-epochs").value)||4))),anchorHeight=Math.max(0,Math.floor(Number($("anchor-height").value)||0)),anchorMs=new Date($("anchor-time").value).getTime();
    if(!Number.isFinite(anchorMs))throw new Error("Invalid anchor date/time.");
    const total=start+annual*years,epochs=[];let allocated=0;
    for(let i=1;i<=count;i++){const maturityYears=years*i/count,d=new Date(anchorMs);d.setUTCFullYear(d.getUTCFullYear()+Math.round(maturityYears));const unlockMs=d.getTime(),height=BitcoinTime.estimateHeightAt(unlockMs,anchorHeight,anchorMs),share=i===count?100-(100/count)*(count-1):100/count,amount=i===count?total-allocated:Math.floor(total/count);allocated+=amount;epochs.push({index:i,sharePct:share,amountSats:amount,maturityYears,unlockMs,estimatedHeight:height,cltv:BitcoinTime.cltvScript(height,"<vault_pubkey>")});}
    state.plan={schema:"zzx.backinabit.vault.v1",createdAt:new Date().toISOString(),start,annual,years,count,anchorHeight,anchorMs,totalSats:total,epochs};render();return state.plan;
  }

  function render(){
    const p=state.plan;if(!p)return;
    $("vault-total").textContent=sats(p.totalSats);$("vault-horizon").textContent=`${p.years} years`;$("vault-count").textContent=p.epochs.length;$("vault-final").textContent=new Date(p.epochs.at(-1).unlockMs).toISOString().slice(0,10);
    const body=$("epoch-body");body.replaceChildren();for(const e of p.epochs){const tr=document.createElement("tr");[e.index,`${e.sharePct.toFixed(2)}%`,sats(e.amountSats),new Date(e.unlockMs).toISOString().slice(0,10),e.estimatedHeight].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}draw();
  }

  function draw(){const p=state.plan,c=$("epoch-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||320));c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);if(!p)return;const pad=45,bw=(w-pad*2)/p.epochs.length*.55,max=Math.max(...p.epochs.map(e=>e.amountSats),1);p.epochs.forEach((e,i)=>{const x=pad+(w-pad*2)*(i+.5)/p.epochs.length,bar=e.amountSats/max*(h*.68);ctx.fillStyle=i%2?"#e6a42b":"#c0d674";ctx.fillRect(x-bw/2,h-34-bar,bw,bar);ctx.fillStyle="#969696";ctx.font='9px "IBM Plex Mono", monospace';ctx.fillText(`${e.maturityYears.toFixed(1)}y`,x-bw/2,h-12);});}

  function multisig(){
    let m=Math.max(1,Math.floor(Number($("multi-m").value)||2)),n=Math.max(2,Math.floor(Number($("multi-n").value)||3));if(m>n)m=n;
    const roles=[$("role-1").value.trim(),$("role-2").value.trim(),$("role-3").value.trim()].filter(Boolean);
    const out={label:$("multi-label").value.trim()||"Deep Savings Vault",threshold:`${m}-of-${n}`,required:m,total:n,roles,descriptorPolicyPlaceholder:`wsh(sortedmulti(${m},<key1>,<key2>${n>2?",<key3>":""}${n>3?",...":""}))`,notes:["Use public-key material only in descriptors.","Keep xprvs/seed phrases offline.","Test recovery before funding.","Document hardware/software compatibility and derivation paths."]};
    $("multi-output").textContent=JSON.stringify(out,null,2);
  }

  function recovery(){
    const days=Math.max(1,Math.floor(Number($("recovery-days").value)||365)),blocks=BitcoinTime.blocksForDays(days),primary=$("recovery-primary").value.trim()||"<primary_pubkey>",recoveryKey=$("recovery-key").value.trim()||"<recovery_pubkey>";
    const out={delayDays:days,relativeBlocks:blocks,primaryBranch:`${primary} OP_CHECKSIG`,delayedRecoveryBranch:BitcoinTime.csvScript(blocks,recoveryKey),policyDescription:`Primary path uses the primary key policy. Recovery path becomes eligible after approximately ${blocks} relative blocks.`};
    $("recovery-output").textContent=JSON.stringify(out,null,2);
  }

  function restore(p){state.plan=p;$("vault-start").value=p.start;$("vault-annual").value=p.annual;$("vault-years").value=p.years;$("vault-epochs").value=p.count;$("anchor-height").value=p.anchorHeight;const d=new Date(p.anchorMs),x=new Date(d.getTime()-d.getTimezoneOffset()*60000);$("anchor-time").value=x.toISOString().slice(0,19);render();}

  $("anchor-time").value=localNow();$("vault-build").addEventListener("click",()=>{try{build();}catch(e){alert(e.message);}});$("vault-save").addEventListener("click",()=>store.save(state.plan||build()));$("multi-build").addEventListener("click",multisig);$("recovery-build").addEventListener("click",recovery);$("export-json").addEventListener("click",()=>{const p=state.plan||build();dl(JSON.stringify(p,null,2),`backinabit-${Date.now()}.json`);});$("import-json").addEventListener("change",async()=>{const f=$("import-json").files?.[0];if(!f)return;const p=JSON.parse(await f.text());if(p.schema!=="zzx.backinabit.vault.v1")throw new Error("Unsupported BackInABit vault.");restore(p);$("import-json").value="";});$("clear-plan").addEventListener("click",()=>{store.clear();$("export-output").textContent="Saved vault plan cleared.";});
  const saved=store.load();if(saved?.schema==="zzx.backinabit.vault.v1")restore(saved);else build();multisig();recovery();
  window.BackInABit=Object.freeze({version:"0.1.0-alpha-web",buildVault:build,getVault:()=>state.plan?JSON.parse(JSON.stringify(state.plan)):null,save:()=>store.save(state.plan||build()),buildMultisigPolicy:multisig,buildRecoveryPolicy:recovery});
  window.ZZXHooks?.emit("backinabit:ready",{version:"0.1.0-alpha-web"});
})();

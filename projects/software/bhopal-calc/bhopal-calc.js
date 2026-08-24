(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={potency:null,servings:null,extraction:null,terpenes:null,batches:[]};

  function mg(v){return `${Number(v).toFixed(2)} mg`;}
  function dl(text,name){const b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function calcPotency() {
    state.potency=BhopalChemistry.potency({
      massG:$("pot-mass").value,thcaPct:$("pot-thca").value,thcPct:$("pot-thc").value,
      cbdaPct:$("pot-cbda").value,cbdPct:$("pot-cbd").value,recoveryPct:$("pot-recovery").value
    });
    $("pot-thc-mg").textContent=mg(state.potency.potentialThcMg);
    $("pot-thc-rec").textContent=mg(state.potency.recoveredThcMg);
    $("pot-cbd-mg").textContent=mg(state.potency.potentialCbdMg);
    $("pot-cbd-rec").textContent=mg(state.potency.recoveredCbdMg);
    $("pot-output").textContent=JSON.stringify(state.potency,null,2);
    $("serve-thc").value=state.potency.recoveredThcMg.toFixed(2);
    $("serve-cbd").value=state.potency.recoveredCbdMg.toFixed(2);
  }

  function calcServings() {
    state.servings=BhopalChemistry.servings($("serve-thc").value,$("serve-cbd").value,$("serve-count").value);
    $("serve-thc-each").textContent=mg(state.servings.thcMgEach);
    $("serve-cbd-each").textContent=mg(state.servings.cbdMgEach);
    $("serve-count-out").textContent=state.servings.count;
  }

  function calcExtraction() {
    state.extraction=BhopalChemistry.extraction({
      massG:$("ext-mass").value,targetPct:$("ext-target").value,efficiencyPct:$("ext-eff").value,
      recoveryPct:$("ext-rec").value,purityPct:$("ext-purity").value
    });
    $("ext-input-mg").textContent=mg(state.extraction.targetInputMg);
    $("ext-target-mg").textContent=mg(state.extraction.recoveredTargetMg);
    $("ext-conc-g").textContent=`${state.extraction.concentrateMassG.toFixed(3)} g`;
    $("ext-overall").textContent=`${state.extraction.overallRecoveryPct.toFixed(2)}%`;
    return state.extraction;
  }

  function addBatch() {
    const r=calcExtraction();
    state.batches.push({
      label:$("ext-label").value.trim()||`Batch ${state.batches.length+1}`,
      massG:Number($("ext-mass").value),targetPct:Number($("ext-target").value),
      recoveredTargetMg:r.recoveredTargetMg,concentrateMassG:r.concentrateMassG,
      overallRecoveryPct:r.overallRecoveryPct
    });
    renderBatches();
  }

  function renderBatches() {
    const body=$("compare-body");body.replaceChildren();
    if(!state.batches.length){body.innerHTML='<tr><td colspan="6" class="muted">No comparison batches yet.</td></tr>';return;}
    for(const b of state.batches) {
      const tr=document.createElement("tr");
      [b.label,b.massG.toFixed(2),`${b.targetPct.toFixed(2)}%`,b.recoveredTargetMg.toFixed(2),b.concentrateMassG.toFixed(3),`${b.overallRecoveryPct.toFixed(2)}%`].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
      body.appendChild(tr);
    }
  }

  function calcTerpenes() {
    state.terpenes=BhopalChemistry.terpeneProfile({
      Myrcene:$("terp-myrcene").value,Limonene:$("terp-limonene").value,
      "β-Caryophyllene":$("terp-caryo").value,Linalool:$("terp-linalool").value,
      Pinene:$("terp-pinene").value,Other:$("terp-other").value
    });
    $("terp-output").textContent=JSON.stringify(state.terpenes,null,2);
    drawTerpenes();
  }

  function drawTerpenes() {
    const c=$("terp-canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,Math.min(2,devicePixelRatio||1)),r=c.getBoundingClientRect(),w=Math.max(320,Math.round(r.width)),h=Math.max(260,Math.round(r.height||320));
    c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
    if(!state.terpenes)return;
    const pad=48,items=state.terpenes.items,max=Math.max(...items.map(x=>x.percent),1),bw=(w-pad*2)/items.length*.58;
    items.forEach((x,i)=>{const px=pad+(w-pad*2)*(i+.5)/items.length,bar=x.percent/max*(h*.65);ctx.fillStyle=i%2?"#e6a42b":"#c0d674";ctx.fillRect(px-bw/2,h-45-bar,bw,bar);ctx.fillStyle="#969696";ctx.font='9px "IBM Plex Mono", monospace';ctx.fillText(x.name.slice(0,10),px-bw/2,h-25);ctx.fillText(`${x.percent.toFixed(1)}%`,px-bw/2,h-10);});
  }

  function snapshot() {
    return {schema:"zzx.bhopal-calc.report.v1",exportedAt:new Date().toISOString(),potency:state.potency,servings:state.servings,extraction:state.extraction,terpenes:state.terpenes,batches:state.batches};
  }

  $("pot-calc").addEventListener("click",calcPotency);
  $("serve-calc").addEventListener("click",calcServings);
  $("ext-calc").addEventListener("click",calcExtraction);
  $("ext-add").addEventListener("click",addBatch);
  $("terp-calc").addEventListener("click",calcTerpenes);
  $("export-json").addEventListener("click",()=>dl(JSON.stringify(snapshot(),null,2),`bhopal-calc-${Date.now()}.json`));
  $("reset-all").addEventListener("click",()=>{state.potency=null;state.servings=null;state.extraction=null;state.terpenes=null;state.batches=[];renderBatches();$("export-output").textContent="Session reset.";});

  calcPotency();calcServings();calcExtraction();calcTerpenes();renderBatches();

  window.BhopalCalc=Object.freeze({version:"0.1.0-web",potency:BhopalChemistry.potency,servings:BhopalChemistry.servings,extraction:BhopalChemistry.extraction,terpeneProfile:BhopalChemistry.terpeneProfile,getState:snapshot});
  window.ZZXHooks?.emit("bhopal-calc:ready",{version:"0.1.0-web"});
})();

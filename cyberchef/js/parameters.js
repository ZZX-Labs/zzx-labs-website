(() => {
    "use strict";
    const M=window.ZZXCyberChefModules;
    const rack=()=>document.getElementById("cz-parameter-rack");
    const state={items:[],observer:null,timer:null,activeRecipeNode:null};
    const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

    function labelFor(group, control, i){
        return (control?.getAttribute?.("arg-name") || group?.querySelector?.("label")?.textContent || `Parameter ${i+1}`).replace(/\s+/g," ").trim();
    }
    function fire(control,type="change"){
        const win=M.Runtime?.window(); if(!control||!win)return;
        control.dispatchEvent(new win.Event("input",{bubbles:true}));
        control.dispatchEvent(new win.Event(type,{bubbles:true}));
    }
    function optionsFor(select){return Array.from(select.options||[]).filter(o=>!o.disabled && !o.hidden).map(o=>({label:(o.textContent||o.value).trim(),value:o.value,node:o}));}
    function menuOptions(group){return Array.from(group?.querySelectorAll?.(".editable-option-menu .dropdown-item, .toggle-dropdown .dropdown-item")||[]).map(a=>({label:(a.textContent||"").trim(),value:a.getAttribute("value")||a.textContent||"",node:a})).filter(x=>x.label);}
    function descriptor(group,i){
        const control=group.querySelector("select.arg, input.arg, textarea.arg"); if(!control||control.disabled||control.type==="hidden")return null;
        const label=labelFor(group,control,i); const menu=menuOptions(group);
        if(control.tagName==="SELECT"){
            const opts=optionsFor(control); return {label,type:"choice",control,values:opts,index:Math.max(0,opts.findIndex(o=>o.node.selected)),value:()=>opts.find(o=>o.node.selected)?.label||control.value,set(idx){idx=((idx%opts.length)+opts.length)%opts.length;control.value=opts[idx].value;fire(control);this.index=idx;}};
        }
        if(control.type==="checkbox") return {label,type:"boolean",control,values:[{label:"Off"},{label:"On"}],index:control.checked?1:0,value:()=>control.checked?"On":"Off",set(idx){control.checked=!!(((idx%2)+2)%2);fire(control);this.index=control.checked?1:0;}};
        if(control.type==="number"){
            let step=Number(control.step);if(!Number.isFinite(step)||step<=0)step=1; let min=Number(control.min),max=Number(control.max);if(!Number.isFinite(min))min=-Infinity;if(!Number.isFinite(max))max=Infinity;
            return {label,type:"number",control,index:0,value:()=>control.value,setDelta(d,mult=1){let v=Number(control.value);if(!Number.isFinite(v))v=0;v+=d*step*mult;v=Math.max(min,Math.min(max,v));control.value=String(v);fire(control);}};
        }
        if(menu.length){
            let idx=Math.max(0,menu.findIndex(o=>String(o.value)===String(control.value)||o.label===String(control.value)));
            return {label,type:"choice",control,values:menu,index:idx,value:()=>String(control.value||menu[this.index]?.label||""),set(i){i=((i%menu.length)+menu.length)%menu.length;const item=menu[i];try{item.node.click();}catch(_){control.value=item.value;fire(control);}this.index=i;}};
        }
        return {label,type:"text",control,index:0,value:()=>String(control.value||"Edit"),focus(){control.focus();try{control.select?.();}catch(_){}}};
    }
    function scanRecipe(){
        const node=M.Operations?.recipeNodeForSelectedFunction?.(); state.activeRecipeNode=node;
        if(!node){state.items=[];render();return;}
        const groups=Array.from(node.querySelectorAll(".ingredients .form-group")); state.items=groups.map(descriptor).filter(Boolean).slice(0,12); render();
    }
    function angle(index,count){return count<=1?-135:-135+(index/(count-1))*270;}
    function render(){
        const host=rack();if(!host)return;host.textContent=""; if(!state.items.length){host.hidden=true;return;} host.hidden=false;
        const title=document.createElement("div");title.className="cz-param-title";title.innerHTML=`<span>Function Parameters</span><small>${state.items.length} live ingredient${state.items.length===1?"":"s"}</small>`;host.appendChild(title);
        const bank=document.createElement("div");bank.className="cz-param-bank";host.appendChild(bank);
        state.items.forEach((item,i)=>{
            const cell=document.createElement("div");cell.className=`cz-param cz-param-${item.type}`;
            const btn=document.createElement("button");btn.type="button";btn.className="cz-param-knob";btn.setAttribute("aria-label",item.label);btn.innerHTML='<span class="cz-param-ticks"></span><span class="cz-param-pointer"></span><span class="cz-param-cap"></span>';
            const lab=document.createElement("span");lab.className="cz-param-label";lab.textContent=item.label;
            const val=document.createElement("strong");val.className="cz-param-value";val.textContent=item.value();
            const update=()=>{val.textContent=item.value();const c=item.values?.length||1,idx=item.index||0;btn.style.setProperty("--cz-param-angle",`${angle(idx,c)}deg`);btn.setAttribute("aria-valuetext",val.textContent);};
            const step=(d,mult=1)=>{if(item.type==="choice"||item.type==="boolean")item.set((item.index||0)+d);else if(item.type==="number")item.setDelta(d,mult);else item.focus?.();update();};
            let pid=null,lastY=0,acc=0,moved=false;
            btn.addEventListener("wheel",e=>{e.preventDefault();step(e.deltaY>0?1:-1,e.shiftKey?10:1);},{passive:false});
            btn.addEventListener("keydown",e=>{if(["ArrowUp","ArrowRight"].includes(e.key)){e.preventDefault();step(1,e.shiftKey?10:1);}else if(["ArrowDown","ArrowLeft"].includes(e.key)){e.preventDefault();step(-1,e.shiftKey?10:1);}else if(["Enter"," "].includes(e.key)){e.preventDefault();item.focus?.();}});
            btn.addEventListener("pointerdown",e=>{pid=e.pointerId;lastY=e.clientY;acc=0;moved=false;btn.setPointerCapture(pid);});
            btn.addEventListener("pointermove",e=>{if(pid!==e.pointerId)return;acc+=lastY-e.clientY;lastY=e.clientY;if(Math.abs(acc)>=8){step(acc>0?1:-1,e.shiftKey?10:1);acc=0;moved=true;}});
            btn.addEventListener("pointerup",e=>{if(pid!==e.pointerId)return;try{btn.releasePointerCapture(pid);}catch(_){}pid=null;if(!moved)item.focus?.();});
            cell.append(lab,btn,val);bank.appendChild(cell);update();
        });
    }
    function observe(){state.observer?.disconnect();const doc=M.Runtime?.document();const rec=doc?.querySelector("#rec-list");if(!rec||!window.MutationObserver)return;state.observer=new MutationObserver(()=>{clearTimeout(state.timer);state.timer=setTimeout(scanRecipe,70);});state.observer.observe(rec,{childList:true,subtree:true,attributes:true,attributeFilter:["value","selected","checked","style","class"]});}
    const Parameters={boot(){window.addEventListener("zzx-cyberchef-function-change",()=>setTimeout(scanRecipe,30));window.addEventListener("zzx-cyberchef-operation-activated",()=>setTimeout(scanRecipe,120));window.addEventListener("zzx-cyberchef-frame-ready",e=>{state.observer?.disconnect();state.items=[];render();if(e.detail?.mode==="modified")setTimeout(()=>{observe();scanRecipe();},220);});},refresh:scanRecipe};
    M.Parameters=Parameters;
})();

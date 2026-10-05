(() => {
    "use strict";
    const M=window.ZZXCyberChefModules;
    const Themes=M.Themes,Layouts=M.Layouts,Operations=M.Operations,Macros=M.Macros;
    const names=["theme","layout","module","function","macro-a","macro-b","macro-c","macro-d"];
    const wrap=(i,n)=>n?((i%n)+n)%n:0;
    const root=name=>document.querySelector(`.cz-rotary[data-rotary="${name}"]`);
    const button=name=>root(name)?.querySelector(".cz-knob")||null;
    const value=name=>root(name)?.querySelector(".cz-rotary-value")||null;
    function visual(name,index,count,label){
        const btn=button(name),card=root(name);if(!btn)return;const safe=Math.max(1,count),norm=wrap(index,safe),angle=safe<=1?-135:-135+(norm/(safe-1))*270;
        btn.style.setProperty("--cz-knob-angle",`${angle}deg`);btn.style.setProperty("--cz-knob-progress",`${safe<=1?0:(norm/(safe-1))*100}%`);
        if(value(name))value(name).textContent=label||"—";if(card){card.dataset.detent=String(norm+1);card.dataset.detents=String(safe);card.style.setProperty("--cz-card-progress",`${safe<=1?0:(norm/(safe-1))*100}%`);}
        btn.setAttribute("aria-valuemin","0");btn.setAttribute("aria-valuemax",String(Math.max(0,safe-1)));btn.setAttribute("aria-valuenow",String(norm));btn.setAttribute("aria-valuetext",label||"Unavailable");
        const meter=card?.querySelector(".cz-rotary-meter");if(meter)meter.textContent=`${String(norm+1).padStart(2,"0")} / ${String(safe).padStart(2,"0")}`;
    }
    function ensureMeters(){document.querySelectorAll(".cz-rotary").forEach(card=>{if(!card.querySelector(".cz-rotary-meter")){const m=document.createElement("span");m.className="cz-rotary-meter";m.textContent="01 / 01";card.appendChild(m);}});}
    function refresh(){const t=Themes.current(),l=Layouts.current();visual("theme",Themes.index,Themes.presets.length,t?.label);visual("layout",Layouts.index,Layouts.presets.length,l?.label);["a","b","c","d"].forEach(bank=>{const s=Macros.selected(bank);visual(`macro-${bank}`,s.index,(Macros.definitions[bank]||[]).length,s.slot.name);});}
    function step(name,delta){if(name==="theme"){const p=Themes.apply(Themes.index+delta);visual(name,Themes.index,Themes.presets.length,p?.label);}else if(name==="layout"){const p=Layouts.apply(Layouts.index+delta);visual(name,Layouts.index,Layouts.presets.length,p?.label);}else if(name==="module")Operations.selectModule(Operations.state.moduleIndex+delta);else if(name==="function")Operations.selectFunction(Operations.state.functionIndex+delta);else if(name.startsWith("macro-")){const bank=name.slice(-1);const s=Macros.step(bank,delta);visual(name,s.index,(Macros.definitions[bank]||[]).length,s.slot.name);}}
    function press(name){if(name==="module")Operations.selectModule(Operations.state.moduleIndex,{expand:true,scroll:true});else if(name==="function")Operations.activateFunction();else if(name.startsWith("macro-"))Macros.run(name.slice(-1));}
    function wire(name){
        const btn=button(name),card=root(name);if(!btn)return;let pid=null,lastY=0,acc=0,moved=false,velocity=0,lastT=0;
        btn.addEventListener("wheel",e=>{e.preventDefault();step(name,(e.deltaY>0?1:-1)*(e.shiftKey?8:1));},{passive:false});
        btn.addEventListener("keydown",e=>{if(["ArrowRight","ArrowUp"].includes(e.key)){e.preventDefault();step(name,e.shiftKey?8:1);}else if(["ArrowLeft","ArrowDown"].includes(e.key)){e.preventDefault();step(name,e.shiftKey?-8:-1);}else if(e.key==="PageUp"){e.preventDefault();step(name,8);}else if(e.key==="PageDown"){e.preventDefault();step(name,-8);}else if(e.key==="Home"){e.preventDefault();if(name==="theme")Themes.apply(0);else if(name==="layout")Layouts.apply(0);refresh();}else if(["Enter"," "].includes(e.key)){e.preventDefault();press(name);}});
        btn.addEventListener("pointerdown",e=>{pid=e.pointerId;lastY=e.clientY;acc=0;moved=false;velocity=0;lastT=performance.now();card?.classList.add("is-grabbing");btn.setPointerCapture(pid);});
        btn.addEventListener("pointermove",e=>{if(pid!==e.pointerId)return;const now=performance.now(),dy=lastY-e.clientY;acc+=dy;velocity=dy/Math.max(1,now-lastT);lastY=e.clientY;lastT=now;const threshold=e.shiftKey?5:10;if(Math.abs(acc)>=threshold){const steps=Math.max(1,Math.min(8,Math.floor(Math.abs(acc)/threshold)));step(name,(acc>0?1:-1)*steps);acc=0;moved=true;}});
        btn.addEventListener("pointerup",e=>{if(pid!==e.pointerId)return;try{btn.releasePointerCapture(pid);}catch(_){}pid=null;card?.classList.remove("is-grabbing");if(!moved)press(name);else if(Math.abs(velocity)>.55)step(name,velocity>0?2:-2);});
        btn.addEventListener("pointercancel",()=>{pid=null;card?.classList.remove("is-grabbing");});
    }
    M.Rotary={boot(){ensureMeters();names.forEach(wire);refresh();visual("module",0,1,"Loading…");visual("function",0,1,"Loading…");window.addEventListener("zzx-cyberchef-module-change",e=>{const d=e.detail||{};visual("module",d.index||0,d.count||1,d.label||"—");});window.addEventListener("zzx-cyberchef-function-change",e=>{const d=e.detail||{};visual("function",d.index||0,d.count||1,d.label||"—");});window.addEventListener("zzx-cyberchef-macro-change",e=>{const d=e.detail||{};visual(`macro-${d.bank}`,d.index||0,d.count||1,d.label||"—");});window.addEventListener("zzx-cyberchef-frame-ready",e=>{const modified=e.detail?.mode==="modified",deck=document.getElementById("cz-control-deck");if(deck)deck.hidden=!modified;Operations.reset();if(modified){Themes.restore();Layouts.restore();Themes.applyCurrent(false);Layouts.applyCurrent(false);refresh();Operations.wait();}});}};
})();

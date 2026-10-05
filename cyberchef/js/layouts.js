(() => {
    "use strict";
    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;
    let reapplyTimer = null;
    let observer = null;
    let lastAppliedAt = 0;
    let nativeSnapshot = null;

    const norm = (i,n) => n ? ((i % n) + n) % n : 0;
    const pct = n => `${Math.max(0, Math.min(100, Number(n) || 0))}%`;
    function setVar(style,name,value){ if(value===null||value===undefined)style.removeProperty(name);else style.setProperty(name,value); }

    function setPane(el, value) {
        if (!el || value == null) return;
        const v = pct(value);
        el.style.setProperty("width", v, "important");
        el.style.setProperty("flex-basis", v, "important");
        el.style.setProperty("max-width", "none", "important");
    }
    function setVertical(el, value) {
        if (!el || value == null) return;
        const v = pct(value);
        el.style.setProperty("height", v, "important");
        el.style.setProperty("flex-basis", v, "important");
        el.style.setProperty("max-height", "none", "important");
    }
    function snap(el, props){ if(!el)return null; const out={}; props.forEach(k=>out[k]=el.style.getPropertyValue(k)); return out; }
    function restore(el, values){ if(!el||!values)return; Object.entries(values).forEach(([k,v])=>{if(v)el.style.setProperty(k,v);else el.style.removeProperty(k);}); }
    function captureNative(ops,recipe,io,input,output){
        if(nativeSnapshot)return;
        nativeSnapshot={
            ops:snap(ops,["width","flex-basis","max-width"]), recipe:snap(recipe,["width","flex-basis","max-width"]), io:snap(io,["width","flex-basis","max-width"]),
            input:snap(input,["height","flex-basis","max-height"]), output:snap(output,["height","flex-basis","max-height"])
        };
    }

    const Layouts = {
        presets: config.layoutPresets,
        index: 0,
        restore(){const id=Storage.read(key,this.presets[0]?.id||"native-standard");const i=this.presets.findIndex(p=>p.id===id);this.index=i>=0?i:0;return this.current();},
        current(){return this.presets[this.index]||this.presets[0]||null;},
        applyLiveGeometry(preset){
            const doc=M.Runtime?.document(); if(!doc||M.Runtime?.mode()!=="modified"||!preset)return;
            const html=doc.documentElement, body=doc.body, s=html.style;
            html.dataset.zzxLayout=preset.id;
            html.dataset.zzxLayoutMode=preset.native?"native":"custom";
            html.dataset.zzxLayoutBase=preset.baseId;
            html.dataset.zzxLayoutDensity=preset.densityId;
            const g=preset.geometry;
            const ops=doc.querySelector("#operations"), recipe=doc.querySelector("#recipe"), io=doc.querySelector("#IO");
            const input=doc.querySelector("#input"), output=doc.querySelector("#output");
            captureNative(ops,recipe,io,input,output);
            if(preset.native||!g){
                restore(ops,nativeSnapshot?.ops); restore(recipe,nativeSnapshot?.recipe); restore(io,nativeSnapshot?.io); restore(input,nativeSnapshot?.input); restore(output,nativeSnapshot?.output);
                ["--zzx-operations-width","--zzx-recipe-width","--zzx-io-width","--zzx-input-height","--zzx-output-height"].forEach(n=>s.removeProperty(n));
            } else {
                setPane(ops,g[0]); setPane(recipe,g[1]); setPane(io,g[2]); setVertical(input,g[3]); setVertical(output,g[4]);
                setVar(s,"--zzx-operations-width",pct(g[0])); setVar(s,"--zzx-recipe-width",pct(g[1])); setVar(s,"--zzx-io-width",pct(g[2]));
                setVar(s,"--zzx-input-height",pct(g[3])); setVar(s,"--zzx-output-height",pct(g[4]));
            }
            setVar(s,"--zzx-ui-scale",String(preset.scale));
            setVar(s,"--zzx-op-pad-y",`${preset.operationPadding}px`);
            setVar(s,"--zzx-banner-height",`${preset.bannerHeight}px`);
            if(body) body.dataset.zzxLayout=preset.id;
            lastAppliedAt=Date.now();
            try { M.Runtime?.window()?.dispatchEvent(new Event("resize")); } catch(_) {}
        },
        apply(index=this.index,persist=true){
            if(!this.presets.length)return null;
            this.index=norm(index,this.presets.length); const preset=this.current();
            this.applyLiveGeometry(preset);
            clearTimeout(reapplyTimer); reapplyTimer=setTimeout(()=>this.applyLiveGeometry(preset),80);
            if(persist)Storage.write(key,preset.id);
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-layout-change",{detail:{index:this.index,count:this.presets.length,preset}}));
            return preset;
        },
        applyCurrent(persist=false){return this.apply(this.index,persist);},
        observe(){
            observer?.disconnect(); const doc=M.Runtime?.document(); const workspace=doc?.querySelector("#workspace-wrapper"); if(!workspace||!window.MutationObserver)return;
            observer=new MutationObserver(()=>{if(Date.now()-lastAppliedAt<100)return;clearTimeout(reapplyTimer);reapplyTimer=setTimeout(()=>this.applyLiveGeometry(this.current()),30);});
            observer.observe(workspace,{attributes:true,subtree:true,attributeFilter:["style"]});
        },
        resetObserver(){observer?.disconnect();observer=null;nativeSnapshot=null;}
    };
    Layouts.restore(); M.Layouts=Layouts;
    window.addEventListener("zzx-cyberchef-frame-ready",e=>{Layouts.resetObserver();if(e.detail?.mode==="modified"){setTimeout(()=>{Layouts.applyCurrent(false);Layouts.observe();},120);}});
})();

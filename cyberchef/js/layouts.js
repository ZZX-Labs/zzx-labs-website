(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;
    const cache = new Map();
    let nativeSnapshot = null;
    let observer = null;
    let reapplyTimer = null;
    let applying = false;

    const wrap = (i, n) => n ? ((Number(i) % n) + n) % n : 0;
    const isMobile = () => Boolean(window.matchMedia?.("(max-width: 760px)")?.matches);
    const nodesFor = doc => ({
        workspace: doc?.querySelector("#workspace-wrapper"),
        content: doc?.querySelector("#content-wrapper"),
        operations: doc?.querySelector("#operations"),
        recipe: doc?.querySelector("#recipe"),
        io: doc?.querySelector("#IO"),
        input: doc?.querySelector("#input"),
        output: doc?.querySelector("#output"),
        banner: doc?.querySelector("#banner")
    });

    function snapshotNode(node) {
        if (!node) return null;
        return { style: node.getAttribute("style"), className: node.className };
    }

    function captureNative(doc) {
        if (nativeSnapshot || !doc) return;
        const nodes = nodesFor(doc);
        nativeSnapshot = {
            nodes: Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, snapshotNode(node)])),
            gutters: Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).map(node => ({ node, style: node.getAttribute("style"), className: node.className }))
        };
    }

    function restoreNode(node, snap) {
        if (!node || !snap) return;
        if (snap.style === null) node.removeAttribute("style"); else node.setAttribute("style", snap.style);
        node.className = snap.className;
    }

    function restoreNative(doc) {
        if (!doc || !nativeSnapshot) return;
        const nodes = nodesFor(doc);
        Object.entries(nodes).forEach(([name, node]) => restoreNode(node, nativeSnapshot.nodes[name]));
        nativeSnapshot.gutters.forEach(item => {
            if (!item.node?.isConnected) return;
            if (item.style === null) item.node.removeAttribute("style"); else item.node.setAttribute("style", item.style);
            item.node.className = item.className;
        });
        const root = doc.documentElement;
        root.classList.remove("zzx-layout-custom", "zzx-layout-mobile", "zzx-sticky-titles", "zzx-compact-banner");
        doc.body?.classList.remove("zzx-layout-custom");
        ["zzxLayout", "zzxLayoutOrientation"].forEach(name => { delete root.dataset[name]; });
        ["--zzx-ui-scale","--zzx-op-pad-y","--zzx-banner-height","--zzx-mobile-zoom","--zzx-workspace-gap","--zzx-workspace-padding"].forEach(name => root.style.removeProperty(name));
        try { M.Runtime?.window()?.dispatchEvent(new Event("resize")); } catch (_) {}
    }

    function important(style, name, value) {
        if (!style) return;
        if (value === null || value === undefined || value === "") style.removeProperty(name);
        else style.setProperty(name, String(value), "important");
    }
    const areaTemplate = areas => (areas || []).map(row => `"${row}"`).join(" ");

    function resolvedGeometry(preset) {
        if (!preset || preset.native || !isMobile() || !preset.mobile) return { ...preset, mobileActive: false };
        return {
            ...preset,
            workspace: {
                ...(preset.workspace || {}),
                areas: (preset.mobile.areas || ["io","recipe","ops"]).map(String),
                columns: preset.mobile.columns || ["minmax(0,1fr)"],
                rows: preset.mobile.rows || ["auto","auto","minmax(500px,1fr)"],
                gap: Math.min(8, Number(preset.workspace?.gap ?? 6))
            },
            io: {
                ...(preset.io || {}),
                orientation: preset.mobile.ioOrientation || "vertical",
                split: preset.mobile.ioSplit || [50,50]
            },
            mobileActive: true
        };
    }

    function applyCustom(doc, preset) {
        const resolved = resolvedGeometry(preset);
        const nodes = nodesFor(doc);
        const { workspace, content, operations, recipe, io, input, output, banner } = nodes;
        if (!workspace || !content || !operations || !recipe || !io || !input || !output) return false;
        captureNative(doc);

        const w = resolved.workspace || {};
        const ioc = resolved.io || {};
        const density = resolved.density || {};
        const behavior = resolved.behavior || {};
        const areas = w.areas || ["ops recipe io"];
        const columns = Array.isArray(w.columns) ? w.columns.join(" ") : (w.columns || "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)");
        const rows = Array.isArray(w.rows) ? w.rows.join(" ") : (w.rows || "minmax(0,1fr)");
        const gap = `${Number(w.gap ?? 8)}px`;
        const padding = `${Number(w.padding ?? .35)}rem`;

        // CyberChef's real Split.js pane parent is #content-wrapper.  Applying
        // layout geometry to #workspace-wrapper cannot actually rearrange the
        // three panes because they are nested one level deeper.
        important(workspace.style, "width", "100%");
        important(workspace.style, "max-width", "100%");
        important(workspace.style, "min-width", "0");
        important(workspace.style, "overflow", "hidden");

        important(content.style, "display", "grid");
        important(content.style, "grid-template-areas", areaTemplate(areas));
        important(content.style, "grid-template-columns", columns);
        important(content.style, "grid-template-rows", rows);
        important(content.style, "gap", gap);
        important(content.style, "padding", padding);
        important(content.style, "box-sizing", "border-box");
        important(content.style, "width", "100%");
        important(content.style, "max-width", "100%");
        important(content.style, "min-width", "0");
        important(content.style, "min-height", `${Number(w.minHeight || 620)}px`);
        important(content.style, "height", "auto");
        important(content.style, "overflow", "hidden");

        [[operations,"ops"],[recipe,"recipe"],[io,"io"]].forEach(([node, area]) => {
            important(node.style, "grid-area", area);
            important(node.style, "width", "100%");
            important(node.style, "height", "100%");
            important(node.style, "min-width", "0");
            important(node.style, "min-height", "0");
            important(node.style, "max-width", "none");
            important(node.style, "max-height", "none");
            important(node.style, "flex-basis", "auto");
            important(node.style, "overflow", node === operations && behavior.scrollOperations !== false ? "auto" : "hidden");
        });

        const horizontal = ioc.orientation === "horizontal";
        const split = Array.isArray(ioc.split) && ioc.split.length === 2 ? ioc.split : [50,50];
        important(io.style, "display", "grid");
        important(io.style, "gap", `${Number(ioc.gap ?? 6)}px`);
        important(io.style, "grid-template-areas", horizontal ? '"input output"' : '"input" "output"');
        important(io.style, "grid-template-columns", horizontal ? `${split[0]}fr ${split[1]}fr` : "minmax(0,1fr)");
        important(io.style, "grid-template-rows", horizontal ? "minmax(0,1fr)" : `${split[0]}fr ${split[1]}fr`);

        [[input,"input"],[output,"output"]].forEach(([node, area]) => {
            important(node.style, "grid-area", area);
            important(node.style, "width", "100%");
            important(node.style, "height", "100%");
            important(node.style, "min-width", "0");
            important(node.style, "min-height", "0");
            important(node.style, "max-width", "none");
            important(node.style, "max-height", "none");
            important(node.style, "flex-basis", "auto");
        });

        Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).forEach(gutter => {
            important(gutter.style, "display", behavior.hideGutters === false ? null : "none");
        });

        const root = doc.documentElement;
        root.classList.add("zzx-layout-custom");
        root.classList.toggle("zzx-layout-mobile", Boolean(resolved.mobileActive));
        root.classList.toggle("zzx-sticky-titles", Boolean(behavior.stickyTitles));
        root.classList.toggle("zzx-compact-banner", Boolean(behavior.compactBanner));
        root.dataset.zzxLayout = preset.id;
        root.dataset.zzxLayoutOrientation = ioc.orientation || "vertical";
        doc.body?.classList.add("zzx-layout-custom");
        root.style.setProperty("--zzx-ui-scale", String(density.scale ?? 1));
        root.style.setProperty("--zzx-op-pad-y", `${Number(density.operationPadding ?? 5)}px`);
        root.style.setProperty("--zzx-banner-height", `${Number(density.bannerHeight ?? 42)}px`);
        root.style.setProperty("--zzx-mobile-zoom", String(preset.mobile?.zoom ?? .68));
        root.style.setProperty("--zzx-workspace-gap", gap);
        root.style.setProperty("--zzx-workspace-padding", padding);
        if (banner && behavior.compactBanner) important(banner.style, "min-height", `${Math.max(28, Number(density.bannerHeight ?? 36))}px`);
        try { M.Runtime?.window()?.dispatchEvent(new Event("resize")); } catch (_) {}
        return true;
    }

    async function fetchJSON(url) {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Layout index request failed: HTTP ${response.status}`);
        return response.json();
    }

    const Layouts = {
        presets: [],
        index: 0,
        ready: false,
        current(){ return this.presets[this.index] || null; },
        restore(){ const id=Storage.read(key,config.defaultLayoutId||"native"); const found=this.presets.findIndex(item=>item.id===id); this.index=found>=0?found:0; return this.current(); },
        async loadCatalog(){
            if(this.ready && this.presets.length===128) return this.presets;
            const index=await fetchJSON(config.layoutIndexUrl);
            if(!Array.isArray(index.layouts)||index.layouts.length!==128) throw new Error("CyberChefZZX layout index must contain exactly 128 layouts.");
            this.presets=index.layouts.map((entry,i)=>({...entry,index:i})); this.ready=true; this.restore();
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-layouts-ready",{detail:{count:this.presets.length}}));
            return this.presets;
        },
        async resolve(meta){ if(!meta)return null; if(cache.has(meta.id))return cache.get(meta.id); const preset=await fetchJSON(new URL(`./layouts/${meta.file}`,window.location.href).href); cache.set(meta.id,preset); return preset; },
        apply(index=this.index,persist=true){ if(!this.presets.length)return null; this.index=wrap(index,this.presets.length); const meta=this.current(); if(persist)Storage.write(key,meta.id); void this.applyResolved(meta); return meta; },
        async applyResolved(meta){
            try{
                const preset=await this.resolve(meta); const doc=M.Runtime?.document();
                if(doc&&M.Runtime?.mode()==="modified"){
                    applying=true; if(preset.native)restoreNative(doc); else applyCustom(doc,preset); setTimeout(()=>{applying=false;},30);
                }
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-layout-change",{detail:{index:this.index,count:this.presets.length,preset:meta,resolved:preset}})); return preset;
            }catch(err){applying=false;console.error("[CyberChefZZX layouts]",err);M.Status?.set(err.message||"Layout failed to load.","error");return null;}
        },
        applyCurrent(persist=false){ const meta=this.current(); if(!meta)return null; if(persist)Storage.write(key,meta.id); void this.applyResolved(meta); return meta; },
        observe(){
            observer?.disconnect(); const doc=M.Runtime?.document(); const content=doc?.querySelector("#content-wrapper"); if(!content||!window.MutationObserver)return;
            observer=new MutationObserver(()=>{if(applying)return;clearTimeout(reapplyTimer);reapplyTimer=setTimeout(()=>this.applyCurrent(false),110);});
            observer.observe(content,{subtree:true,attributes:true,attributeFilter:["style","class"]});
        },
        reset(){observer?.disconnect();observer=null;nativeSnapshot=null;clearTimeout(reapplyTimer);}
    };

    M.Layouts=Layouts;
    window.addEventListener("zzx-cyberchef-frame-ready",event=>{Layouts.reset();if(event.detail?.mode!=="modified")return;setTimeout(()=>{Layouts.applyCurrent(false);Layouts.observe();},170);});
    window.addEventListener("resize",()=>{if(!Layouts.ready||M.Runtime?.mode()!=="modified")return;clearTimeout(reapplyTimer);reapplyTimer=setTimeout(()=>Layouts.applyCurrent(false),160);},{passive:true});
})();

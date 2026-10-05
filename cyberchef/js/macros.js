(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const banks = config.macroBanks;

    function normalizeSlot(slot, bank, index) {
        if (Array.isArray(slot)) {
            return { name: slot[0] || `Macro ${bank.toUpperCase()}${index + 1}`, kind: "macro", operations: Array.isArray(slot[1]) ? [...slot[1]] : [], recipeConfig: [] };
        }
        const value = slot && typeof slot === "object" ? slot : {};
        return {
            name: value.name || `Macro ${bank.toUpperCase()}${index + 1}`,
            kind: value.kind === "recipe" ? "recipe" : "macro",
            operations: Array.isArray(value.operations) ? [...value.operations] : [],
            recipeConfig: Array.isArray(value.recipeConfig) ? structuredClone(value.recipeConfig) : []
        };
    }

    function cloneDefaults() {
        const out = {};
        banks.forEach(bank => {
            out[bank] = (config.macroDefaults[bank] || []).map((entry, index) => normalizeSlot(entry, bank, index));
            while (out[bank].length < config.macroSlotsPerBank) {
                out[bank].push({ name: `User Slot ${bank.toUpperCase()}${out[bank].length + 1}`, kind: "macro", operations: [], recipeConfig: [] });
            }
        });
        return out;
    }

    function parseJSON(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
    const defaults = cloneDefaults();
    let definitions = parseJSON(Storage.read(config.storageKeys.macros, ""), null) || defaults;
    let indices = parseJSON(Storage.read(config.storageKeys.macroIndices, ""), null) || { a:0,b:0,c:0,d:0 };

    banks.forEach(bank => {
        const raw = Array.isArray(definitions[bank]) ? definitions[bank] : defaults[bank];
        definitions[bank] = raw.map((slot, i) => normalizeSlot(slot, bank, i));
        while (definitions[bank].length < config.macroSlotsPerBank) definitions[bank].push(normalizeSlot({}, bank, definitions[bank].length));
        definitions[bank] = definitions[bank].slice(0, config.macroSlotsPerBank);
        indices[bank] = Number.isFinite(+indices[bank]) ? +indices[bank] : 0;
    });

    function wrap(i,n){return n?((i%n)+n)%n:0;}
    function save(){Storage.write(config.storageKeys.macros,JSON.stringify(definitions));Storage.write(config.storageKeys.macroIndices,JSON.stringify(indices));}
    function selected(bank){const slots=definitions[bank]||[];const index=wrap(indices[bank]||0,slots.length);indices[bank]=index;return{bank,index,slot:slots[index]||normalizeSlot({},bank,index)};}
    function announce(bank){const s=selected(bank);window.dispatchEvent(new CustomEvent("zzx-cyberchef-macro-change",{detail:{bank,index:s.index,count:(definitions[bank]||[]).length,label:s.slot.name,slot:s.slot}}));return s;}

    function currentRecipeConfig() {
        try {
            const app = M.Runtime?.window()?.app;
            const cfg = app?.getRecipeConfig?.();
            return Array.isArray(cfg) ? structuredClone(cfg) : [];
        } catch (_) { return []; }
    }

    async function run(bank) {
        const s=selected(bank), slot=s.slot;
        if (slot.kind === "recipe") {
            if (!Array.isArray(slot.recipeConfig) || !slot.recipeConfig.length) {
                M.Status?.set(`Recipe preset ${slot.name} is empty. Capture the current CyberChef recipe first.`,"error");
                return false;
            }
            try {
                const app=M.Runtime?.window()?.app;
                if (!app?.setRecipeConfig) throw new Error("CyberChef recipe API is unavailable.");
                app.setRecipeConfig(structuredClone(slot.recipeConfig));
                app.bake?.();
                M.Status?.set(`Recipe loaded: ${slot.name}.`,"ready");
                return true;
            } catch(err) {
                M.Status?.set(`Recipe ${slot.name} failed: ${err.message || err}`,"error");
                return false;
            }
        }

        const missing=[];
        if(!slot.operations.length){M.Status?.set(`Macro ${bank.toUpperCase()}${s.index+1} is empty. Add operation names in the Macro Editor.`,"error");return false;}
        for(const name of slot.operations){if(!M.Operations?.activateByName(name))missing.push(name);await new Promise(resolve=>setTimeout(resolve,55));}
        if(missing.length)M.Status?.set(`Macro ${slot.name}: could not resolve ${missing.join(", ")}.`,"error");
        else M.Status?.set(`Macro executed: ${slot.name}.`,"ready");
        return missing.length===0;
    }

    function editorCard(bank) {
        const s=selected(bank),article=document.createElement("article");article.className="cz-macro-card";article.dataset.macroBank=bank;
        const heading=document.createElement("div");heading.className="cz-macro-card-head";
        const title=document.createElement("h3");title.textContent=`Macro ${bank.toUpperCase()}`;
        const meta=document.createElement("span");meta.textContent=`Slot ${s.index+1} / ${config.macroSlotsPerBank}`;heading.append(title,meta);

        const mode=document.createElement("select");mode.className="cz-macro-kind";mode.setAttribute("aria-label",`Macro ${bank.toUpperCase()} type`);
        [["macro","Macro / operation sequence"],["recipe","Recipe preset / full args"]].forEach(([value,label])=>{const o=document.createElement("option");o.value=value;o.textContent=label;mode.appendChild(o);});
        mode.value=s.slot.kind;

        const name=document.createElement("input");name.type="text";name.className="cz-macro-name";name.value=s.slot.name;name.setAttribute("aria-label",`Macro ${bank.toUpperCase()} name`);
        const ops=document.createElement("textarea");ops.className="cz-macro-operations";ops.rows=6;ops.setAttribute("aria-label",`Macro ${bank.toUpperCase()} payload`);
        const renderPayload=()=>{
            if(mode.value==="recipe"){
                ops.placeholder='[{"op":"From Base64","args":["A-Za-z0-9+/=",true,false]}]';
                ops.value=s.slot.recipeConfig?.length?JSON.stringify(s.slot.recipeConfig,null,2):"";
            } else {
                ops.placeholder="From Base64\nGunzip\nStrings";
                ops.value=(s.slot.operations||[]).join("\n");
            }
        };
        renderPayload();
        mode.addEventListener("change",renderPayload);

        const actions=document.createElement("div");actions.className="cz-macro-actions";
        const saveBtn=document.createElement("button");saveBtn.type="button";saveBtn.textContent="Save Slot";
        const runBtn=document.createElement("button");runBtn.type="button";runBtn.textContent="Run Slot";
        const captureBtn=document.createElement("button");captureBtn.type="button";captureBtn.textContent="Capture Current Recipe";

        saveBtn.addEventListener("click",()=>{
            const cur=selected(bank);cur.slot.name=name.value.trim()||`Macro ${bank.toUpperCase()}${cur.index+1}`;cur.slot.kind=mode.value==="recipe"?"recipe":"macro";
            if(cur.slot.kind==="recipe"){
                try{const parsed=ops.value.trim()?JSON.parse(ops.value):[];if(!Array.isArray(parsed))throw new Error("Recipe must be a JSON array.");cur.slot.recipeConfig=parsed;}catch(err){M.Status?.set(`Recipe JSON invalid: ${err.message}`,"error");return;}
            }else{cur.slot.operations=ops.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean);}
            save();announce(bank);renderEditor();
        });
        runBtn.addEventListener("click",()=>{void run(bank);});
        captureBtn.addEventListener("click",()=>{
            const cfg=currentRecipeConfig();
            if(!cfg.length){M.Status?.set("Current CyberChef recipe is empty.","error");return;}
            const cur=selected(bank);cur.slot.kind="recipe";cur.slot.recipeConfig=cfg;cur.slot.operations=cfg.map(item=>item?.op).filter(Boolean);mode.value="recipe";ops.value=JSON.stringify(cfg,null,2);save();announce(bank);
            M.Status?.set(`Captured ${cfg.length} recipe operation${cfg.length===1?"":"s"} into ${cur.slot.name}.`,"ready");
        });
        actions.append(saveBtn,runBtn,captureBtn);article.append(heading,mode,name,ops,actions);return article;
    }

    function renderEditor(){const root=document.querySelector("[data-cz-macro-editor]");if(!root)return;root.replaceChildren(...banks.map(editorCard));}

    const Macros={definitions,indices,selected,currentRecipeConfig,
        step(bank,delta){const slots=definitions[bank]||[];indices[bank]=wrap((indices[bank]||0)+delta,slots.length);save();const s=announce(bank);renderEditor();return s;},
        run,announceAll(){banks.forEach(announce);},renderEditor,
        boot(){this.announceAll();this.renderEditor();window.addEventListener("zzx-cyberchef-frame-ready",()=>this.announceAll());}
    };
    M.Macros=Macros;
})();

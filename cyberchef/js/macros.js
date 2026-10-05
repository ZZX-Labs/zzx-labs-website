(() => {
    "use strict";
    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const banks = config.macroBanks;

    function cloneDefaults() {
        const out = {};
        banks.forEach(bank => {
            out[bank] = (config.macroDefaults[bank] || []).map((entry, index) => ({
                name: entry[0] || `Macro ${bank.toUpperCase()}${index + 1}`,
                operations: Array.isArray(entry[1]) ? [...entry[1]] : []
            }));
            while (out[bank].length < config.macroSlotsPerBank) out[bank].push({ name: `User Slot ${bank.toUpperCase()}${out[bank].length + 1}`, operations: [] });
        });
        return out;
    }
    function parseJSON(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
    let definitions = parseJSON(Storage.read(config.storageKeys.macros, ""), null) || cloneDefaults();
    let indices = parseJSON(Storage.read(config.storageKeys.macroIndices, ""), null) || { a:0, b:0, c:0, d:0 };
    banks.forEach(bank => { if (!Array.isArray(definitions[bank])) definitions[bank] = cloneDefaults()[bank]; indices[bank] = Number.isFinite(+indices[bank]) ? +indices[bank] : 0; });

    function wrap(i, n) { return n ? ((i % n) + n) % n : 0; }
    function save() { Storage.write(config.storageKeys.macros, JSON.stringify(definitions)); Storage.write(config.storageKeys.macroIndices, JSON.stringify(indices)); }
    function selected(bank) { const slots = definitions[bank] || []; const index = wrap(indices[bank] || 0, slots.length); indices[bank] = index; return { bank, index, slot: slots[index] || {name:"Empty",operations:[]} }; }
    function announce(bank) { const s = selected(bank); window.dispatchEvent(new CustomEvent("zzx-cyberchef-macro-change", { detail: { bank, index:s.index, count:(definitions[bank]||[]).length, label:s.slot.name, slot:s.slot } })); return s; }
    async function run(bank) {
        const s = selected(bank), missing = [];
        if (!s.slot.operations.length) { M.Status?.set(`Macro ${bank.toUpperCase()}${s.index + 1} is empty. Add operation names in the Macro Editor.`, "error"); return false; }
        for (const name of s.slot.operations) {
            if (!M.Operations?.activateByName(name)) missing.push(name);
            await new Promise(resolve => setTimeout(resolve, 55));
        }
        if (missing.length) M.Status?.set(`Macro ${s.slot.name}: could not resolve ${missing.join(", ")}.`, "error");
        else M.Status?.set(`Macro executed: ${s.slot.name}.`, "ready");
        return missing.length === 0;
    }
    function editorCard(bank) {
        const s = selected(bank), article = document.createElement("article"); article.className = "cz-macro-card"; article.dataset.macroBank = bank;
        const heading = document.createElement("div"); heading.className = "cz-macro-card-head";
        const title = document.createElement("h3"); title.textContent = `Macro ${bank.toUpperCase()}`;
        const meta = document.createElement("span"); meta.textContent = `Slot ${s.index + 1} / ${config.macroSlotsPerBank}`; heading.append(title, meta);
        const name = document.createElement("input"); name.type="text"; name.className="cz-macro-name"; name.value=s.slot.name; name.setAttribute("aria-label",`Macro ${bank.toUpperCase()} name`);
        const ops = document.createElement("textarea"); ops.className="cz-macro-operations"; ops.rows=5; ops.value=s.slot.operations.join("\n"); ops.placeholder="From Base64\nGunzip\nStrings"; ops.setAttribute("aria-label",`Macro ${bank.toUpperCase()} operations`);
        const actions=document.createElement("div"); actions.className="cz-macro-actions";
        const saveBtn=document.createElement("button"); saveBtn.type="button"; saveBtn.textContent="Save Slot";
        const runBtn=document.createElement("button"); runBtn.type="button"; runBtn.textContent="Run Slot";
        const captureBtn=document.createElement("button"); captureBtn.type="button"; captureBtn.textContent="Capture Current Recipe";
        saveBtn.addEventListener("click",()=>{ const cur=selected(bank); cur.slot.name=name.value.trim() || `Macro ${bank.toUpperCase()}${cur.index+1}`; cur.slot.operations=ops.value.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean); save(); announce(bank); renderEditor(); });
        runBtn.addEventListener("click",()=>run(bank));
        captureBtn.addEventListener("click",()=>{ const cur=selected(bank); const names=M.Operations?.recipeOperationNames?.() || []; cur.slot.operations=names; ops.value=names.join("\n"); save(); announce(bank); });
        actions.append(saveBtn,runBtn,captureBtn); article.append(heading,name,ops,actions); return article;
    }
    function renderEditor() { const root=document.querySelector("[data-cz-macro-editor]"); if (!root) return; root.replaceChildren(...banks.map(editorCard)); }

    const Macros = {
        definitions, indices,
        selected,
        step(bank, delta) { const slots=definitions[bank]||[]; indices[bank]=wrap((indices[bank]||0)+delta,slots.length); save(); const s=announce(bank); renderEditor(); return s; },
        run, announceAll(){banks.forEach(announce);}, renderEditor,
        boot(){ this.announceAll(); this.renderEditor(); window.addEventListener("zzx-cyberchef-frame-ready",()=>this.announceAll()); }
    };
    M.Macros = Macros;
})();

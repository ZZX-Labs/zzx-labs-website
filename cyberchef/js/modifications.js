(() => {
    "use strict";
    const M=window.ZZXCyberChefModules,config=window.ZZX.CYBERCHEF;
    const cards=[
        ["Upstream Engine Integrity","<code>/cyberchef/app/</code> keeps the official CyberChef engine bundles, workers, and assets unchanged. Its entry HTML includes an additive mobile viewport and compatibility layer for direct Android access; the archived upstream release is unchanged."],
        ["Post-Load CSS Stack","Upstream styling loads first. <code>css/frame/shim.css</code> then imports independent token, font, theme, typography, layout, component, operation, and scrollbar override modules."],
        ["64 Theme Presets","Eight visual families × eight variants produce 64 independently selectable theme systems without editing upstream CyberChef stylesheets."],
        ["128 Layout Presets","Sixteen workspace geometries × eight density profiles produce 128 layouts for Operations, Recipe, Input, Output, and control density."],
        ["Module + Function Encoders","CyberChef categories and operations are discovered from the running local UI. Rotate to navigate; press Function to add the selected operation using CyberChef's own event behavior."],
        ["64 User Macro Slots","Four lower encoders each expose sixteen programmable slots. Macro definitions remain wrapper-side and can sequence CyberChef operations by name."],
        ["Quota Compatibility","Modified mode can guard CyberChef against browser <code>QuotaExceededError</code> without patching the pristine native release."],
        ["Official Download Routing","ZZX download controls and the Modified-mode CyberChef download modal point to the official GCHQ GitHub release asset rather than a ZZX-hosted ZIP."]
    ];
    M.Modifications={boot(){const root=document.getElementById(config.modificationsId);if(!root)return;root.replaceChildren(...cards.map(([title,body])=>{const article=document.createElement("article");article.className="cz-mod-card";const h=document.createElement("h3");h.textContent=title;const p=document.createElement("p");p.innerHTML=body;article.append(h,p);return article;}));}};
})();

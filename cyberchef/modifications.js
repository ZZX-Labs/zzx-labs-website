(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;

    const cards = [
        ["CSS Shim", "Upstream CyberChef CSS loads first. <code>css/frame/shim.css</code> then imports the ZZX theme, typography, layout, component, operation, and scrollbar overrides."],
        ["Theme Encoder", "Rotary control selects independent color/theme presets without rewriting the upstream CyberChef stylesheet."],
        ["Layout Encoder", "Rotary control applies workspace geometry presets to Operations, Recipe, Input, and Output panels."],
        ["Module Encoder", "Enumerates CyberChef operation categories dynamically from the locally hosted upstream UI."],
        ["Function Encoder", "Enumerates operations inside the selected category. Pressing the knob invokes CyberChef's own operation double-click behavior."],
        ["Native Baseline", "<code>/cyberchef/app/</code> stays pristine so every ZZX modification can be compared against the identical locally hosted upstream release."]
    ];

    M.Modifications = {
        boot() {
            const root = document.getElementById(config.modificationsId);
            if (!root) return;
            root.replaceChildren(...cards.map(([title, body]) => {
                const article = document.createElement("article");
                article.className = "cz-mod-card";
                const h3 = document.createElement("h3");
                h3.textContent = title;
                const p = document.createElement("p");
                p.innerHTML = body;
                article.append(h3, p);
                return article;
            }));
        }
    };
})();

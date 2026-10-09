(() => {
    "use strict";

    const config = window.ZZX.CYBERCHEF;

    function byId(id) {
        return document.getElementById(id);
    }

    const Status = {
        set(message, kind = "") {
            const node = byId(config.statusId);
            if (!node) return;
            node.textContent = message;
            node.classList.remove("cz-status-ready", "cz-status-error");
            if (kind === "ready") node.classList.add("cz-status-ready");
            if (kind === "error") node.classList.add("cz-status-error");
        },
        frame(message) {
            const node = byId(config.frameStateId);
            if (node) node.textContent = message;
        },
        source(mode) {
            const modified = mode === "modified";
            const active = byId(config.activeSourceId);
            const card = byId("cz-mode-card");
            if (active) active.textContent = modified ? "ZZXCyberChef Modified" : "Native Local CyberChef";
            if (card) card.textContent = modified ? "ZZX Modified" : "Native Local";
            document.body.dataset.cyberchefMode = modified ? "modified" : "native";
        }
    };

    window.ZZXCyberChefModules.Status = Status;
})();

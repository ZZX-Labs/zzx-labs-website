(() => {
    "use strict";

    const BN = window.BN || {};

    function $all(selector, scope = document) {
        if (BN.$$) {
            return BN.$$(selector, scope);
        }

        return Array.from(scope.querySelectorAll(selector));
    }

    function number(value, fallback = 0) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function escapeHtml(value) {
        if (BN.escape) {
            return BN.escape(value);
        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function rows() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function countBy(rowsInput, getter, limit = 12) {
        const map = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)))
            .slice(0, limit);
    }

    function classifyClient(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "Bitcoin Knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "Bitcoin Core";
        }

        return "Other";
    }

    function buildModel(type, rowsInput = rows()) {
        if (type === "clients") {
            return countBy(rowsInput, classifyClient, 8);
        }

        if (type === "countries") {
            return countBy(rowsInput, row => row.country || row.country_code || "Unknown", 12);
        }

        if (type === "asns") {
            return countBy(rowsInput, row => row.asn || "Unknown", 12);
        }

        if (type === "ports") {
            return countBy(rowsInput, row => row.port || "Unknown", 12);
        }

        if (type === "versions") {
            return countBy(rowsInput, row => row.protocol || row.version || "Unknown", 12);
        }

        return countBy(rowsInput, row => row.agent || row.user_agent || "Unknown", 10);
    }

    function render3D(target) {
        const type = target.dataset.bn3d || "clients";
        const title = target.dataset.title || "Three-Dimensional Network Display";
        const model = buildModel(type);
        const max = Math.max(...model.map(item => item.value), 1);

        if (!model.length) {
            target.innerHTML = `
                <section class="bn-3d-card">
                    <span class="bn-kicker">3D Display</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>No rows are available for this display yet.</p>
                </section>
            `;

            return;
        }

        target.innerHTML = `
            <section class="bn-3d-card">
                <header class="bn-3d-head">
                    <span class="bn-kicker">3D Display</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>
                        CSS-driven depth display for selected Bitnodes registry categories.
                        This is a lightweight native frontend module, not an external 3D engine.
                    </p>
                </header>

                <div class="bn-3d-stage" style="--bn-3d-count: ${model.length};">
                    <div class="bn-3d-grid-floor"></div>

                    ${model.map((item, index) => {
                        const height = Math.max(34, Math.min(210, 34 + (number(item.value, 0) / max) * 176));

                        return `
                            <article
                                class="bn-3d-tower"
                                style="
                                    --bn-3d-index: ${index};
                                    --bn-3d-height: ${height}px;
                                "
                            >
                                <div class="bn-3d-column">
                                    <span class="bn-3d-top"></span>
                                    <span class="bn-3d-face bn-3d-front"></span>
                                    <span class="bn-3d-face bn-3d-side"></span>
                                </div>

                                <footer>
                                    <strong>${escapeHtml(formatNumber(item.value))}</strong>
                                    <span>${escapeHtml(item.label)}</span>
                                </footer>
                            </article>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }

    function renderAll(scope = document) {
        $all("[data-bn-3d], #bn-3d", scope).forEach(render3D);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.BN3D = {
        init,
        renderAll,
        render3D,
        buildModel,
        countBy,
        classifyClient
    };
})();

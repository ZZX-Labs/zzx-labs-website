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

    function classifyClient(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "core";
        }

        return "other";
    }

    function countBy(rowsInput, getter) {
        const counts = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
    }

    function buildGraphModel(type, rowsInput = rows()) {
        if (type === "clients") {
            return countBy(rowsInput, classifyClient).map(item => ({
                ...item,
                group: "client"
            }));
        }

        if (type === "countries") {
            return countBy(rowsInput, row => row.country || row.country_code || "Unknown").slice(0, 16);
        }

        if (type === "asns") {
            return countBy(rowsInput, row => row.asn || "Unknown").slice(0, 16);
        }

        if (type === "ports") {
            return countBy(rowsInput, row => row.port || "Unknown").slice(0, 16);
        }

        return countBy(rowsInput, row => row.agent || row.user_agent || "Unknown").slice(0, 12);
    }

    function nodeSize(value, max) {
        const safeMax = Math.max(max, 1);
        return Math.max(32, Math.min(92, 32 + (number(value, 0) / safeMax) * 60));
    }

    function renderGraph(target) {
        const type = target.dataset.bnGraph || "clients";
        const title = target.dataset.title || "Network Relationship Graph";
        const model = buildGraphModel(type);
        const max = Math.max(...model.map(item => item.value), 1);

        if (!model.length) {
            target.innerHTML = `
                <section class="bn-graph-card">
                    <span class="bn-kicker">Graph</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>No graph rows are available yet.</p>
                </section>
            `;

            return;
        }

        target.innerHTML = `
            <section class="bn-graph-card">
                <header class="bn-graph-head">
                    <span class="bn-kicker">Graph</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>Radial relationship readout generated from selected Bitnodes registry rows.</p>
                </header>

                <div class="bn-graph-orbit" style="--bn-graph-count: ${model.length};">
                    <div class="bn-graph-core">
                        <strong>${escapeHtml(formatNumber(model.reduce((sum, item) => sum + item.value, 0)))}</strong>
                        <span>Total</span>
                    </div>

                    ${model.map((item, index) => {
                        const size = nodeSize(item.value, max);

                        return `
                            <article
                                class="bn-graph-node"
                                style="
                                    --bn-graph-index: ${index};
                                    --bn-graph-size: ${size}px;
                                "
                                title="${escapeHtml(item.label)}: ${escapeHtml(formatNumber(item.value))}"
                            >
                                <strong>${escapeHtml(formatNumber(item.value))}</strong>
                                <span>${escapeHtml(item.label)}</span>
                            </article>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }

    function renderAll(scope = document) {
        $all("[data-bn-graph], #bn-graph", scope).forEach(renderGraph);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.BNGraphs = {
        init,
        renderAll,
        renderGraph,
        buildGraphModel,
        countBy
    };
})();

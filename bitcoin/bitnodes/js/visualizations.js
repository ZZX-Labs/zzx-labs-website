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
            .filter(row => row.value > 0)
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

    function resolveRowsForType(type, rowsInput = rows()) {
        if (window.BNCharts?.getDataset) {
            const dataset = window.BNCharts.getDataset(type);

            if (dataset) {
                const labels = Array.isArray(dataset.labels) ? dataset.labels : [];
                const values = Array.isArray(dataset.values) ? dataset.values : [];

                return labels.map((label, index) => ({
                    label: String(label || "Unknown"),
                    value: number(values[index], 0)
                }));
            }
        }

        if (type === "countries") {
            return countBy(rowsInput, row => row.country || row.country_code || "Unknown");
        }

        if (type === "asns") {
            return countBy(rowsInput, row => row.asn || "Unknown");
        }

        if (type === "agents") {
            return countBy(rowsInput, row => row.agent || row.user_agent || "Unknown");
        }

        if (type === "ports") {
            return countBy(rowsInput, row => row.port || "Unknown");
        }

        if (type === "versions") {
            return countBy(rowsInput, row => row.protocol || row.version || "Unknown");
        }

        if (type === "clients" || type === "knots-vs-core") {
            return countBy(rowsInput, classifyClient, 3);
        }

        if (type === "known-vs-reachable") {
            const latest = BN.state?.latest || {};
            const known = number(latest.known_nodes || latest.total_nodes || rowsInput.length, rowsInput.length);
            const reachable = number(latest.reachable_nodes || rowsInput.length, rowsInput.length);
            const unreachable = number(latest.unreachable_nodes, Math.max(0, known - reachable));

            return [
                {
                    label: "Reachable",
                    value: reachable
                },
                {
                    label: "Unreachable",
                    value: unreachable
                }
            ];
        }

        return [];
    }

    function bar(row, max) {
        const value = number(row.value, 0);
        const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;

        return `
            <div class="bn-viz-row">
                <div class="bn-viz-row-head">
                    <span class="bn-viz-label">${escapeHtml(row.label)}</span>
                    <strong class="bn-viz-value">${escapeHtml(formatNumber(value))}</strong>
                </div>

                <div class="bn-viz-track">
                    <span class="bn-viz-fill" style="width: ${width.toFixed(2)}%;"></span>
                </div>
            </div>
        `;
    }

    function renderList(target, type, title) {
        const data = resolveRowsForType(type);
        const max = Math.max(...data.map(row => number(row.value, 0)), 1);

        if (!data.length) {
            target.innerHTML = `
                <section class="bn-visualization-card">
                    <span class="bn-kicker">Visualization</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>No visualization rows are available yet.</p>
                </section>
            `;

            return;
        }

        target.innerHTML = `
            <section class="bn-visualization-card">
                <header class="bn-visualization-head">
                    <span class="bn-kicker">Visualization</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>Ranked visual readout from the selected Bitnodes data source.</p>
                </header>

                <div class="bn-viz-list">
                    ${data.map(row => bar(row, max)).join("")}
                </div>
            </section>
        `;
    }

    function renderCanvas(canvas) {
        if (window.BNCanvasCharts?.renderCanvas) {
            return window.BNCanvasCharts.renderCanvas(canvas);
        }

        const type = canvas.dataset.bnChart || "countries";
        const data = resolveRowsForType(type);
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 640);
        const height = number(canvas.dataset.height, 300);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "rgba(5,8,5,0.96)";
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(192,214,116,0.12)";
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        if (!data.length) {
            ctx.fillStyle = "rgba(204,216,182,0.7)";
            ctx.font = "13px IBM Plex Mono, monospace";
            ctx.textAlign = "center";
            ctx.fillText("No chart data available.", width / 2, height / 2);
            return;
        }

        const max = Math.max(...data.map(row => number(row.value, 0)), 1);
        const left = 140;
        const top = 42;
        const right = 24;
        const rowHeight = Math.max(20, Math.min(30, (height - top - 30) / data.length));
        const chartWidth = width - left - right;

        ctx.fillStyle = "#edf7b9";
        ctx.font = "700 13px IBM Plex Mono, monospace";
        ctx.textAlign = "left";
        ctx.fillText(canvas.dataset.title || type, 18, 23);

        data.slice(0, 12).forEach((row, index) => {
            const y = top + index * rowHeight;
            const value = number(row.value, 0);
            const barWidth = (value / max) * chartWidth;

            ctx.fillStyle = "rgba(204,216,182,0.72)";
            ctx.font = "10px IBM Plex Mono, monospace";
            ctx.textAlign = "right";
            ctx.fillText(String(row.label).slice(0, 18), left - 10, y + 13);

            ctx.fillStyle = index % 2 === 0 ? "rgba(192,214,116,0.78)" : "rgba(230,164,43,0.72)";
            ctx.fillRect(left, y, barWidth, rowHeight * 0.55);

            ctx.fillStyle = "#edf7b9";
            ctx.textAlign = "left";
            ctx.fillText(formatNumber(value), left + barWidth + 8, y + 13);
        });
    }

    function renderAll(scope = document) {
        $all("[data-bn-visualization]", scope).forEach(target => {
            const type = target.dataset.bnVisualization || "countries";
            const title = target.dataset.title || "Network Distribution";

            renderList(target, type, title);
        });

        $all("canvas[data-bn-chart]", scope).forEach(renderCanvas);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.BNVisualizations = {
        init,
        renderAll,
        renderCanvas,
        renderList,
        resolveRowsForType,
        countBy,
        classifyClient
    };
})();

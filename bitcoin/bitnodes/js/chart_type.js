(() => {
    "use strict";

    const BN = window.BN || {};

    const SUPPORTED_TYPES = [
        "bar",
        "line",
        "area",
        "donut",
        "pie",
        "circle",
        "venn",
        "flow",
        "meter",
        "radial",
        "stack",
        "matrix",
        "sparkline",
        "scatter",
        "bubble"
    ];

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
            .map(([label, value]) => ({ label, value }))
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

    function getData(type, rowsInput = rows()) {
        if (window.BNCanvasCharts?.buildRowsForType) {
            const data = window.BNCanvasCharts.buildRowsForType(type);

            if (data?.length) {
                return data;
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

        return countBy(rowsInput, row => row.country || row.country_code || "Unknown");
    }

    function total(data) {
        return data.reduce((sum, row) => sum + number(row.value, 0), 0);
    }

    function max(data) {
        return Math.max(...data.map(row => number(row.value, 0)), 1);
    }

    function percent(value, totalValue) {
        if (!totalValue) {
            return 0;
        }

        return Math.max(0, Math.min(100, (number(value, 0) / totalValue) * 100));
    }

    function renderBars(data) {
        const highest = max(data);

        return `
            <div class="bn-charttype-bars">
                ${data.map(row => `
                    <article class="bn-charttype-bar-row">
                        <div class="bn-charttype-row-head">
                            <span>${escapeHtml(row.label)}</span>
                            <strong>${escapeHtml(formatNumber(row.value))}</strong>
                        </div>

                        <div class="bn-charttype-track">
                            <span style="width: ${percent(row.value, highest)}%;"></span>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderDonut(data) {
        const sum = total(data);
        let offset = 0;

        const stops = data.slice(0, 8).map((row, index) => {
            const start = offset;
            const size = percent(row.value, sum);

            offset += size;

            return `var(--bn-charttype-c${index}) ${start}% ${offset}%`;
        }).join(", ");

        return `
            <div class="bn-charttype-donut-wrap">
                <div
                    class="bn-charttype-donut"
                    style="background: conic-gradient(${stops || "rgba(192,214,116,0.3) 0 100%"});"
                >
                    <div>
                        <strong>${escapeHtml(formatNumber(sum))}</strong>
                        <span>Total</span>
                    </div>
                </div>

                <div class="bn-charttype-legend">
                    ${data.slice(0, 8).map((row, index) => `
                        <span>
                            <i style="--i: ${index};"></i>
                            ${escapeHtml(row.label)}
                            <strong>${escapeHtml(formatNumber(row.value))}</strong>
                        </span>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderMeter(data) {
        const first = data[0] || { label: "Value", value: 0 };
        const sum = total(data);
        const pct = percent(first.value, sum || first.value);

        return `
            <div class="bn-charttype-meter">
                <div class="bn-charttype-meter-arc" style="--pct: ${pct};">
                    <strong>${escapeHtml(Math.round(pct))}%</strong>
                    <span>${escapeHtml(first.label)}</span>
                </div>

                <p>${escapeHtml(formatNumber(first.value))} of ${escapeHtml(formatNumber(sum || first.value))}</p>
            </div>
        `;
    }

    function renderVenn(data) {
        const items = data.slice(0, 3);
        const sum = total(items) || 1;

        return `
            <div class="bn-charttype-venn">
                ${items.map((row, index) => `
                    <article
                        class="bn-charttype-venn-circle c${index}"
                        style="--scale: ${0.72 + percent(row.value, sum) / 180};"
                    >
                        <strong>${escapeHtml(formatNumber(row.value))}</strong>
                        <span>${escapeHtml(row.label)}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderFlow(data) {
        return `
            <div class="bn-charttype-flow">
                ${data.slice(0, 6).map((row, index) => `
                    <article>
                        <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
                        <strong>${escapeHtml(row.label)}</strong>
                        <small>${escapeHtml(formatNumber(row.value))}</small>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderMatrix(data) {
        const highest = max(data);

        return `
            <div class="bn-charttype-matrix">
                ${data.slice(0, 36).map(row => `
                    <article style="--alpha: ${Math.max(0.16, percent(row.value, highest) / 100)};">
                        <strong>${escapeHtml(formatNumber(row.value))}</strong>
                        <span>${escapeHtml(row.label)}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderSparkline(data) {
        const highest = max(data);

        return `
            <div class="bn-charttype-sparkline">
                ${data.slice(0, 30).map(row => `
                    <span
                        title="${escapeHtml(row.label)}: ${escapeHtml(formatNumber(row.value))}"
                        style="height: ${Math.max(8, percent(row.value, highest))}%;"
                    ></span>
                `).join("")}
            </div>
        `;
    }

    function renderChartBody(chartType, data) {
        if (chartType === "donut" || chartType === "pie" || chartType === "circle" || chartType === "radial") {
            return renderDonut(data);
        }

        if (chartType === "meter") {
            return renderMeter(data);
        }

        if (chartType === "venn") {
            return renderVenn(data);
        }

        if (chartType === "flow") {
            return renderFlow(data);
        }

        if (chartType === "matrix" || chartType === "stack") {
            return renderMatrix(data);
        }

        if (chartType === "sparkline" || chartType === "line" || chartType === "area") {
            return renderSparkline(data);
        }

        return renderBars(data);
    }

    function renderChartElement(target) {
        if (!target || target.tagName === "CANVAS") {
            return window.BNCanvasCharts?.renderCanvas?.(target);
        }

        const chartType = target.dataset.bnChartType || target.dataset.chartType || "bar";
        const dataType = target.dataset.bnChartData || target.dataset.bnChart || "countries";
        const title = target.dataset.title || `${chartType} chart`;
        const subtitle = target.dataset.subtitle || "Generated from the selected Bitnodes data source.";
        const data = getData(dataType);

        target.innerHTML = `
            <section class="bn-charttype-card is-${escapeHtml(chartType)}">
                <header class="bn-charttype-head">
                    <span class="bn-kicker">Chart Type</span>
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(subtitle)}</p>
                </header>

                ${data.length ? renderChartBody(chartType, data) : `
                    <div class="bn-charttype-empty">
                        No chart data is available.
                    </div>
                `}
            </section>
        `;

        return target;
    }

    function renderAll(scope = document) {
        $all("[data-bn-chart-type], [data-chart-type]", scope).forEach(renderChartElement);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.BNChartType = {
        supportedTypes: SUPPORTED_TYPES,
        init,
        renderAll,
        renderChartElement,
        getData,
        renderChartBody,
        renderBars,
        renderDonut,
        renderMeter,
        renderVenn,
        renderFlow,
        renderMatrix,
        renderSparkline
    };
})();

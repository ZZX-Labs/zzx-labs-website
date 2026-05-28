(() => {
    "use strict";

    const DEFAULT_CHART_HEIGHT = 300;
    const BN = window.BN || {};
    const DATASETS = new Map();

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    function $all(selector, scope = document) {
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

    function registerDataset(name, dataset) {
        if (!name || !dataset) {
            return;
        }

        DATASETS.set(String(name), normalizeDataset(dataset));
    }

    function clearDatasets() {
        DATASETS.clear();
    }

    function getDataset(name) {
        return DATASETS.get(String(name)) || null;
    }

    function normalizeDataset(dataset) {
        if (Array.isArray(dataset)) {
            return {
                labels: dataset.map(row => row.label ?? row.name ?? row.key ?? "Unknown"),
                values: dataset.map(row => number(row.value ?? row.count ?? row.nodes ?? row.reachable_nodes, 0))
            };
        }

        return {
            labels: Array.isArray(dataset.labels) ? dataset.labels : [],
            values: Array.isArray(dataset.values) ? dataset.values : [],
            title: dataset.title || "",
            centerLabel: dataset.centerLabel || ""
        };
    }

    function datasetToRows(dataset) {
        const normalized = normalizeDataset(dataset);
        const labels = normalized.labels;
        const values = normalized.values;

        return labels
            .map((label, index) => ({
                label: String(label ?? "Unknown"),
                value: number(values[index], 0)
            }))
            .filter(row => row.value >= 0);
    }

    function topRows(payload, labelKeys, valueKeys, limit = 12) {
        const rows =
            Array.isArray(payload?.results)
                ? payload.results
                : Array.isArray(payload?.rows)
                    ? payload.rows
                    : Array.isArray(payload)
                        ? payload
                        : [];

        const labelList = Array.isArray(labelKeys) ? labelKeys : [labelKeys];
        const valueList = Array.isArray(valueKeys) ? valueKeys : [valueKeys];

        return rows
            .map(row => {
                let label = "Unknown";
                let value = 0;

                for (const key of labelList) {
                    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
                        label = row[key];
                        break;
                    }
                }

                for (const key of valueList) {
                    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
                        value = number(row[key], 0);
                        break;
                    }
                }

                return {
                    label: String(label),
                    value
                };
            })
            .filter(row => row.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);
    }

    function countBy(rows, getter, limit = 12) {
        const map = new Map();

        rows.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";
            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .filter(row => row.value > 0)
            .sort((a, b) => b.value - a.value)
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

    function maxHeightFor(rows) {
        const values = rows
            .map(row => number(row.height, null))
            .filter(value => value !== null);

        return values.length ? Math.max(...values) : 0;
    }

    function rowsFromState() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    async function buildRowsForType(type) {
        const dataset = getDataset(type);

        if (dataset) {
            return datasetToRows(dataset);
        }

        const rows = rowsFromState();

        if (rows.length) {
            if (type === "countries") {
                return countBy(rows, row => row.country || row.country_code || "Unknown");
            }

            if (type === "asns") {
                return countBy(rows, row => row.asn || "Unknown");
            }

            if (type === "agents") {
                return countBy(rows, row => row.agent || row.user_agent || "Unknown");
            }

            if (type === "ports") {
                return countBy(rows, row => row.port || "Unknown");
            }

            if (type === "versions") {
                return countBy(rows, row => row.protocol || row.version || "Unknown");
            }

            if (type === "knots-vs-core") {
                const counts = countBy(rows, classifyClient, 3);

                return [
                    {
                        label: "Bitcoin Knots",
                        value: counts.find(item => item.label === "Bitcoin Knots")?.value || 0
                    },
                    {
                        label: "Bitcoin Core",
                        value: counts.find(item => item.label === "Bitcoin Core")?.value || 0
                    },
                    {
                        label: "Other",
                        value: counts.find(item => item.label === "Other")?.value || 0
                    }
                ];
            }

            if (type === "client-heights") {
                const knots = rows.filter(row => classifyClient(row) === "Bitcoin Knots");
                const core = rows.filter(row => classifyClient(row) === "Bitcoin Core");
                const other = rows.filter(row => classifyClient(row) === "Other");

                return [
                    {
                        label: "Knots Max",
                        value: maxHeightFor(knots)
                    },
                    {
                        label: "Core Max",
                        value: maxHeightFor(core)
                    },
                    {
                        label: "Other Max",
                        value: maxHeightFor(other)
                    }
                ];
            }

            if (type === "knots-growth") {
                const count = rows.filter(row => classifyClient(row) === "Bitcoin Knots").length;

                return [
                    {
                        label: "Current",
                        value: count
                    }
                ];
            }

            if (type === "core-growth") {
                const count = rows.filter(row => classifyClient(row) === "Bitcoin Core").length;

                return [
                    {
                        label: "Current",
                        value: count
                    }
                ];
            }

            if (type === "known-vs-reachable") {
                const latest = BN.state?.latest || {};
                const known = number(latest.known_nodes || latest.total_nodes || rows.length, rows.length);
                const reachable = number(latest.reachable_nodes || rows.length, rows.length);
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
        }

        if (!window.BNAPI) {
            return [];
        }

        if (type === "countries") {
            return topRows(await window.BNAPI.fetchEndpointSafe?.("countries"), ["country", "name", "value"], ["reachable_nodes", "nodes", "count"], 12);
        }

        if (type === "asns") {
            return topRows(await window.BNAPI.fetchEndpointSafe?.("asns"), ["asn", "name", "value"], ["reachable_nodes", "nodes", "count"], 12);
        }

        if (type === "agents") {
            return topRows(await window.BNAPI.fetchEndpointSafe?.("agents"), ["agent", "user_agent", "name", "value"], ["reachable_nodes", "nodes", "count"], 12);
        }

        if (type === "ports") {
            return topRows(await window.BNAPI.fetchEndpointSafe?.("ports"), ["port", "name", "value"], ["reachable_nodes", "nodes", "count"], 12);
        }

        if (type === "versions") {
            return topRows(await window.BNAPI.fetchEndpointSafe?.("versions"), ["protocol", "version", "name", "value"], ["reachable_nodes", "nodes", "count"], 12);
        }

        return [];
    }

    function setupCanvas(canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 640);
        const height = Number(canvas.dataset.height || DEFAULT_CHART_HEIGHT);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        return {
            ctx,
            width,
            height
        };
    }

    function clearCanvas(canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function getTheme() {
        const styles = getComputedStyle(document.documentElement);

        return {
            accent: styles.getPropertyValue("--bn-accent").trim() || "#c0d674",
            accentSoft: "rgba(192,214,116,0.22)",
            ochre: "#e6a42b",
            text: "#edf7b9",
            muted: "rgba(204,216,182,0.70)",
            grid: "rgba(192,214,116,0.12)",
            danger: "#d95c5c",
            panel: "rgba(5,8,5,0.96)"
        };
    }

    function palette(index, theme) {
        const values = [
            theme.accent,
            theme.ochre,
            "rgba(237,247,185,0.78)",
            "rgba(192,214,116,0.48)",
            "rgba(230,164,43,0.58)",
            "rgba(204,216,182,0.50)"
        ];

        return values[index % values.length];
    }

    function drawPanel(ctx, width, height, theme) {
        ctx.fillStyle = theme.panel;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(192,214,116,0.10)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    }

    function drawTitle(ctx, title, theme, x = 18, y = 22) {
        if (!title) {
            return;
        }

        ctx.fillStyle = theme.text;
        ctx.font = "700 13px IBM Plex Mono, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(title, x, y);
    }

    function drawAxes(ctx, width, height, padding, theme, max) {
        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();

        for (let i = 1; i <= 4; i += 1) {
            const y = padding.top + ((height - padding.top - padding.bottom) / 4) * i;

            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            const label = Math.round(max - (max / 4) * i);

            ctx.fillStyle = theme.muted;
            ctx.font = "10px IBM Plex Mono, monospace";
            ctx.textAlign = "right";
            ctx.fillText(formatNumber(label), padding.left - 8, y + 3);
        }
    }

    function drawEmpty(canvas, message = "Awaiting chart data.") {
        const { ctx, width, height } = setupCanvas(canvas);
        const theme = getTheme();

        clearCanvas(canvas);
        drawPanel(ctx, width, height, theme);

        ctx.fillStyle = theme.muted;
        ctx.font = "13px IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(message, width / 2, height / 2);
    }

    function drawBarChart(canvas, rows, options = {}) {
        const { ctx, width, height } = setupCanvas(canvas);
        const theme = getTheme();

        clearCanvas(canvas);
        drawPanel(ctx, width, height, theme);

        rows = rows.filter(row => number(row.value, 0) > 0).slice(0, 16);

        if (!rows.length) {
            drawEmpty(canvas);
            return;
        }

        const padding = {
            top: 42,
            right: 20,
            bottom: 68,
            left: 62
        };

        const max = Math.max(...rows.map(row => number(row.value, 0)), 1);
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const slot = chartWidth / rows.length;
        const barWidth = Math.max(10, Math.min(42, slot * 0.62));

        drawTitle(ctx, options.title || "", theme);
        drawAxes(ctx, width, height, padding, theme, max);

        rows.forEach((row, index) => {
            const value = number(row.value, 0);
            const x = padding.left + slot * index + (slot - barWidth) / 2;
            const barHeight = (value / max) * chartHeight;
            const y = height - padding.bottom - barHeight;

            const gradient = ctx.createLinearGradient(0, y, 0, height - padding.bottom);
            gradient.addColorStop(0, palette(index, theme));
            gradient.addColorStop(1, "rgba(192,214,116,0.12)");

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);

            ctx.fillStyle = theme.text;
            ctx.font = "700 10px IBM Plex Mono, monospace";
            ctx.textAlign = "center";
            ctx.fillText(formatNumber(value), x + barWidth / 2, Math.max(padding.top + 12, y - 6));

            ctx.fillStyle = theme.muted;
            ctx.font = "10px IBM Plex Mono, monospace";

            const label = String(row.label || "").slice(0, 14);

            ctx.save();
            ctx.translate(x + barWidth / 2, height - padding.bottom + 18);
            ctx.rotate(-Math.PI / 5);
            ctx.fillText(label, 0, 0);
            ctx.restore();
        });
    }

    function drawLineChart(canvas, rows, options = {}) {
        const { ctx, width, height } = setupCanvas(canvas);
        const theme = getTheme();

        clearCanvas(canvas);
        drawPanel(ctx, width, height, theme);

        rows = rows.filter(row => number(row.value, null) !== null);

        if (!rows.length) {
            drawEmpty(canvas);
            return;
        }

        if (rows.length === 1) {
            rows = [
                {
                    label: "Previous",
                    value: 0
                },
                rows[0]
            ];
        }

        const padding = {
            top: 42,
            right: 24,
            bottom: 44,
            left: 62
        };

        const values = rows.map(row => number(row.value, 0));
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = Math.max(max - min, 1);
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        drawTitle(ctx, options.title || "", theme);
        drawAxes(ctx, width, height, padding, theme, max);

        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        rows.forEach((row, index) => {
            const value = number(row.value, 0);
            const x = padding.left + (chartWidth / (rows.length - 1)) * index;
            const y = height - padding.bottom - ((value - min) / range) * chartHeight;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        rows.forEach((row, index) => {
            const value = number(row.value, 0);
            const x = padding.left + (chartWidth / (rows.length - 1)) * index;
            const y = height - padding.bottom - ((value - min) / range) * chartHeight;

            ctx.fillStyle = theme.ochre;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = theme.text;
            ctx.font = "700 10px IBM Plex Mono, monospace";
            ctx.textAlign = "center";
            ctx.fillText(formatNumber(value), x, y - 10);
        });
    }

    function drawDonutChart(canvas, rows, options = {}) {
        const { ctx, width, height } = setupCanvas(canvas);
        const theme = getTheme();

        clearCanvas(canvas);
        drawPanel(ctx, width, height, theme);

        rows = rows.filter(row => number(row.value, 0) > 0);

        if (!rows.length) {
            drawEmpty(canvas);
            return;
        }

        const total = rows.reduce((sum, row) => sum + number(row.value, 0), 0) || 1;
        const cx = width / 2;
        const cy = height / 2 + 8;
        const radius = Math.min(width, height) * 0.30;
        const inner = radius * 0.58;

        let start = -Math.PI / 2;

        drawTitle(ctx, options.title || "", theme);

        rows.forEach((row, index) => {
            const value = number(row.value, 0);
            const slice = (value / total) * Math.PI * 2;
            const end = start + slice;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, start, end);
            ctx.arc(cx, cy, inner, end, start, true);
            ctx.closePath();

            ctx.fillStyle = palette(index, theme);
            ctx.globalAlpha = 0.88;
            ctx.fill();
            ctx.globalAlpha = 1;

            start = end;
        });

        ctx.fillStyle = theme.text;
        ctx.font = "900 22px IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(formatNumber(total), cx, cy - 7);

        ctx.fillStyle = theme.muted;
        ctx.font = "700 11px IBM Plex Mono, monospace";
        ctx.fillText(options.centerLabel || "TOTAL", cx, cy + 17);

        const legendX = 18;
        let legendY = height - 52;

        rows.slice(0, 4).forEach((row, index) => {
            ctx.fillStyle = palette(index, theme);
            ctx.fillRect(legendX, legendY - 8, 10, 10);

            ctx.fillStyle = theme.muted;
            ctx.font = "10px IBM Plex Mono, monospace";
            ctx.textAlign = "left";
            ctx.fillText(`${String(row.label).slice(0, 22)}: ${formatNumber(row.value)}`, legendX + 16, legendY);

            legendY += 15;
        });
    }

    async function renderCanvas(canvas) {
        const type = canvas.dataset.bnChart || "countries";
        const mode = canvas.dataset.chartMode || canvas.dataset.bnChartMode || "bar";

        try {
            const rows = await buildRowsForType(type);

            if (!rows.length) {
                drawEmpty(canvas, "No chart rows available.");
                return;
            }

            const title = canvas.dataset.title || "";

            if (mode === "line") {
                drawLineChart(canvas, rows, { title });
                return;
            }

            if (mode === "donut") {
                drawDonutChart(canvas, rows, {
                    title,
                    centerLabel: canvas.dataset.centerLabel || "NODES"
                });
                return;
            }

            drawBarChart(canvas, rows, { title });
        } catch (err) {
            console.error("Chart render failed:", err);
            drawEmpty(canvas, err.message || "Chart failed to load.");
        }
    }

    function renderAllCharts(scope = document) {
        $all("canvas[data-bn-chart]", scope).forEach(renderCanvas);
    }

    function debounce(fn, wait = 160) {
        let timer = null;

        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAllCharts();
    });

    document.addEventListener("bn:datasource-change", () => {
        clearDatasets();
        renderAllCharts();
    });

    window.addEventListener(
        "resize",
        debounce(() => renderAllCharts(), 220)
    );

    window.BNCharts = {
        datasets: DATASETS,
        registerDataset,
        clearDatasets,
        getDataset,
        renderAll: renderAllCharts,
        renderCanvas,
        drawBarChart,
        drawLineChart,
        drawDonutChart
    };

    ready(() => {
        renderAllCharts();
    });
})();

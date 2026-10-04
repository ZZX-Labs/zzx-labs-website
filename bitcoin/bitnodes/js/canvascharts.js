(() => {
    "use strict";

    const DEFAULT_CHART_HEIGHT = 300;
    const BN = window.BN || {};
    const DATASETS = window.BNCharts?.datasets || new Map();

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

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

    function rowsFromState() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function normalizeDataset(dataset) {
        if (Array.isArray(dataset)) {
            return {
                labels: dataset.map(row => row.label ?? row.name ?? row.key ?? "Unknown"),
                values: dataset.map(row => number(row.value ?? row.count ?? row.nodes ?? row.reachable_nodes, 0)),
                title: "",
                centerLabel: ""
            };
        }

        return {
            labels: Array.isArray(dataset?.labels) ? dataset.labels : [],
            values: Array.isArray(dataset?.values) ? dataset.values : [],
            title: dataset?.title || "",
            centerLabel: dataset?.centerLabel || ""
        };
    }

    function datasetToRows(dataset) {
        const normalized = normalizeDataset(dataset);

        return normalized.labels
            .map((label, index) => ({
                label: String(label ?? "Unknown"),
                value: number(normalized.values[index], 0)
            }))
            .filter(row => row.value >= 0);
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

    function maxHeightFor(rows) {
        const values = rows
            .map(row => number(row.height, null))
            .filter(value => value !== null);

        return values.length ? Math.max(...values) : 0;
    }

    function buildRowsForType(type) {
        const dataset = DATASETS.get(String(type));

        if (dataset) {
            return datasetToRows(dataset);
        }

        const rows = rowsFromState();

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

        if (type === "clients" || type === "knots-vs-core") {
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
            return [
                {
                    label: "Current",
                    value: rows.filter(row => classifyClient(row) === "Bitcoin Knots").length
                }
            ];
        }

        if (type === "core-growth") {
            return [
                {
                    label: "Current",
                    value: rows.filter(row => classifyClient(row) === "Bitcoin Core").length
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

        return [];
    }

    function setupCanvas(canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 640);
        const height = number(canvas.dataset.height, DEFAULT_CHART_HEIGHT);

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

    function drawTitle(ctx, title, theme, x = 18, y = 23) {
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
            right: 22,
            bottom: 74,
            left: 66
        };

        const max = Math.max(...rows.map(row => number(row.value, 0)), 1);
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const slot = chartWidth / rows.length;
        const barWidth = Math.max(10, Math.min(44, slot * 0.62));

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
            ctx.fillText(formatNumber(value), x + barWidth / 2, Math.max(padding.top + 12, y - 7));

            ctx.fillStyle = theme.muted;
            ctx.font = "10px IBM Plex Mono, monospace";

            const label = String(row.label || "").slice(0, 14);

            ctx.save();
            ctx.translate(x + barWidth / 2, height - padding.bottom + 19);
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
            right: 26,
            bottom: 46,
            left: 66
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

        let legendY = height - 52;

        rows.slice(0, 4).forEach((row, index) => {
            ctx.fillStyle = palette(index, theme);
            ctx.fillRect(18, legendY - 8, 10, 10);

            ctx.fillStyle = theme.muted;
            ctx.font = "10px IBM Plex Mono, monospace";
            ctx.textAlign = "left";
            ctx.fillText(`${String(row.label).slice(0, 22)}: ${formatNumber(row.value)}`, 34, legendY);

            legendY += 15;
        });
    }

    function renderCanvas(canvas) {
        const type = canvas.dataset.bnChart || "countries";
        const mode = canvas.dataset.chartMode || canvas.dataset.bnChartMode || "bar";
        const rows = buildRowsForType(type);

        if (!rows.length) {
            drawEmpty(canvas, "No chart rows available.");
            return;
        }

        const title = canvas.dataset.title || "";

        if (mode === "line") {
            drawLineChart(canvas, rows, { title });
            return;
        }

        if (mode === "donut" || mode === "pie") {
            drawDonutChart(canvas, rows, {
                title,
                centerLabel: canvas.dataset.centerLabel || "NODES"
            });
            return;
        }

        drawBarChart(canvas, rows, { title });
    }

    function renderAll(scope = document) {
        $all("canvas[data-bn-chart]", scope).forEach(renderCanvas);
    }

    function debounce(fn, wait = 180) {
        let timer = null;

        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.addEventListener(
        "resize",
        debounce(() => renderAll(), 220)
    );

    window.BNCanvasCharts = {
        init,
        renderAll,
        renderCanvas,
        normalizeDataset,
        buildRowsForType,
        drawBarChart,
        drawLineChart,
        drawDonutChart,
        drawEmpty
    };

    ready(init);
})();

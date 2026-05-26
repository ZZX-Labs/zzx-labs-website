(() => {
    "use strict";

    const DEFAULT_CHART_HEIGHT = 280;

    const BN = window.BN || {};

    const DATASETS = new Map();

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
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

        return Number.isFinite(n)
            ? n.toLocaleString()
            : "—";
    }

    function clearCanvas(canvas) {
        const ctx = canvas.getContext("2d");

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    function setupCanvas(canvas) {
        const rect = canvas.getBoundingClientRect();

        const dpr =
            window.devicePixelRatio || 1;

        const width = Math.max(
            320,
            rect.width ||
            canvas.parentElement?.clientWidth ||
            640
        );

        const height = Number(
            canvas.dataset.height ||
            DEFAULT_CHART_HEIGHT
        );

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        return {
            ctx,
            width,
            height
        };
    }

    function getTheme() {
        const styles =
            getComputedStyle(document.documentElement);

        return {
            accent:
                styles.getPropertyValue("--bn-accent").trim() ||
                "#c0d674",

            ochre: "#e6a42b",

            text: "#edf7b9",

            muted:
                "rgba(204,216,182,0.68)",

            grid:
                "rgba(192,214,116,0.10)"
        };
    }

    function drawAxes(
        ctx,
        width,
        height,
        padding,
        theme
    ) {
        ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1;

        ctx.beginPath();

        ctx.moveTo(
            padding.left,
            padding.top
        );

        ctx.lineTo(
            padding.left,
            height - padding.bottom
        );

        ctx.lineTo(
            width - padding.right,
            height - padding.bottom
        );

        ctx.stroke();

        const gridLines = 4;

        for (
            let i = 1;
            i <= gridLines;
            i += 1
        ) {
            const y =
                padding.top +
                (
                    (
                        height -
                        padding.top -
                        padding.bottom
                    ) / gridLines
                ) * i;

            ctx.beginPath();

            ctx.moveTo(
                padding.left,
                y
            );

            ctx.lineTo(
                width - padding.right,
                y
            );

            ctx.stroke();
        }
    }

    function drawBarChart(
        canvas,
        rows,
        options = {}
    ) {
        const {
            ctx,
            width,
            height
        } = setupCanvas(canvas);

        const theme = getTheme();

        clearCanvas(canvas);

        const padding = {
            top: 22,
            right: 18,
            bottom: 58,
            left: 56
        };

        const values =
            rows.map(row => number(row.value));

        const max =
            Math.max(...values, 1);

        const chartWidth =
            width -
            padding.left -
            padding.right;

        const chartHeight =
            height -
            padding.top -
            padding.bottom;

        const barGap = 8;

        const barWidth = Math.max(
            12,
            (chartWidth / rows.length) - barGap
        );

        drawAxes(
            ctx,
            width,
            height,
            padding,
            theme
        );

        rows.forEach((row, index) => {
            const value =
                number(row.value);

            const x =
                padding.left +
                (
                    index *
                    (chartWidth / rows.length)
                ) +
                (barGap / 2);

            const barHeight =
                (value / max) *
                chartHeight;

            const y =
                height -
                padding.bottom -
                barHeight;

            ctx.fillStyle =
                row.color ||
                theme.accent;

            ctx.globalAlpha = 0.85;

            ctx.fillRect(
                x,
                y,
                barWidth,
                barHeight
            );

            ctx.globalAlpha = 1;

            ctx.fillStyle =
                theme.muted;

            ctx.font =
                "11px IBM Plex Mono";

            ctx.textAlign =
                "center";

            const label =
                String(row.label || "")
                    .slice(0, 14);

            ctx.save();

            ctx.translate(
                x + (barWidth / 2),
                height - padding.bottom + 18
            );

            ctx.rotate(-Math.PI / 5);

            ctx.fillText(
                label,
                0,
                0
            );

            ctx.restore();
        });

        if (options.title) {
            ctx.fillStyle =
                theme.text;

            ctx.font =
                "700 13px IBM Plex Mono";

            ctx.textAlign =
                "left";

            ctx.fillText(
                options.title,
                padding.left,
                15
            );
        }
    }

    function drawLineChart(
        canvas,
        rows,
        options = {}
    ) {
        const {
            ctx,
            width,
            height
        } = setupCanvas(canvas);

        const theme = getTheme();

        clearCanvas(canvas);

        const padding = {
            top: 22,
            right: 18,
            bottom: 42,
            left: 56
        };

        const values =
            rows.map(row => number(row.value));

        const max =
            Math.max(...values, 1);

        const min =
            Math.min(...values, 0);

        const range =
            Math.max(max - min, 1);

        const chartWidth =
            width -
            padding.left -
            padding.right;

        const chartHeight =
            height -
            padding.top -
            padding.bottom;

        drawAxes(
            ctx,
            width,
            height,
            padding,
            theme
        );

        ctx.strokeStyle =
            theme.accent;

        ctx.lineWidth = 2;

        ctx.beginPath();

        rows.forEach((row, index) => {
            const value =
                number(row.value);

            const x =
                padding.left +
                (
                    rows.length === 1
                        ? 0
                        : (
                            chartWidth /
                            (rows.length - 1)
                        ) * index
                );

            const y =
                height -
                padding.bottom -
                (
                    (
                        value - min
                    ) / range
                ) * chartHeight;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        rows.forEach((row, index) => {
            const value =
                number(row.value);

            const x =
                padding.left +
                (
                    rows.length === 1
                        ? 0
                        : (
                            chartWidth /
                            (rows.length - 1)
                        ) * index
                );

            const y =
                height -
                padding.bottom -
                (
                    (
                        value - min
                    ) / range
                ) * chartHeight;

            ctx.fillStyle =
                theme.ochre;

            ctx.beginPath();

            ctx.arc(
                x,
                y,
                3,
                0,
                Math.PI * 2
            );

            ctx.fill();
        });

        if (options.title) {
            ctx.fillStyle =
                theme.text;

            ctx.font =
                "700 13px IBM Plex Mono";

            ctx.textAlign =
                "left";

            ctx.fillText(
                options.title,
                padding.left,
                15
            );
        }
    }

    function drawDonutChart(
        canvas,
        rows,
        options = {}
    ) {
        const {
            ctx,
            width,
            height
        } = setupCanvas(canvas);

        const theme = getTheme();

        clearCanvas(canvas);

        const total =
            rows.reduce(
                (sum, row) => sum + number(row.value),
                0
            ) || 1;

        const cx = width / 2;
        const cy = height / 2;

        const radius =
            Math.min(width, height) * 0.34;

        const inner =
            radius * 0.58;

        let start =
            -Math.PI / 2;

        rows.forEach((row, index) => {
            const value =
                number(row.value);

            const slice =
                (value / total) *
                Math.PI * 2;

            const end =
                start + slice;

            ctx.beginPath();

            ctx.arc(
                cx,
                cy,
                radius,
                start,
                end
            );

            ctx.arc(
                cx,
                cy,
                inner,
                end,
                start,
                true
            );

            ctx.closePath();

            ctx.fillStyle =
                row.color ||
                (
                    index % 2 === 0
                        ? theme.accent
                        : theme.ochre
                );

            ctx.globalAlpha = 0.86;

            ctx.fill();

            ctx.globalAlpha = 1;

            start = end;
        });

        ctx.fillStyle =
            theme.text;

        ctx.font =
            "800 22px IBM Plex Mono";

        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";

        ctx.fillText(
            formatNumber(total),
            cx,
            cy - 6
        );

        ctx.fillStyle =
            theme.muted;

        ctx.font =
            "700 11px IBM Plex Mono";

        ctx.fillText(
            options.centerLabel || "TOTAL",
            cx,
            cy + 17
        );

        if (options.title) {
            ctx.fillStyle =
                theme.text;

            ctx.font =
                "700 13px IBM Plex Mono";

            ctx.textAlign =
                "left";

            ctx.textBaseline =
                "alphabetic";

            ctx.fillText(
                options.title,
                16,
                18
            );
        }
    }

    function registerDataset(
        name,
        dataset
    ) {
        DATASETS.set(name, dataset);
    }

    function getDataset(name) {
        return DATASETS.get(name) || null;
    }

    function datasetToRows(dataset) {
        if (!dataset) {
            return [];
        }

        const labels =
            Array.isArray(dataset.labels)
                ? dataset.labels
                : [];

        const values =
            Array.isArray(dataset.values)
                ? dataset.values
                : [];

        return labels.map((label, index) => ({
            label,
            value: values[index] || 0
        }));
    }

    async function buildRowsForType(type) {
        const dataset =
            getDataset(type);

        if (dataset) {
            return datasetToRows(dataset);
        }

        if (!window.BNAPI) {
            return [];
        }

        if (type === "countries") {
            const payload =
                await window.BNAPI.fetchCountries();

            return topRows(
                payload,
                "country",
                [
                    "reachable_nodes",
                    "nodes",
                    "count"
                ],
                12
            );
        }

        if (type === "asns") {
            const payload =
                await window.BNAPI.fetchASNs();

            return topRows(
                payload,
                "asn",
                [
                    "reachable_nodes",
                    "nodes",
                    "count"
                ],
                12
            );
        }

        if (type === "agents") {
            const payload =
                await window.BNAPI.fetchAgents();

            return topRows(
                payload,
                "agent",
                [
                    "reachable_nodes",
                    "nodes",
                    "count"
                ],
                12
            );
        }

        if (type === "ports") {
            const payload =
                await window.BNAPI.fetchPorts();

            return topRows(
                payload,
                "port",
                [
                    "reachable_nodes",
                    "nodes",
                    "count"
                ],
                12
            );
        }

        if (type === "versions") {
            const payload =
                await window.BNAPI.fetchVersions();

            return topRows(
                payload,
                "protocol",
                [
                    "reachable_nodes",
                    "nodes",
                    "count"
                ],
                12
            );
        }

        return [];
    }

    function topRows(
        payload,
        labelKey,
        valueKeys,
        limit = 12
    ) {
        const results =
            Array.isArray(payload?.results)
                ? payload.results
                : [];

        return results
            .map(row => {
                let value = 0;

                for (const key of valueKeys) {
                    if (row[key] !== undefined) {
                        value =
                            number(row[key]);

                        break;
                    }
                }

                return {
                    label:
                        row[labelKey] ||
                        row.name ||
                        row.value ||
                        "Unknown",

                    value
                };
            })
            .filter(row => row.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);
    }

    async function renderCanvas(canvas) {
        const type =
            canvas.dataset.bnChart ||
            "countries";

        const mode =
            canvas.dataset.chartMode ||
            canvas.dataset.bnChartMode ||
            "bar";

        try {
            const rows =
                await buildRowsForType(type);

            if (!rows.length) {
                return;
            }

            const title =
                canvas.dataset.title || "";

            if (mode === "line") {
                drawLineChart(
                    canvas,
                    rows,
                    { title }
                );

                return;
            }

            if (mode === "donut") {
                drawDonutChart(
                    canvas,
                    rows,
                    {
                        title,
                        centerLabel:
                            canvas.dataset.centerLabel ||
                            "NODES"
                    }
                );

                return;
            }

            drawBarChart(
                canvas,
                rows,
                { title }
            );

        } catch (err) {
            const {
                ctx,
                width,
                height
            } = setupCanvas(canvas);

            const theme =
                getTheme();

            clearCanvas(canvas);

            ctx.fillStyle =
                theme.muted;

            ctx.font =
                "13px IBM Plex Mono";

            ctx.textAlign =
                "center";

            ctx.fillText(
                err.message ||
                "Chart failed to load.",
                width / 2,
                height / 2
            );
        }
    }

    function renderAllCharts() {
        $all("canvas[data-bn-chart]")
            .forEach(renderCanvas);
    }

    function debounce(
        fn,
        wait = 150
    ) {
        let timer = null;

        return (...args) => {
            clearTimeout(timer);

            timer = setTimeout(
                () => fn(...args),
                wait
            );
        };
    }

    window.BNCharts = {
        datasets: DATASETS,
        registerDataset,
        getDataset,
        renderAll: renderAllCharts,
        renderCanvas,
        drawBarChart,
        drawLineChart,
        drawDonutChart
    };

    ready(renderAllCharts);

    window.addEventListener(
        "resize",
        debounce(renderAllCharts, 200)
    );
})();
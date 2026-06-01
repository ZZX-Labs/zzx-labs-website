(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latency/latest.json",
        originalbitnodes: "../api/originalbitnodes/latency/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        raw: "../api/zzxbitnodes/latest.json",
        local: "../api/latency/latest.json",
        external: "../api/latency/latest.json"
    };

    const DEFAULT_SOURCE = "zzxbitnodes";
    const DEFAULT_LIMIT = 1000;

    let ROWS = [];
    let LAST_SOURCE = DEFAULT_SOURCE;
    let LAST_LOADED_AT = null;

    const $ = selector => document.querySelector(selector);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number" && Number.isFinite(value)) {
            return value.toLocaleString();
        }

        return String(value);
    }

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function asNumber(value, fallback = 0) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return fallback;
        }

        return n;
    }

    function formatLatency(value) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "—";
        }

        if (n < 0) {
            return "Down";
        }

        if (n === 0) {
            return "No Data";
        }

        return `${Math.round(n).toLocaleString()} ms`;
    }

    function formatTime(value) {
        if (!value) {
            return "—";
        }

        if (value instanceof Date) {
            return value.toISOString().replace("T", " ").replace(".000Z", " UTC");
        }

        const numeric = Number(value);

        if (Number.isFinite(numeric)) {
            const ms = numeric < 10000000000 ? numeric * 1000 : numeric;
            const date = new Date(ms);

            if (!Number.isNaN(date.getTime())) {
                return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
            }
        }

        const parsed = new Date(value);

        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().replace("T", " ").replace(".000Z", " UTC");
        }

        return String(value);
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(`${url}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    function nodeAddressFromArray(node, block) {
        if (typeof node === "string" && node.trim()) {
            return node;
        }

        if (Array.isArray(block)) {
            return block[0] || block[2] || "unknown";
        }

        return "unknown";
    }

    function extractArrayMeta(block) {
        const meta = block[19] && typeof block[19] === "object" ? block[19] : {};

        return {
            agent: block[1] || meta.agent || "",
            city: block[6] || meta.city || "",
            country: block[7] || meta.country || "",
            asn: block[11] || meta.asn || "",
            organization: block[12] || meta.organization || "",
            last_seen: meta.last_seen || block[5] || Date.now(),
            services: block[3] || meta.services || "",
            port: block[2] || meta.port || "",
            network: meta.network || ""
        };
    }

    function extractObjectMeta(block) {
        return {
            agent: block.agent || block.user_agent || block.version || "",
            city: block.city || "",
            country: block.country || block.country_code || "",
            asn: block.asn || block.as_number || "",
            organization: block.organization || block.org || block.as_name || "",
            last_seen: block.last_seen || block.updated_at || block.timestamp || Date.now(),
            services: block.services || "",
            port: block.port || "",
            network: block.network || block.type || ""
        };
    }

    function pushPoint(rows, node, period, t, v, extra = {}) {
        const value = Number(v);

        rows.push({
            node: node || "unknown",
            period: period || "latency",
            t: t || Date.now(),
            v: Number.isFinite(value) ? value : 0,
            country: extra.country || "",
            city: extra.city || "",
            asn: extra.asn || "",
            organization: extra.organization || "",
            agent: extra.agent || "",
            services: extra.services || "",
            port: extra.port || "",
            network: extra.network || ""
        });
    }

    function normalizePointArray(rows, node, period, points, meta) {
        if (!Array.isArray(points)) {
            return;
        }

        for (const point of points) {
            if (Array.isArray(point)) {
                pushPoint(rows, node, period, point[0], point[1], meta);
                continue;
            }

            if (point && typeof point === "object") {
                pushPoint(
                    rows,
                    node,
                    period,
                    point.t || point.time || point.timestamp || point.updated_at,
                    point.v ?? point.value ?? point.latency_ms ?? point.latency,
                    meta
                );
            }
        }
    }

    function normalizeFromNodes(nodes) {
        const rows = [];
        const seenSnapshotNodes = new Set();
        const now = Date.now();

        for (const [nodeKey, block] of Object.entries(nodes || {})) {
            if (Array.isArray(block)) {
                const node = nodeAddressFromArray(nodeKey, block);
                const meta = extractArrayMeta(block);
                const latency =
                    meta.latency_ms ??
                    block.latency_ms ??
                    block.daily_latency_ms ??
                    block.weekly_latency_ms ??
                    block.monthly_latency_ms ??
                    block[20] ??
                    0;

                pushPoint(rows, node, "snapshot_latency", meta.last_seen || now, latency, meta);
                seenSnapshotNodes.add(node);
                continue;
            }

            if (!block || typeof block !== "object") {
                continue;
            }

            const node =
                block.node ||
                block.address ||
                block.addr ||
                nodeKey ||
                "unknown";

            const meta = extractObjectMeta(block);

            normalizePointArray(rows, node, "daily_latency", block.daily_latency, meta);
            normalizePointArray(rows, node, "weekly_latency", block.weekly_latency, meta);
            normalizePointArray(rows, node, "monthly_latency", block.monthly_latency, meta);
            normalizePointArray(rows, node, "latency", block.latency_points, meta);
            normalizePointArray(rows, node, "latency", block.history, meta);

            if (!seenSnapshotNodes.has(node)) {
                const latency =
                    block.latency_ms ??
                    block.daily_latency_ms ??
                    block.weekly_latency_ms ??
                    block.monthly_latency_ms ??
                    block.ping_ms ??
                    block.response_ms ??
                    0;

                pushPoint(rows, node, "snapshot_latency", meta.last_seen || now, latency, meta);
                seenSnapshotNodes.add(node);
            }
        }

        return rows;
    }

    function normalizeLatencySummary(data) {
        if (!data || typeof data !== "object") {
            return [];
        }

        if (!data.summary || typeof data.summary !== "object") {
            return [];
        }

        const rows = [];
        const summary = data.summary;
        const now = data.updated_at || data.generated_at || data.timestamp || Date.now();

        const average =
            summary.average_ms ??
            summary.avg_ms ??
            summary.average_latency_ms ??
            summary.average ??
            0;

        const measured =
            summary.measured_nodes ??
            summary.count ??
            summary.reachable_nodes ??
            summary.nodes ??
            0;

        for (let i = 0; i < Number(measured || 0); i += 1) {
            pushPoint(rows, `summary-node-${i + 1}`, "summary_latency", now, average, {
                country: "",
                city: "",
                asn: "",
                organization: data.source || "",
                agent: "summary"
            });

            if (i >= 999) {
                break;
            }
        }

        return rows;
    }

    function normalizeArrayRows(data) {
        return data.map(row => ({
            node: row.node || row.address || row.addr || "unknown",
            period: row.period || row.kind || "latency",
            t: row.t || row.time || row.timestamp || row.updated_at || Date.now(),
            v: asNumber(row.v ?? row.value ?? row.latency_ms ?? row.latency ?? row.response_ms ?? 0),
            country: row.country || row.country_code || "",
            city: row.city || "",
            asn: row.asn || row.as_number || "",
            organization: row.organization || row.org || row.as_name || "",
            agent: row.agent || row.user_agent || row.version || "",
            services: row.services || "",
            port: row.port || "",
            network: row.network || row.type || ""
        }));
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return normalizeArrayRows(data);
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        const rows = [];

        const nodeBlocks =
            data.nodes ||
            data.reachable_nodes ||
            data.latency_nodes ||
            data.results ||
            null;

        if (nodeBlocks && typeof nodeBlocks === "object" && !Array.isArray(nodeBlocks)) {
            rows.push(...normalizeFromNodes(nodeBlocks));
        }

        if (Array.isArray(data.latency)) {
            rows.push(...normalizeArrayRows(data.latency));
        } else if (data.latency && typeof data.latency === "object" && !rows.length) {
            rows.push(...normalizeFromNodes(data.latency));
        }

        for (const period of ["daily_latency", "weekly_latency", "monthly_latency"]) {
            const points = data[period] || [];

            if (Array.isArray(points)) {
                normalizePointArray(
                    rows,
                    data.node || data.address || data.addr || "sample-node",
                    period,
                    points,
                    extractObjectMeta(data)
                );
            }
        }

        if (!rows.length) {
            rows.push(...normalizeLatencySummary(data));
        }

        return rows;
    }

    function percentile(values, p) {
        if (!values.length) {
            return 0;
        }

        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));

        return sorted[idx];
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const reachable = rows.filter(row => Number(row.v) > 0);
        const down = rows.filter(row => Number(row.v) < 0);
        const noData = rows.filter(row => Number(row.v) === 0);
        const values = reachable.map(row => Number(row.v));
        const avg = values.length
            ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
            : 0;

        const median = Math.round(percentile(values, 50));
        const p90 = Math.round(percentile(values, 90));

        target.innerHTML = `
            <article class="zzx-card bn-card"><span>Latency Points</span><strong>${fmt(rows.length)}</strong></article>
            <article class="zzx-card bn-card"><span>Reachable Points</span><strong>${fmt(reachable.length)}</strong></article>
            <article class="zzx-card bn-card"><span>Down Points</span><strong>${fmt(down.length)}</strong></article>
            <article class="zzx-card bn-card"><span>No Data</span><strong>${fmt(noData.length)}</strong></article>
            <article class="zzx-card bn-card"><span>Average Latency</span><strong>${fmt(avg)} ms</strong></article>
            <article class="zzx-card bn-card"><span>Median Latency</span><strong>${fmt(median)} ms</strong></article>
            <article class="zzx-card bn-card"><span>P90 Latency</span><strong>${fmt(p90)} ms</strong></article>
            <article class="zzx-card bn-card"><span>Loaded At</span><strong>${esc(formatTime(LAST_LOADED_AT))}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const period = $("#bn-period")?.value || "all";
        const sort = $("#bn-sort")?.value || "time";

        let rows = ROWS.filter(row => {
            if (period !== "all" && row.period !== period) {
                return false;
            }

            if (!search) {
                return true;
            }

            return [
                row.node,
                row.period,
                row.v,
                row.country,
                row.city,
                row.asn,
                row.organization,
                row.agent,
                row.services,
                row.port,
                row.network
            ].join(" ").toLowerCase().includes(search);
        });

        rows = [...rows];

        if (sort === "latency") {
            rows.sort((a, b) => Number(a.v || 0) - Number(b.v || 0));
        } else if (sort === "latency-desc") {
            rows.sort((a, b) => Number(b.v || 0) - Number(a.v || 0));
        } else if (sort === "node") {
            rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        } else if (sort === "country") {
            rows.sort((a, b) => String(a.country || a.city).localeCompare(String(b.country || b.city)));
        } else if (sort === "asn") {
            rows.sort((a, b) => String(a.asn).localeCompare(String(b.asn)));
        } else {
            rows.sort((a, b) => Number(b.t || 0) - Number(a.t || 0));
        }

        return rows;
    }

    function rowClass(value) {
        const n = Number(value);

        if (n < 0) {
            return "bn-latency-down";
        }

        if (n === 0 || !Number.isFinite(n)) {
            return "bn-latency-empty";
        }

        if (n <= 250) {
            return "bn-latency-good";
        }

        if (n <= 1000) {
            return "bn-latency-warn";
        }

        return "bn-latency-slow";
    }

    function statusLabel(value) {
        const n = Number(value);

        if (n < 0) {
            return "Down";
        }

        if (n === 0 || !Number.isFinite(n)) {
            return "No Data";
        }

        if (n <= 250) {
            return "Fast";
        }

        if (n <= 1000) {
            return "Slow";
        }

        return "Very Slow";
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No latency telemetry matched current filters.</div>`;
            return;
        }

        const visible = rows.slice(0, DEFAULT_LIMIT);

        view.innerHTML = `
            <div class="bn-table-meta">
                Showing ${fmt(visible.length)} of ${fmt(rows.length)} matching rows.
            </div>

            <div class="bn-latency-table-wrap">
                <table class="bn-latency-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Period</th>
                            <th>Timestamp</th>
                            <th>Latency</th>
                            <th>Status</th>
                            <th>Country / City</th>
                            <th>ASN</th>
                            <th>Organization</th>
                            <th>Agent</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${visible.map(row => {
                            const value = Number(row.v);
                            const cls = rowClass(value);

                            return `
                                <tr>
                                    <td class="bn-latency-node">${esc(fmt(row.node))}</td>
                                    <td class="bn-latency-period">${esc(fmt(String(row.period).replace("_latency", "")))}</td>
                                    <td>${esc(formatTime(row.t))}</td>
                                    <td class="${cls}">${esc(formatLatency(value))}</td>
                                    <td class="${cls}">${esc(statusLabel(value))}</td>
                                    <td>${esc(fmt(row.country || row.city))}</td>
                                    <td>${esc(fmt(row.asn))}</td>
                                    <td>${esc(fmt(row.organization))}</td>
                                    <td>${esc(fmt(row.agent))}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadLatency() {
        const source = $("#bn-source")?.value || DEFAULT_SOURCE;
        const url = SOURCES[source] || SOURCES[DEFAULT_SOURCE];

        LAST_SOURCE = source;
        setStatus(`Loading latency telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            LAST_LOADED_AT = Date.now();

            renderSummary(ROWS);
            renderRows(filteredRows());

            if (!ROWS.length) {
                setStatus(`Loaded ${source}, but no latency rows were found in the selected data schema.`, "warn");
                return;
            }

            setStatus(`Loaded ${fmt(ROWS.length)} latency data points from ${source}.`, "ok");
        } catch (err) {
            ROWS = [];
            LAST_LOADED_AT = Date.now();

            renderSummary([]);
            renderRows([]);

            setStatus(`Latency telemetry unavailable from ${source}: ${err.message}`, "warn");
        }
    }

    function bindControls() {
        $("#bn-refresh")?.addEventListener("click", loadLatency);
        $("#bn-source")?.addEventListener("change", loadLatency);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-period")?.addEventListener("change", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);
    }

    document.addEventListener("DOMContentLoaded", () => {
        bindControls();
        loadLatency();
    });
})();

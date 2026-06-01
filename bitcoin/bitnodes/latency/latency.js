(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latency.json",
        originalbitnodes: "../api/originalbitnodes/latency.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latency.json",
        external: "../api/latency.json"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
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

    function formatTime(value) {
        if (!value) return "—";

        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
            return String(value);
        }

        const ms = numeric < 10000000000 ? numeric * 1000 : numeric;

        try {
            return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
        } catch {
            return String(value);
        }
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

    function pushPoint(rows, node, period, t, v, extra = {}) {
        rows.push({
            node: node || "unknown",
            period: period || "latency",
            t: t || Date.now(),
            v: v,
            country: extra.country || "",
            city: extra.city || "",
            asn: extra.asn || "",
            organization: extra.organization || "",
            agent: extra.agent || ""
        });
    }

    function normalizeFromNodes(nodes) {
        const rows = [];
        const now = Date.now();

        for (const [node, block] of Object.entries(nodes || {})) {
            if (Array.isArray(block)) {
                const meta = block[19] && typeof block[19] === "object" ? block[19] : {};
                const latency = meta.latency_ms ?? meta.daily_latency_ms ?? meta.weekly_latency_ms ?? meta.monthly_latency_ms;

                pushPoint(rows, node, "snapshot_latency", meta.last_seen || now, latency || 0, {
                    country: block[7],
                    city: block[6],
                    asn: block[11],
                    organization: block[12],
                    agent: block[1]
                });

                continue;
            }

            if (!block || typeof block !== "object") {
                continue;
            }

            for (const period of ["daily_latency", "weekly_latency", "monthly_latency"]) {
                const points = block[period] || [];

                for (const point of points) {
                    pushPoint(rows, node, period, point.t, point.v, block);
                }
            }

            if (!rows.some(row => row.node === node)) {
                const latency = block.latency_ms ?? block.daily_latency_ms ?? block.weekly_latency_ms ?? block.monthly_latency_ms;

                pushPoint(rows, node, "snapshot_latency", block.last_seen || now, latency || 0, block);
            }
        }

        return rows;
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data.map(row => ({
                node: row.node || row.address || "unknown",
                period: row.period || "latency",
                t: row.t || row.timestamp || row.updated_at || Date.now(),
                v: row.v ?? row.latency_ms ?? row.latency ?? 0,
                country: row.country || "",
                city: row.city || "",
                asn: row.asn || "",
                organization: row.organization || "",
                agent: row.agent || ""
            }));
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        const rows = [];

        const nodeBlocks =
            data.nodes ||
            data.latency ||
            data.results ||
            {};

        if (nodeBlocks && typeof nodeBlocks === "object" && !Array.isArray(nodeBlocks)) {
            rows.push(...normalizeFromNodes(nodeBlocks));
        }

        if (!rows.length) {
            for (const period of ["daily_latency", "weekly_latency", "monthly_latency"]) {
                const points = data?.[period] || [];

                for (const point of points) {
                    pushPoint(rows, data.node || data.address || "sample-node", period, point.t, point.v, data);
                }
            }
        }

        return rows;
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const reachable = rows.filter(row => Number(row.v) > 0);
        const down = rows.filter(row => Number(row.v) < 0);
        const avg = reachable.length
            ? Math.round(reachable.reduce((sum, row) => sum + Number(row.v), 0) / reachable.length)
            : 0;

        target.innerHTML = `
            <article class="bn-card"><span>Latency Points</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Points</span><strong>${fmt(reachable.length)}</strong></article>
            <article class="bn-card"><span>Down Points</span><strong>${fmt(down.length)}</strong></article>
            <article class="bn-card"><span>Average Latency</span><strong>${fmt(avg)} ms</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const period = $("#bn-period")?.value || "daily_latency";
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
                row.agent
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "latency") {
            rows.sort((a, b) => Number(a.v || 0) - Number(b.v || 0));
        } else if (sort === "node") {
            rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        } else {
            rows.sort((a, b) => Number(b.t || 0) - Number(a.t || 0));
        }

        return rows;
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

        view.innerHTML = `
            <div class="bn-latency-table-wrap">
                <table class="bn-latency-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Period</th>
                            <th>Timestamp</th>
                            <th>Latency</th>
                            <th>Status</th>
                            <th>Country</th>
                            <th>ASN</th>
                            <th>Organization</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.slice(0, 500).map(row => {
                            const value = Number(row.v);
                            const status =
                                value < 0 ? "Down" :
                                value === 0 ? "No Data" :
                                "Reachable";

                            const cls =
                                value < 0 ? "bn-latency-down" :
                                value === 0 ? "bn-latency-empty" :
                                "bn-latency-good";

                            return `
                                <tr>
                                    <td class="bn-latency-node">${esc(fmt(row.node))}</td>
                                    <td class="bn-latency-period">${esc(fmt(String(row.period).replace("_latency", "")))}</td>
                                    <td>${esc(formatTime(row.t))}</td>
                                    <td class="${cls}">${value > 0 ? `${esc(fmt(value))} ms` : esc(fmt(value))}</td>
                                    <td class="${cls}">${status}</td>
                                    <td>${esc(fmt(row.country || row.city))}</td>
                                    <td>${esc(fmt(row.asn))}</td>
                                    <td>${esc(fmt(row.organization))}</td>
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
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading latency telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);

            renderSummary(ROWS);
            renderRows(filteredRows());

            setStatus(`Loaded ${fmt(ROWS.length)} latency data points.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Latency telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadLatency);
        $("#bn-source")?.addEventListener("change", loadLatency);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-period")?.addEventListener("change", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadLatency();
    });
})();

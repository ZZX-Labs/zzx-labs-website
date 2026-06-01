(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/propagation.json",
        originalbitnodes: "../api/originalbitnodes/propagation.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/propagation.json",
        external: "../api/propagation.json"
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
            return new Date(ms)
                .toISOString()
                .replace("T", " ")
                .replace(".000Z", " UTC");
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

    function normalizeHead(head) {
        if (!Array.isArray(head)) {
            return [];
        }

        return head.map(item => {
            if (Array.isArray(item)) {
                return {
                    node: item[0],
                    time: item[1],
                    delta: item[2] || 0
                };
            }

            return {
                node: item.node || item.address || item.peer || "unknown",
                time: item.time || item.timestamp || item.t || 0,
                delta: item.delta || item.delay || item.v || 0
            };
        });
    }

    function normalizeOne(row) {
        const stats = row.stats || row.metrics || {};

        return {
            inv_hash: row.inv_hash || row.hash || row.txid || row.block_hash || "unknown",
            type: row.type || row.kind || "inv",
            first_seen: row.first_seen || row.timestamp || row.t || stats.first_seen || 0,
            stats: {
                min: stats.min ?? row.min ?? 0,
                max: stats.max ?? row.max ?? 0,
                mean: stats.mean ?? row.mean ?? 0,
                std: stats.std ?? row.std ?? 0,
                "50%": stats["50%"] ?? stats.p50 ?? row.p50 ?? 0,
                "90%": stats["90%"] ?? stats.p90 ?? row.p90 ?? 0,
                head: normalizeHead(stats.head || row.head || row.samples || [])
            }
        };
    }

    function normalizeFromNodes(nodes) {
        const rows = [];

        for (const [node, row] of Object.entries(nodes || {})) {
            if (Array.isArray(row)) {
                continue;
            }

            const propagation = row?.propagation || row?.inv_propagation || [];

            for (const item of propagation) {
                const normalized = normalizeOne(item);

                normalized.stats.head.unshift({
                    node,
                    time: normalized.first_seen,
                    delta: 0
                });

                rows.push(normalized);
            }
        }

        return rows;
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data.map(normalizeOne);
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        if (Array.isArray(data.results)) {
            return data.results.map(normalizeOne);
        }

        if (Array.isArray(data.propagation)) {
            return data.propagation.map(normalizeOne);
        }

        if (Array.isArray(data.records)) {
            return data.records.map(normalizeOne);
        }

        if (data.inv_hash || data.hash || data.stats) {
            return [normalizeOne(data)];
        }

        if (data.nodes && typeof data.nodes === "object") {
            return normalizeFromNodes(data.nodes);
        }

        return [];
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const heads = rows.reduce((sum, row) => sum + (row.stats?.head?.length || 0), 0);
        const fastest = rows.length
            ? Math.min(...rows.map(row => Number(row.stats?.min || 0)))
            : 0;
        const slowest = rows.length
            ? Math.max(...rows.map(row => Number(row.stats?.max || 0)))
            : 0;

        target.innerHTML = `
            <article class="bn-card"><span>INV Records</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Head Samples</span><strong>${fmt(heads)}</strong></article>
            <article class="bn-card"><span>Fastest Delta</span><strong>${fmt(fastest)} ms</strong></article>
            <article class="bn-card"><span>Slowest Delta</span><strong>${fmt(slowest)} ms</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "timestamp";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            const headText = (row.stats?.head || [])
                .map(item => `${item.node} ${item.time} ${item.delta}`)
                .join(" ");

            return [
                row.inv_hash,
                row.hash,
                row.type,
                headText,
                row.stats?.mean,
                row.stats?.max,
                row.stats?.min
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "node") {
            rows.sort((a, b) => {
                const an = a.stats?.head?.[0]?.node || "";
                const bn = b.stats?.head?.[0]?.node || "";
                return an.localeCompare(bn);
            });
        } else if (sort === "hash") {
            rows.sort((a, b) => String(a.inv_hash || "").localeCompare(String(b.inv_hash || "")));
        } else {
            rows.sort((a, b) => {
                const at = Number(a.first_seen || a.stats?.head?.[0]?.time || 0);
                const bt = Number(b.first_seen || b.stats?.head?.[0]?.time || 0);
                return at - bt;
            });
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No propagation telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-prop-grid">
                ${rows.slice(0, 250).map(row => {
                    const stats = row.stats || {};
                    const head = stats.head || [];

                    return `
                        <article class="bn-prop-card">
                            <div class="bn-prop-hash">
                                ${esc(fmt(row.inv_hash || row.hash))}
                            </div>

                            <div class="bn-prop-stats">
                                <div class="bn-prop-stat"><span>Type</span><strong>${esc(fmt(row.type))}</strong></div>
                                <div class="bn-prop-stat"><span>Min</span><strong>${fmt(stats.min)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Max</span><strong>${fmt(stats.max)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Mean</span><strong>${fmt(stats.mean)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Std</span><strong>${fmt(stats.std)} ms</strong></div>
                                <div class="bn-prop-stat"><span>50%</span><strong>${fmt(stats["50%"])} ms</strong></div>
                                <div class="bn-prop-stat"><span>90%</span><strong>${fmt(stats["90%"])} ms</strong></div>
                            </div>

                            <div class="bn-prop-table-wrap">
                                <table class="bn-prop-table">
                                    <thead>
                                        <tr>
                                            <th>Node</th>
                                            <th>Arrival Time</th>
                                            <th>Delta</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${head.slice(0, 50).map(item => `
                                            <tr>
                                                <td class="bn-prop-node">${esc(fmt(item.node))}</td>
                                                <td>${esc(formatTime(item.time))}</td>
                                                <td>${esc(fmt(item.delta))} ms</td>
                                            </tr>
                                        `).join("")}
                                    </tbody>
                                </table>
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadPropagation() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading propagation telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} propagation records. Showing first 250 matching rows.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Propagation telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadPropagation);
        $("#bn-source")?.addEventListener("change", loadPropagation);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadPropagation();
    });
})();

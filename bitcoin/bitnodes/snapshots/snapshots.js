(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/snapshots.json",
        originalbitnodes: "../api/originalbitnodes/snapshots.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/snapshots.json",
        external: "https://bitnodes.io/api/v1/snapshots/"
    };

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
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

    function formatTime(value) {
        if (!value) {
            return "—";
        }

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

    function nodeCount(payload) {
        if (!payload || typeof payload !== "object") {
            return 0;
        }

        if (payload.total_nodes) {
            return Number(payload.total_nodes);
        }

        if (payload.reachable_nodes && typeof payload.reachable_nodes === "number") {
            return Number(payload.reachable_nodes);
        }

        if (payload.nodes && typeof payload.nodes === "object") {
            return Object.keys(payload.nodes).length;
        }

        if (payload.results && Array.isArray(payload.results)) {
            return payload.results.length;
        }

        return 0;
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        if (Array.isArray(data.results)) {
            return data.results;
        }

        if (Array.isArray(data.snapshots)) {
            return data.snapshots;
        }

        if (Array.isArray(data.archive)) {
            return data.archive;
        }

        if (data.timestamp || data.updated_at || data.created_at || data.nodes) {
            return [
                {
                    timestamp: data.timestamp || data.updated_at || data.created_at || Date.now(),
                    latest_height: data.latest_height || data.height || data.block_height,
                    total_nodes: nodeCount(data),
                    url: data.url || "../api/latest.json",
                    source: data.source || "snapshot"
                }
            ];
        }

        return [];
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const newest = rows[0] || {};
        const totalNodes = newest.total_nodes || newest.reachable_nodes || newest.nodes || 0;
        const latestHeight = newest.latest_height || newest.height || newest.block_height || 0;

        target.innerHTML = `
            <article class="bn-card">
                <span>Total Snapshots</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Newest</span>
                <strong>${esc(formatTime(newest.timestamp || newest.updated_at || newest.created_at))}</strong>
            </article>

            <article class="bn-card">
                <span>Latest Height</span>
                <strong>${fmt(latestHeight)}</strong>
            </article>

            <article class="bn-card">
                <span>Latest Nodes</span>
                <strong>${fmt(totalNodes)}</strong>
            </article>
        `;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `
                <p class="bn-muted">
                    No snapshots found. Add or regenerate
                    <code>../api/snapshots.json</code>.
                </p>
            `;
            return;
        }

        const sorted = [...rows].sort((a, b) => {
            const at = Number(a.timestamp || a.updated_at || a.created_at || 0);
            const bt = Number(b.timestamp || b.updated_at || b.created_at || 0);

            return bt - at;
        });

        view.innerHTML = sorted.slice(0, 250).map(row => {
            const timestamp = row.timestamp || row.updated_at || row.created_at;
            const height = row.latest_height || row.height || row.block_height;
            const nodes = row.total_nodes || row.reachable_nodes || row.nodes || 0;
            const source = row.source || row.crawler || "snapshot";
            const url = row.url || row.path || "";

            return `
                <div class="bn-snapshot-row">
                    <strong>${esc(formatTime(timestamp))}</strong>
                    <span>Height: ${esc(fmt(height))}</span>
                    <span>Nodes: ${esc(fmt(nodes))}</span>
                    <span>Source: ${esc(fmt(source))}</span>
                    <span>
                        ${
                            url
                                ? `<a href="${esc(url)}" target="_blank" rel="noopener">JSON</a>`
                                : "Local snapshot"
                        }
                    </span>
                </div>
            `;
        }).join("");
    }

    async function loadSnapshots() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading ${source} snapshot archive...`);

        try {
            const data = await getJson(url);
            const rows = normalize(data);

            renderSummary(rows);
            renderRows(rows);

            setStatus(`Loaded ${fmt(rows.length)} snapshots.`, "ok");
        } catch (err) {
            renderSummary([]);
            renderRows([]);

            setStatus(`Snapshot archive unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadSnapshots);
        $("#bn-source")?.addEventListener("change", loadSnapshots);

        loadSnapshots();
    });
})();

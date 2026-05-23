(() => {
    "use strict";

    const SOURCES = {
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

    function formatTime(value) {
        if (!value) {
            return "—";
        }

        const numeric = Number(value);
        const ms = numeric < 10000000000 ? numeric * 1000 : numeric;

        return new Date(ms)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC");
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
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (Array.isArray(data.results)) {
            return data.results;
        }

        if (Array.isArray(data.snapshots)) {
            return data.snapshots;
        }

        return [];
    }

    function renderSummary(rows) {
        const newest = rows[0] || {};

        const totalNodes =
            newest.total_nodes ||
            newest.reachable_nodes ||
            0;

        const latestHeight =
            newest.latest_height ||
            newest.height ||
            0;

        $("#bn-summary").innerHTML = `
            <article class="bn-card">
                <span>Total Snapshots</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Newest</span>
                <strong>${formatTime(newest.timestamp || newest.updated_at)}</strong>
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
                <p>
                    No snapshots found. Add
                    <code>../api/snapshots.json</code>.
                </p>
            `;
            return;
        }

        view.innerHTML = rows.slice(0, 100).map(row => {
            const timestamp =
                row.timestamp ||
                row.updated_at ||
                row.created_at;

            const height =
                row.latest_height ||
                row.height;

            const nodes =
                row.total_nodes ||
                row.reachable_nodes;

            return `
                <div class="bn-snapshot-row">
                    <strong>${formatTime(timestamp)}</strong>
                    <span>Height: ${fmt(height)}</span>
                    <span>Nodes: ${fmt(nodes)}</span>
                    <span>
                        ${
                            row.url
                                ? `<a href="${row.url}">JSON</a>`
                                : "Local snapshot"
                        }
                    </span>
                </div>
            `;
        }).join("");
    }

    async function loadSnapshots() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading ${source} snapshot archive…`);

        try {
            const data = await getJson(url);
            const rows = normalize(data);

            renderSummary(rows);
            renderRows(rows);

            setStatus(
                `Loaded ${fmt(rows.length)} snapshots.`,
                "ok"
            );
        } catch (err) {
            renderSummary([]);
            renderRows([]);

            setStatus(
                `Snapshot archive unavailable: ${err.message}`,
                "warn"
            );
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadSnapshots);
        $("#bn-source")?.addEventListener("change", loadSnapshots);

        loadSnapshots();
    });
})();

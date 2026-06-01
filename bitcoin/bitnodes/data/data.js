(() => {
    "use strict";

    const ROWS = [
        {
            name: "ZZX Crawler State",
            category: "state",
            path: "./state/zzxbitnodes/",
            description: "State files for the ZZX Bitnodes crawler."
        },
        {
            name: "Original Crawler State",
            category: "state",
            path: "./state/originalbitnodes/",
            description: "State files for the Original Bitnodes-compatible crawler."
        },
        {
            name: "24H ZZX Snapshots",
            category: "snapshots",
            path: "./snapshots/24h/zzxbitnodes/",
            description: "Rolling 24-hour snapshot storage for ZZX crawler output."
        },
        {
            name: "24H Original Snapshots",
            category: "snapshots",
            path: "./snapshots/24h/originalbitnodes/",
            description: "Rolling 24-hour snapshot storage for Original-compatible crawler output."
        },
        {
            name: "ZZX DNS Seeders",
            category: "seeders",
            path: "./seeders/zzxbitnodes/",
            description: "DNS seeder data collected by the ZZX crawler."
        },
        {
            name: "Original DNS Seeders",
            category: "seeders",
            path: "./seeders/originalbitnodes/",
            description: "DNS seeder data collected by the Original-compatible crawler."
        },
        {
            name: "GeoIP Databases",
            category: "geoip",
            path: "./geoip/",
            description: "Runtime GeoIP databases used during enrichment. Binary databases should not be committed publicly."
        },
        {
            name: "Map Settings",
            category: "maps",
            path: "./mapsettings/",
            description: "Map configuration, viewport, tile-provider, and display settings."
        },
        {
            name: "Map Themes",
            category: "maps",
            path: "./mapthemes/",
            description: "JSON map theme definitions for map and live-map pages."
        },
        {
            name: "Root API Latest",
            category: "api",
            path: "../api/latest.json",
            description: "Root compatibility latest Bitnodes API snapshot."
        },
        {
            name: "ZZX API Latest",
            category: "api",
            path: "../api/zzxbitnodes/latest.json",
            description: "Latest source-scoped ZZX Bitnodes API output."
        },
        {
            name: "Original API Latest",
            category: "api",
            path: "../api/originalbitnodes/latest.json",
            description: "Latest source-scoped Original Bitnodes-compatible API output."
        },
        {
            name: "ZZX Aggregate",
            category: "api",
            path: "../api/aggregate/zzxbitnodes/latest.json",
            description: "Aggregate ZZX crawler analytics output."
        },
        {
            name: "Original Aggregate",
            category: "api",
            path: "../api/aggregate/originalbitnodes/latest.json",
            description: "Aggregate Original-compatible crawler analytics output."
        },
        {
            name: "ZZX Enriched",
            category: "api",
            path: "../api/enriched/zzxbitnodes/latest.json",
            description: "Enriched ZZX node registry output."
        },
        {
            name: "Original Enriched",
            category: "api",
            path: "../api/enriched/originalbitnodes/latest.json",
            description: "Enriched Original-compatible node registry output."
        }
    ];

    let CURRENT_ROWS = [...ROWS];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
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

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const categories = new Set(rows.map(row => row.category));

        target.innerHTML = `
            <article class="bn-card">
                <span>Data Entries</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Categories</span>
                <strong>${fmt(categories.size)}</strong>
            </article>

            <article class="bn-card">
                <span>Crawler State</span>
                <strong>Indexed</strong>
            </article>

            <article class="bn-card">
                <span>Search</span>
                <strong>Enabled</strong>
            </article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const scope = $("#bn-source")?.value || "all";
        const sort = $("#bn-sort")?.value || "name";

        let rows = ROWS.filter(row => {
            if (scope !== "all" && row.category !== scope) {
                return false;
            }

            if (!search) {
                return true;
            }

            return [
                row.name,
                row.category,
                row.path,
                row.description
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "category") {
            rows.sort((a, b) => a.category.localeCompare(b.category));
        } else if (sort === "path") {
            rows.sort((a, b) => a.path.localeCompare(b.path));
        } else {
            rows.sort((a, b) => a.name.localeCompare(b.name));
        }

        CURRENT_ROWS = rows;

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No data entries matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-data-grid">
                ${rows.map(row => `
                    <article class="bn-data-card">
                        <div class="bn-data-top">
                            <div>
                                <div class="bn-data-name">${esc(row.name)}</div>
                                <div class="bn-data-category">${esc(row.category)}</div>
                            </div>
                        </div>

                        <div class="bn-data-description">
                            ${esc(row.description)}
                        </div>

                        <div class="bn-data-path">
                            <code>${esc(row.path)}</code>
                        </div>

                        <div class="bn-data-links">
                            <a href="${esc(row.path)}" target="_blank" rel="noopener">Open</a>
                            <a href="#" class="bn-preview-link" data-path="${esc(row.path)}">Preview</a>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        const rows = filteredRows();

        renderSummary(rows);
        renderRows(rows);

        setStatus(`Loaded ${fmt(rows.length)} data index entries.`, "ok");
    }

    async function preview(path) {
        const target = $("#bn-data-preview");

        if (!target) {
            return;
        }

        target.textContent = "Loading...";

        try {
            const response = await fetch(`${path}?t=${Date.now()}`, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("application/json") || path.endsWith(".json")) {
                const data = await response.json();

                target.innerHTML = `
                    <pre>${esc(JSON.stringify(data, null, 2).slice(0, 15000))}</pre>
                `;
            } else {
                target.textContent = "Preview is available only for JSON files. Use Open for directories or binary data.";
            }

        } catch (err) {
            target.textContent = `Preview failed: ${err.message}`;
        }
    }

    function bind() {
        $("#bn-refresh")?.addEventListener("click", rerender);
        $("#bn-source")?.addEventListener("change", rerender);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        document.addEventListener("click", event => {
            const button = event.target.closest(".bn-preview-link");

            if (!button) {
                return;
            }

            event.preventDefault();

            preview(button.dataset.path);
        });
    }

    function init() {
        renderSummary(CURRENT_ROWS);
        renderRows(CURRENT_ROWS);
        bind();

        setStatus(`Loaded ${fmt(CURRENT_ROWS.length)} data index entries.`, "ok");
    }

    document.addEventListener("DOMContentLoaded", init);
})();

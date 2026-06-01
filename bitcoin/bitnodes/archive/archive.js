(() => {
    "use strict";

    const ARCHIVE_ROWS = [

        {
            name: "Latest Snapshot",
            category: "Snapshot",
            path: "../api/latest.json",
            description: "Latest Bitnodes network snapshot.",
            docs: "../snapshots/"
        },

        {
            name: "Historical Snapshots",
            category: "Snapshot",
            path: "../api/snapshots.json",
            description: "Historical snapshot index.",
            docs: "../snapshots/"
        },

        {
            name: "ZZX Archive",
            category: "Archive",
            path: "../archive/zzxbitnodes/",
            description: "ZZX crawler historical archive.",
            docs: "../archive/"
        },

        {
            name: "Original Archive",
            category: "Archive",
            path: "../archive/originalbitnodes/",
            description: "Original Bitnodes historical archive.",
            docs: "../archive/"
        },

        {
            name: "Registry Backups",
            category: "Backup",
            path: "../registry/",
            description: "Chunked registry backup archives.",
            docs: "../archive/"
        },

        {
            name: "Countries History",
            category: "Geo",
            path: "../api/countries.json",
            description: "Country-level historical telemetry.",
            docs: "../countries/"
        },

        {
            name: "Cities History",
            category: "Geo",
            path: "../api/cities.json",
            description: "City-level historical telemetry.",
            docs: "../cities/"
        },

        {
            name: "ASN History",
            category: "Geo",
            path: "../api/asns.json",
            description: "Historical ASN observations.",
            docs: "../asns/"
        },

        {
            name: "Peer Health History",
            category: "Health",
            path: "../api/peer-health.json",
            description: "Historical peer-health telemetry.",
            docs: "../peer-health/"
        },

        {
            name: "Latency History",
            category: "Health",
            path: "../api/latency.json",
            description: "Historical latency telemetry.",
            docs: "../latency/"
        },

        {
            name: "Propagation History",
            category: "Health",
            path: "../api/propagation.json",
            description: "Historical propagation telemetry.",
            docs: "../propagation/"
        },

        {
            name: "Leaderboard History",
            category: "Health",
            path: "../api/leaderboard.json",
            description: "Historical node rankings.",
            docs: "../rankings/"
        }

    ];

    let CURRENT_ROWS = [...ARCHIVE_ROWS];

    function $(selector) {
        return document.querySelector(selector);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setStatus(text) {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.textContent = text;
    }

    function renderSummary() {

        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        target.innerHTML = `
            <article class="bn-card">
                <span>Archive Sources</span>
                <strong>3</strong>
            </article>

            <article class="bn-card">
                <span>Archive Datasets</span>
                <strong>${CURRENT_ROWS.length}</strong>
            </article>

            <article class="bn-card">
                <span>Snapshot APIs</span>
                <strong>2</strong>
            </article>

            <article class="bn-card">
                <span>Registry Backups</span>
                <strong>Active</strong>
            </article>
        `;
    }

    function renderFamilies() {

        const target =
            $("#bn-archive-families");

        if (!target) {
            return;
        }

        const families = [
            {
                name: "Snapshots",
                count: 2,
                description:
                    "Historical network snapshots and exported crawler states."
            },

            {
                name: "Archives",
                count: 2,
                description:
                    "ZZX and Original Bitnodes historical archive collections."
            },

            {
                name: "Telemetry",
                count: 7,
                description:
                    "Peer-health, latency, rankings, ASN, geography and network analytics."
            }
        ];

        target.innerHTML =
            families.map(item => `
                <article class="bn-archive-family-card">

                    <h3>${item.name}</h3>

                    <div class="bn-archive-family-stat">
                        ${item.count}
                    </div>

                    <p>
                        ${item.description}
                    </p>

                </article>
            `).join("");
    }

    function renderRegistryBackups() {

        const target =
            $("#bn-registry-backups");

        if (!target) {
            return;
        }

        target.innerHTML = `
            <div class="bn-archive-grid">

                <article class="bn-archive-card">

                    <div class="bn-archive-top">

                        <div>

                            <div class="bn-archive-name">
                                Chunked Registry Backup System
                            </div>

                            <div class="bn-archive-category">
                                Registry
                            </div>

                        </div>

                    </div>

                    <div class="bn-archive-description">
                        Registry backups are automatically generated from
                        crawler exports and preserved as compressed archives
                        suitable for long-term storage and recovery.
                    </div>

                </article>

            </div>
        `;
    }

    function renderRows(rows) {

        const target =
            $("#bn-view");

        if (!target) {
            return;
        }

        target.innerHTML = `
            <div class="bn-archive-grid">

                ${rows.map(row => `

                    <article class="bn-archive-card">

                        <div class="bn-archive-top">

                            <div>

                                <div class="bn-archive-name">
                                    ${escapeHtml(row.name)}
                                </div>

                                <div class="bn-archive-category">
                                    ${escapeHtml(row.category)}
                                </div>

                            </div>

                        </div>

                        <div class="bn-archive-description">
                            ${escapeHtml(row.description)}
                        </div>

                        <div class="bn-archive-path">
                            <code>${escapeHtml(row.path)}</code>
                        </div>

                        <div class="bn-archive-links">

                            <a
                                href="${row.path}"
                                target="_blank"
                                rel="noopener"
                            >
                                Open
                            </a>

                            <a
                                href="${row.docs}"
                            >
                                Documentation
                            </a>

                            <a
                                href="#"
                                class="bn-preview-link"
                                data-path="${row.path}"
                            >
                                Preview
                            </a>

                        </div>

                    </article>

                `).join("")}

            </div>
        `;
    }

    function applyFilters() {

        const search =
            ($("#bn-search")?.value || "")
            .trim()
            .toLowerCase();

        const sort =
            $("#bn-sort")?.value || "name";

        let rows =
            ARCHIVE_ROWS.filter(row => {

                if (!search) {
                    return true;
                }

                return (
                    row.name.toLowerCase().includes(search) ||
                    row.category.toLowerCase().includes(search) ||
                    row.description.toLowerCase().includes(search)
                );
            });

        rows.sort((a, b) => {

            if (sort === "category") {
                return a.category.localeCompare(b.category);
            }

            return a.name.localeCompare(b.name);
        });

        CURRENT_ROWS = rows;

        renderRows(rows);
    }

    async function previewArchive(path) {

        const preview =
            $("#bn-archive-preview");

        if (!preview) {
            return;
        }

        preview.textContent =
            "Loading...";

        try {

            const response =
                await fetch(path);

            const data =
                await response.json();

            preview.innerHTML = `
                <pre>${escapeHtml(
                    JSON.stringify(
                        data,
                        null,
                        2
                    ).slice(0, 15000)
                )}</pre>
            `;

        } catch (err) {

            preview.textContent =
                `Preview failed: ${err.message}`;
        }
    }

    function bindEvents() {

        $("#bn-search")
            ?.addEventListener(
                "input",
                applyFilters
            );

        $("#bn-sort")
            ?.addEventListener(
                "change",
                applyFilters
            );

        $("#bn-refresh")
            ?.addEventListener(
                "click",
                () => {
                    applyFilters();
                    setStatus(
                        "Archive refreshed."
                    );
                }
            );

        document.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        ".bn-preview-link"
                    );

                if (!button) {
                    return;
                }

                event.preventDefault();

                previewArchive(
                    button.dataset.path
                );
            }
        );
    }

    function updateStats() {

        $("#bn-stat-snapshots").textContent =
            "Active";

        $("#bn-stat-backups").textContent =
            "Enabled";

        $("#bn-stat-size").textContent =
            "Growing";

        $("#bn-stat-oldest").textContent =
            "Archive";
    }

    function init() {

        renderSummary();

        renderFamilies();

        renderRegistryBackups();

        renderRows(
            ARCHIVE_ROWS
        );

        updateStats();

        bindEvents();

        setStatus(
            "Archive telemetry loaded."
        );
    }

    document.addEventListener(
        "DOMContentLoaded",
        init
    );

})();

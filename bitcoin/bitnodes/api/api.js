(() => {
    "use strict";

    const ROWS = [
        {
            name: "Snapshots",
            category: "Archive",
            path: "../api/snapshots.json",
            description: "Historical reachable-node snapshot archive exported from the ZZX-Labs crawler infrastructure.",
            docs: "../snapshots/"
        },

        {
            name: "Nodes",
            category: "Network",
            path: "../api/nodes.json",
            description: "Latest reachable-node export including geolocation, ASN, services, protocol versions, and user-agent telemetry.",
            docs: "../nodes/"
        },

        {
            name: "Leaderboard",
            category: "Peer Index",
            path: "../api/leaderboard.json",
            description: "Peer Index ranking and reachable-node quality telemetry compatible with Bitnodes leaderboard formatting.",
            docs: "../rankings/"
        },

        {
            name: "Latency",
            category: "Network",
            path: "../api/latency/{address}-{port}.json",
            description: "Historical node latency telemetry with daily, weekly, and monthly timeseries exports.",
            docs: "../latency/"
        },

        {
            name: "Propagation",
            category: "Propagation",
            path: "../api/propagation/{inv_hash}.json",
            description: "Transaction and block propagation telemetry including arrival deltas and distribution analysis.",
            docs: "../propagation/"
        },

        {
            name: "DNS Seeder",
            category: "Seeder",
            path: "../api/dns-seeder.json",
            description: "Reachable-node DNS seeder exports for IPv4, IPv6, and Tor/onion reachable nodes.",
            docs: "../dns-seeder/"
        },

        {
            name: "ASN Health",
            category: "ASN",
            path: "../api/asns.json",
            description: "Autonomous System network telemetry and Bitcoin node concentration analytics.",
            docs: "../asns/"
        },

        {
            name: "Countries",
            category: "Geographic",
            path: "../api/countries.json",
            description: "Bitcoin reachable-node telemetry aggregated by nation-state and geopolitical region.",
            docs: "../countries/"
        },

        {
            name: "Cities",
            category: "Geographic",
            path: "../api/cities.json",
            description: "Bitcoin reachable-node telemetry aggregated by metropolitan region and city.",
            docs: "../cities/"
        },

        {
            name: "Agents",
            category: "Client",
            path: "../api/agents.json",
            description: "Bitcoin client implementation telemetry and user-agent distribution exports.",
            docs: "../agents/"
        },

        {
            name: "Versions",
            category: "Protocol",
            path: "../api/versions.json",
            description: "Protocol-version distribution and Bitcoin implementation compatibility telemetry.",
            docs: "../versions/"
        },

        {
            name: "Ports",
            category: "Network",
            path: "../api/ports.json",
            description: "Open reachable-port telemetry and Bitcoin service-port analytics.",
            docs: "../ports/"
        },

        {
            name: "Tor Nodes",
            category: "Privacy",
            path: "../api/tor.json",
            description: "Reachable onion/Tor Bitcoin node telemetry and hidden-service network distribution.",
            docs: "../tor/"
        },

        {
            name: "Peer Health",
            category: "Health",
            path: "../api/peer-health.json",
            description: "Reachable-node quality scoring, uptime analytics, latency scoring, and health telemetry.",
            docs: "../peer-health/"
        }
    ];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
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

    function renderSummary(rows) {
        const categories =
            new Set(rows.map(row => row.category));

        $("#bn-summary").innerHTML = `
            <article class="bn-card">
                <span>Endpoints</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Categories</span>
                <strong>${fmt(categories.size)}</strong>
            </article>

            <article class="bn-card">
                <span>Static JSON</span>
                <strong>Enabled</strong>
            </article>

            <article class="bn-card">
                <span>Authentication</span>
                <strong>Public</strong>
            </article>
        `;
    }

    function filteredRows() {
        const search =
            ($("#bn-search")?.value || "")
                .trim()
                .toLowerCase();

        const sort =
            $("#bn-sort")?.value || "name";

        let rows = ROWS.filter(row => {

            if (!search) {
                return true;
            }

            return [
                row.name,
                row.category,
                row.description,
                row.path
            ]
            .join(" ")
            .toLowerCase()
            .includes(search);
        });

        if (sort === "path") {
            rows.sort((a, b) => a.path.localeCompare(b.path));
        }

        else if (sort === "category") {
            rows.sort((a, b) => a.category.localeCompare(b.category));
        }

        else {
            rows.sort((a, b) => a.name.localeCompare(b.name));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {

            view.innerHTML = `
                <div class="bn-empty">
                    No API endpoints matched current filters.
                </div>
            `;

            return;
        }

        view.innerHTML = `
            <div class="bn-api-grid">

                ${rows.map(row => `

                    <article class="bn-api-card">

                        <div class="bn-api-top">

                            <div>
                                <div class="bn-api-name">
                                    ${fmt(row.name)}
                                </div>

                                <div class="bn-api-category">
                                    ${fmt(row.category)}
                                </div>
                            </div>

                        </div>

                        <div class="bn-api-description">
                            ${fmt(row.description)}
                        </div>

                        <div class="bn-api-path">
                            <code>${fmt(row.path)}</code>
                        </div>

                        <div class="bn-api-links">
                            <a href="${row.path}">
                                JSON Endpoint
                            </a>

                            <a href="${row.docs}">
                                Documentation
                            </a>
                        </div>

                    </article>

                `).join("")}

            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    function init() {
        renderSummary(ROWS);
        renderRows(ROWS);

        setStatus(
            `Loaded ${fmt(ROWS.length)} Bitnodes API endpoints.`,
            "ok"
        );

        $("#bn-search")
            ?.addEventListener("input", rerender);

        $("#bn-sort")
            ?.addEventListener("change", rerender);
    }

    document.addEventListener(
        "DOMContentLoaded",
        init
    );
})();

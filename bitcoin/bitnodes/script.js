(() => {
    "use strict";

    const BN = {
        endpoints: {
            local: {
                latest: "./api/latest.json",
                snapshots: "./api/snapshots.json",
                nodes: "./api/nodes.json",
                leaderboard: "./api/leaderboard.json"
            },
            legacy: {
                latest: "./api/latest.json",
                snapshots: "./api/snapshots.json",
                nodes: "./api/nodes.json",
                leaderboard: "./api/leaderboard.json"
            },
            external: {
                latest: "https://bitnodes.io/api/v1/snapshots/latest/",
                snapshots: "https://bitnodes.io/api/v1/snapshots/",
                nodes: "https://bitnodes.io/api/v1/snapshots/latest/",
                leaderboard: "https://bitnodes.io/api/v1/nodes/leaderboard/"
            }
        },

        apiRows: [
            ["List snapshots", "./api/snapshots.json"],
            ["List nodes", "./api/nodes.json"],
            ["Node status", "./api/nodes/{address}-{port}.json"],
            ["Node latency", "./api/latency/{address}-{port}.json"],
            ["Node Bitcoin address", "read-only mirror; no public POST endpoint"],
            ["Leaderboard", "./api/leaderboard.json"],
            ["Node ranking", "./api/leaderboard/{address}-{port}.json"],
            ["Data propagation", "./api/propagation/{inv_hash}.json"],
            ["DNS seeder", "./api/dns-seeder.json"]
        ]
    };

    const $ = selector => document.querySelector(selector);

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    async function injectHtml(selector, path) {
        const mount = $(selector);

        if (!mount) {
            return;
        }

        try {
            const res = await fetch(path, {
                cache: "no-store"
            });

            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`);
            }

            mount.innerHTML = await res.text();
        } catch (err) {
            console.warn(`Bitnodes include failed: ${path}`, err);
        }
    }

    async function loadIncludes() {
        const depth = getDepth();

        await injectHtml("#bn-header", `${depth}/includes/header.html`);
        await injectHtml("#bn-navbar", `${depth}/includes/navbar.html`);
        await injectHtml("#bn-footer", `${depth}/includes/footer.html`);

        markActiveNav();
    }

    function markActiveNav() {
        const path = location.pathname.replace(/\/index\.html$/, "/");

        document.querySelectorAll("#bn-navbar a").forEach(link => {
            const href = new URL(link.href).pathname.replace(/\/index\.html$/, "/");

            if (href === path) {
                link.classList.add("is-active");
            }
        });
    }

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
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

    async function fetchJson(url) {
        const res = await fetch(url, {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}: ${url}`);
        }

        return await res.json();
    }

    function normalizeLatest(data) {
        const nodesObject =
            data.nodes && typeof data.nodes === "object"
                ? data.nodes
                : null;

        const nodesCount =
            nodesObject
                ? Object.keys(nodesObject).length
                : null;

        return {
            source: data.source || "bitnodes-compatible",
            updated_at: data.updated_at || data.timestamp || data.created_at || null,
            total_nodes: data.total_nodes || data.reachable_nodes || nodesCount || 0,
            latest_height: data.latest_height || data.height || 0,
            tor_nodes: data.tor_nodes || data.onion_nodes || 0,
            countries_count: data.countries_count || data.country_count || 0,
            cities_count: data.cities_count || data.city_count || 0,
            asns_count: data.asns_count || data.asn_count || 0,
            top_agent: data.top_agent || data.user_agent || "—",
            top_port: data.top_port || 8333,
            nodes: nodesObject
        };
    }

    function renderSummary(latest) {
        const el = $("#bn-summary");

        if (!el) {
            return;
        }

        const cards = [
            ["Reachable Nodes", latest.total_nodes],
            ["Latest Height", latest.latest_height],
            ["Tor Nodes", latest.tor_nodes],
            ["Countries", latest.countries_count],
            ["Cities", latest.cities_count],
            ["ASNs", latest.asns_count],
            ["Top Port", latest.top_port],
            ["Top Agent", latest.top_agent]
        ];

        el.innerHTML = cards.map(([label, value]) => `
            <article class="bn-card">
                <span>${label}</span>
                <strong>${fmt(value)}</strong>
            </article>
        `).join("");
    }

    function renderApiRows() {
        const el = $("#bn-api-list");

        if (!el) {
            return;
        }

        el.innerHTML = BN.apiRows.map(([name, endpoint]) => `
            <div class="bn-api-row">
                <strong>${name}</strong>
                <code>${endpoint}</code>
            </div>
        `).join("");
    }

    function nodeArrayToObject(address, arr) {
        return {
            node: address,
            protocol: arr?.[0],
            user_agent: arr?.[1],
            connected_since: arr?.[2],
            services: arr?.[3],
            height: arr?.[4],
            hostname: arr?.[5],
            city: arr?.[6],
            country: arr?.[7],
            lat: arr?.[8],
            lon: arr?.[9],
            timezone: arr?.[10],
            asn: arr?.[11],
            org: arr?.[12]
        };
    }

    function renderNodePreview(latest) {
        const el = $("#bn-table");

        if (!el) {
            return;
        }

        const rows = latest.nodes
            ? Object.entries(latest.nodes)
                .slice(0, 25)
                .map(([address, data]) => nodeArrayToObject(address, data))
            : [];

        if (!rows.length) {
            el.innerHTML = `
                <p>
                    No node preview found. Add
                    <code>./api/latest.json</code>
                    or
                    <code>./api/nodes.json</code>.
                </p>
            `;
            return;
        }

        el.innerHTML = `
            <div class="bn-table-wrap">
                <table class="bn-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Agent</th>
                            <th>Height</th>
                            <th>Country</th>
                            <th>City</th>
                            <th>ASN</th>
                            <th>Organization</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td><span class="bn-pill">${fmt(row.node)}</span></td>
                                <td>${fmt(row.user_agent)}</td>
                                <td>${fmt(row.height)}</td>
                                <td>${fmt(row.country)}</td>
                                <td>${fmt(row.city)}</td>
                                <td>${fmt(row.asn)}</td>
                                <td>${fmt(row.org)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadBitnodesHome() {
        const main = $("main[data-bitnodes-view]");

        if (!main || main.dataset.bitnodesView !== "home") {
            return;
        }

        const sourceSelect = $("#bn-source");
        const source = sourceSelect?.value || "local";
        const url = BN.endpoints[source]?.latest || BN.endpoints.local.latest;

        setStatus(`Loading ${source} Bitnodes mirror source…`);

        try {
            const data = await fetchJson(url);
            const latest = normalizeLatest(data);

            renderSummary(latest);
            renderApiRows();
            renderNodePreview(latest);

            setStatus(
                `Loaded ${fmt(latest.total_nodes)} reachable nodes from ${latest.source}. Updated: ${fmt(latest.updated_at)}.`,
                "ok"
            );
        } catch (err) {
            renderApiRows();
            renderSummary(normalizeLatest({}));
            renderNodePreview(normalizeLatest({}));

            setStatus(
                `Could not load Bitnodes JSON yet: ${err.message}`,
                "warn"
            );
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        await loadIncludes();

        $("#bn-refresh")?.addEventListener("click", loadBitnodesHome);
        $("#bn-source")?.addEventListener("change", loadBitnodesHome);

        loadBitnodesHome();
    });
})();

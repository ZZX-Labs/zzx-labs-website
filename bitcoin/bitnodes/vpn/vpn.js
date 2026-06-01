(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/enriched/zzxbitnodes/latest.json",
        originalbitnodes: "../api/enriched/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    const VPN_KEYWORDS = [
        "mullvad",
        "proton",
        "nord",
        "surfshark",
        "expressvpn",
        "private internet access",
        "pia",
        "ivpn",
        "windscribe",
        "purevpn",
        "cyberghost",
        "vpn",
        "proxy",
        "hosting",
        "cloud",
        "datacenter",
        "vps",
        "server",
        "colo",
        "colocation",
        "ovh",
        "hetzner",
        "digitalocean",
        "linode",
        "akamai",
        "vultr",
        "contabo",
        "amazon",
        "aws",
        "google",
        "gcp",
        "azure"
    ];

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

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(
            `${url}?t=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText}`
            );
        }

        return response.json();
    }

    function extractNodes(data) {

        if (!data) {
            return {};
        }

        if (data.nodes) {
            return data.nodes;
        }

        if (data.reachable_nodes) {
            return data.reachable_nodes;
        }

        if (data.data?.nodes) {
            return data.data.nodes;
        }

        return {};
    }

    function vpnMatch(text) {

        const value = String(text || "")
            .toLowerCase();

        return VPN_KEYWORDS.find(
            keyword => value.includes(keyword)
        );
    }

    function aggregate(nodes) {

        const providers = new Map();

        let totalMatches = 0;

        for (const node of Object.values(nodes || {})) {

            let provider =
                node.provider ||
                node.organization ||
                node.org ||
                node.asn_org ||
                node.owner ||
                "Unknown";

            const providerText = String(provider);

            const matchedKeyword =
                vpnMatch(providerText);

            if (!matchedKeyword) {
                continue;
            }

            totalMatches += 1;

            const key = providerText;

            if (!providers.has(key)) {

                providers.set(key, {
                    provider: key,
                    nodes: 0,
                    countries: new Set(),
                    asns: new Set(),
                    agents: new Set(),
                    confidence: 0
                });
            }

            const item = providers.get(key);

            item.nodes += 1;

            item.confidence += 10;

            if (node.country) {
                item.countries.add(node.country);
            }

            if (node.asn) {
                item.asns.add(node.asn);
            }

            if (node.agent) {
                item.agents.add(node.agent);
            }
        }

        return {
            totalMatches,
            rows: [...providers.values()]
                .map(item => ({
                    provider: item.provider,
                    nodes: item.nodes,
                    countries: item.countries.size,
                    asns: item.asns.size,
                    dominantAgent:
                        [...item.agents][0] || "—",
                    confidence:
                        Math.min(
                            100,
                            Math.max(
                                10,
                                item.confidence
                            )
                        ),
                    countryList:
                        [...item.countries]
                            .slice(0, 12)
                }))
        };
    }

    function renderSummary(rows) {

        const totalNodes =
            rows.reduce(
                (sum, row) =>
                    sum + row.nodes,
                0
            );

        $("#bn-summary").innerHTML = `
            <article class="bn-card">
                <span>VPN Providers</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Flagged Nodes</span>
                <strong>${fmt(totalNodes)}</strong>
            </article>

            <article class="bn-card">
                <span>Largest Provider</span>
                <strong>${esc(
                    rows[0]?.provider || "—"
                )}</strong>
            </article>

            <article class="bn-card">
                <span>Countries</span>
                <strong>${fmt(
                    rows.reduce(
                        (max, row) =>
                            Math.max(
                                max,
                                row.countries
                            ),
                        0
                    )
                )}</strong>
            </article>
        `;
    }

    function renderRows(rows) {

        const view = $("#bn-view");

        if (!rows.length) {

            view.innerHTML = `
                <div class="bn-vpn-empty">
                    No VPN / proxy indicators found.
                </div>
            `;

            return;
        }

        view.innerHTML = `
            <div class="bn-vpn-grid">
                ${rows.map(row => `
                    <article class="bn-vpn-card">

                        <div class="bn-vpn-header">

                            <div>
                                <div class="bn-vpn-provider">
                                    ${esc(row.provider)}
                                </div>

                                <div class="bn-vpn-label">
                                    Privacy Network Candidate
                                </div>
                            </div>

                            <div>
                                <div class="bn-vpn-count">
                                    ${fmt(row.nodes)}
                                </div>

                                <div class="bn-vpn-share">
                                    Reachable Nodes
                                </div>
                            </div>

                        </div>

                        <div class="bn-vpn-stats">

                            <div class="bn-vpn-stat">
                                <span>Countries</span>
                                <strong>
                                    ${fmt(row.countries)}
                                </strong>
                            </div>

                            <div class="bn-vpn-stat">
                                <span>ASNs</span>
                                <strong>
                                    ${fmt(row.asns)}
                                </strong>
                            </div>

                            <div class="bn-vpn-stat">
                                <span>Dominant Agent</span>
                                <strong>
                                    ${esc(row.dominantAgent)}
                                </strong>
                            </div>

                            <div class="bn-vpn-stat">
                                <span>Confidence</span>
                                <strong>
                                    ${fmt(row.confidence)}%
                                </strong>
                            </div>

                        </div>

                        <div class="bn-vpn-confidence">

                            <div class="bn-vpn-confidence-label">
                                <span>Detection Confidence</span>
                                <span>${fmt(row.confidence)}%</span>
                            </div>

                            <div class="bn-vpn-confidence-bar">
                                <div
                                    class="bn-vpn-confidence-fill"
                                    style="width:${row.confidence}%">
                                </div>
                            </div>

                        </div>

                        <div class="bn-vpn-country-list">
                            ${row.countryList.map(country => `
                                <span class="bn-vpn-country">
                                    ${esc(country)}
                                </span>
                            `).join("")}
                        </div>

                    </article>
                `).join("")}
            </div>
        `;
    }

    function filteredRows() {

        const search =
            ($("#bn-search")?.value || "")
                .trim()
                .toLowerCase();

        const sort =
            $("#bn-sort")?.value || "nodes";

        let rows = [...ROWS];

        if (search) {

            rows = rows.filter(row =>
                JSON.stringify(row)
                    .toLowerCase()
                    .includes(search)
            );
        }

        if (sort === "provider") {

            rows.sort((a, b) =>
                a.provider.localeCompare(
                    b.provider
                )
            );

        } else if (sort === "countries") {

            rows.sort((a, b) =>
                b.countries - a.countries
            );

        } else if (sort === "asns") {

            rows.sort((a, b) =>
                b.asns - a.asns
            );

        } else {

            rows.sort((a, b) =>
                b.nodes - a.nodes
            );
        }

        return rows;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadVPN() {

        const source =
            $("#bn-source")?.value ||
            "zzxbitnodes";

        const url =
            SOURCES[source] ||
            SOURCES.zzxbitnodes;

        setStatus(
            `Loading VPN telemetry from ${source}...`
        );

        try {

            const data =
                await getJson(url);

            const nodes =
                extractNodes(data);

            const result =
                aggregate(nodes);

            ROWS = result.rows;

            ROWS.sort(
                (a, b) =>
                    b.nodes - a.nodes
            );

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(
                `Loaded ${fmt(ROWS.length)} VPN/provider groups.`,
                "ok"
            );

        } catch (err) {

            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(
                `VPN telemetry unavailable: ${err.message}`,
                "warn"
            );
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            $("#bn-refresh")
                ?.addEventListener(
                    "click",
                    loadVPN
                );

            $("#bn-source")
                ?.addEventListener(
                    "change",
                    loadVPN
                );

            $("#bn-search")
                ?.addEventListener(
                    "input",
                    rerender
                );

            $("#bn-sort")
                ?.addEventListener(
                    "change",
                    rerender
                );

            loadVPN();
        }
    );

})();

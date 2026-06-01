(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/enriched/zzxbitnodes/latest.json",
        originalbitnodes: "../api/enriched/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
    };

    const PROXY_KEYWORDS = [
        "proxy",
        "socks",
        "socks5",
        "http proxy",
        "https proxy",
        "relay",
        "tunnel",
        "gateway",
        "nat",
        "vpn",
        "privacy",
        "anonymous",
        "anonymizer",
        "datacenter",
        "data center",
        "hosting",
        "vps",
        "server",
        "colo",
        "colocation",
        "cloud",
        "cdn",
        "edge",
        "ovh",
        "hetzner",
        "digitalocean",
        "linode",
        "akamai",
        "vultr",
        "contabo",
        "aws",
        "amazon",
        "google",
        "azure",
        "oracle cloud"
    ];

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

    function pct(part, total) {
        const a = Number(part || 0);
        const b = Number(total || 0);

        if (!b) return "0.00";

        return ((a / b) * 100).toFixed(2);
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) return;

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

    function topValue(map) {
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function extractNodes(data) {
        if (!data || typeof data !== "object") return {};

        if (data.nodes && typeof data.nodes === "object") return data.nodes;
        if (data.reachable_nodes && typeof data.reachable_nodes === "object") return data.reachable_nodes;
        if (data.data && data.data.nodes && typeof data.data.nodes === "object") return data.data.nodes;

        return {};
    }

    function keywordMatch(text) {
        const value = String(text || "").toLowerCase();

        return PROXY_KEYWORDS.find(keyword => value.includes(keyword));
    }

    function providerName(row, meta) {
        const candidates = [
            row.proxy_provider,
            row.provider,
            row.hosting_provider,
            row.network_provider,
            row.organization,
            row.org,
            row.asn_organization,
            row.asn_org,
            row.owner,
            meta.proxy_provider,
            meta.provider,
            meta.organization,
            meta.org,
            meta.asn_organization,
            meta.asn_org,
            meta.owner
        ];

        for (const value of candidates) {
            const text = String(value || "").trim();

            if (text && !/^\d+(\.\d+)?$/.test(text)) {
                return text;
            }
        }

        return "Unknown";
    }

    function isProxyCandidate(address, row, meta) {
        const fields = [
            address,
            row.proxy,
            row.is_proxy,
            row.proxy_provider,
            row.provider,
            row.hosting_provider,
            row.organization,
            row.org,
            row.asn_organization,
            row.owner,
            meta.proxy,
            meta.is_proxy,
            meta.proxy_provider,
            meta.provider,
            meta.organization,
            meta.org,
            meta.asn_organization,
            meta.owner
        ].join(" ");

        return Boolean(
            row.proxy === true ||
            row.is_proxy === true ||
            meta.proxy === true ||
            meta.is_proxy === true ||
            keywordMatch(fields)
        );
    }

    function aggregate(nodes) {
        const map = new Map();
        const total = Object.keys(nodes || {}).length;

        for (const [address, raw] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(raw);

            const meta = isArray && raw[19] && typeof raw[19] === "object"
                ? raw[19]
                : !isArray && raw.metadata && typeof raw.metadata === "object"
                    ? raw.metadata
                    : {};

            const row = isArray
                ? {
                    address,
                    agent: raw[1],
                    services: raw[3],
                    city: raw[6],
                    country: raw[7],
                    asn: raw[11],
                    organization: raw[12],
                    provider: raw[13]
                }
                : raw || {};

            if (!isProxyCandidate(address, row, meta)) {
                continue;
            }

            const provider = providerName(row, meta);
            const country = row.country || row.country_code || meta.country || "Unknown";
            const asn = row.asn || meta.asn || "Unknown";
            const agent = row.agent || row.user_agent || row.subver || "Unknown";
            const services = row.services || row.service_bits || "Unknown";

            const confidence =
                row.proxy === true ||
                row.is_proxy === true ||
                meta.proxy === true ||
                meta.is_proxy === true
                    ? 90
                    : keywordMatch([
                        provider,
                        row.organization,
                        row.provider,
                        meta.organization,
                        meta.provider
                    ].join(" "))
                        ? 60
                        : 35;

            if (!map.has(provider)) {
                map.set(provider, {
                    provider,
                    nodes: 0,
                    countries: new Set(),
                    asns: new Set(),
                    agents: new Map(),
                    services: new Map(),
                    confidenceTotal: 0
                });
            }

            const item = map.get(provider);

            item.nodes += 1;
            item.countries.add(country);
            item.asns.add(asn);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
            item.services.set(services, (item.services.get(services) || 0) + 1);
            item.confidenceTotal += confidence;
        }

        return [...map.values()].map(item => ({
            provider: item.provider,
            nodes: item.nodes,
            percent: pct(item.nodes, total),
            countries: item.countries.size,
            asns: item.asns.size,
            dominantAgent: topValue(item.agents),
            dominantService: topValue(item.services),
            confidence: Math.min(100, Math.round(item.confidenceTotal / Math.max(1, item.nodes))),
            countryList: [...item.countries].sort().slice(0, 12)
        }));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const totalNodes = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);
        const countries = new Set();

        for (const row of rows) {
            for (const country of row.countryList || []) {
                countries.add(country);
            }
        }

        target.innerHTML = `
            <article class="bn-card"><span>Proxy Providers</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Flagged Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Top Provider</span><strong>${esc(fmt(rows[0]?.provider))}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.provider,
                row.dominantAgent,
                row.dominantService,
                row.countryList.join(" "),
                row.asns,
                row.countries,
                row.confidence
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "provider") {
            rows.sort((a, b) => String(a.provider).localeCompare(String(b.provider)));
        } else if (sort === "countries") {
            rows.sort((a, b) => b.countries - a.countries);
        } else if (sort === "asns") {
            rows.sort((a, b) => b.asns - a.asns);
        } else if (sort === "confidence") {
            rows.sort((a, b) => b.confidence - a.confidence);
        } else {
            rows.sort((a, b) => b.nodes - a.nodes);
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) return;

        if (!rows.length) {
            view.innerHTML = `<div class="bn-proxy-empty">No proxy candidates matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-proxy-grid">
                ${rows.map(row => `
                    <article class="bn-proxy-card">
                        <div class="bn-proxy-header">
                            <div>
                                <div class="bn-proxy-provider">${esc(row.provider)}</div>
                                <div class="bn-proxy-label">Proxy / Relay Candidate</div>
                            </div>

                            <div>
                                <div class="bn-proxy-count">${fmt(row.nodes)}</div>
                                <div class="bn-proxy-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-proxy-stats">
                            <div class="bn-proxy-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-proxy-stat">
                                <span>ASNs</span>
                                <strong>${fmt(row.asns)}</strong>
                            </div>

                            <div class="bn-proxy-stat">
                                <span>Dominant Agent</span>
                                <strong>${esc(row.dominantAgent)}</strong>
                            </div>

                            <div class="bn-proxy-stat">
                                <span>Dominant Services</span>
                                <strong>${esc(row.dominantService)}</strong>
                            </div>
                        </div>

                        <div class="bn-proxy-confidence">
                            <div class="bn-proxy-confidence-label">
                                <span>Detection Confidence</span>
                                <span>${fmt(row.confidence)}%</span>
                            </div>

                            <div class="bn-proxy-confidence-bar">
                                <div class="bn-proxy-confidence-fill" style="width:${row.confidence}%"></div>
                            </div>
                        </div>

                        <div class="bn-proxy-country-list">
                            ${row.countryList.map(country => `
                                <span class="bn-proxy-country">${esc(country)}</span>
                            `).join("")}
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadProxy() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading proxy telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(extractNodes(data));
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} proxy/provider groups.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Proxy telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadProxy);
        $("#bn-source")?.addEventListener("change", loadProxy);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadProxy();
    });
})();

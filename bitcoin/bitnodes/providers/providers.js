(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/providers.json",
        originalbitnodes: "../api/originalbitnodes/providers.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/providers.json"
    };

    const $ = id => document.getElementById(id);

    let ROWS = [];

    function fmt(value) {
        const n = Number(value || 0);

        return Number.isFinite(n)
            ? n.toLocaleString()
            : "0";
    }

    function pct(part, total) {
        const a = Number(part || 0);
        const b = Number(total || 0);

        if (!b) {
            return "0.0000%";
        }

        return `${((a / b) * 100).toFixed(4)}%`;
    }

    function safeText(value) {
        return String(value ?? "")
            .replace(/[&<>"']/g, ch => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[ch]));
    }

    function status(text, mode = "") {
        const el = $("bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = text;
    }

    function looksWrongProvider(name) {
        const text = String(name || "").trim();

        if (!text) {
            return true;
        }

        if (/^\d+(\.\d+)?$/.test(text)) {
            return true;
        }

        if (/^\d+\.\d{3,}$/.test(text)) {
            return true;
        }

        if (text.length <= 1) {
            return true;
        }

        return false;
    }

    async function getJson(url) {
        const res = await fetch(`${url}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error(`${url} returned HTTP ${res.status}`);
        }

        return res.json();
    }

    function topValue(map) {
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
    }

    function extractNodes(payload) {
        if (!payload || typeof payload !== "object") {
            return {};
        }

        if (payload.nodes && typeof payload.nodes === "object") {
            return payload.nodes;
        }

        if (payload.reachable_nodes && typeof payload.reachable_nodes === "object") {
            return payload.reachable_nodes;
        }

        if (payload.data && payload.data.nodes && typeof payload.data.nodes === "object") {
            return payload.data.nodes;
        }

        if (Array.isArray(payload.results)) {
            const out = {};

            for (const row of payload.results) {
                const address = row.address || row.node || row.addr || row.host || row.provider || row.name;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        return {};
    }

    function providerFromRow(row) {
        const candidates = [
            row.provider,
            row.hosting_provider,
            row.isp,
            row.network_provider,
            row.organization,
            row.org,
            row.asn_organization,
            row.asn_org,
            row.name
        ];

        for (const value of candidates) {
            const text = String(value || "").trim();

            if (text && !looksWrongProvider(text)) {
                return text;
            }
        }

        return "Unknown";
    }

    function normalizeExistingRows(payload) {
        if (!Array.isArray(payload.results)) {
            return null;
        }

        return payload.results.map(row => {
            const provider = providerFromRow(row);

            return {
                provider,
                name: provider,
                total_nodes: Number(row.total_nodes || row.nodes || row.count || 0),
                reachable_nodes: Number(row.reachable_nodes || row.reachable || row.total_nodes || row.nodes || 0),
                ipv4_nodes: Number(row.ipv4_nodes || row.ipv4 || 0),
                ipv6_nodes: Number(row.ipv6_nodes || row.ipv6 || 0),
                tor_nodes: Number(row.tor_nodes || row.tor || 0),
                vpn_nodes: Number(row.vpn_nodes || row.vpn || 0),
                proxy_nodes: Number(row.proxy_nodes || row.proxy || 0),
                top_asn: row.top_asn || row.asn || "Unknown",
                top_organization: row.top_organization || row.organization || row.org || "Unknown"
            };
        });
    }

    function aggregateProviders(nodes) {
        const map = new Map();

        for (const [address, row] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(row);

            const obj = isArray
                ? {
                    agent: row[1],
                    city: row[6],
                    country: row[7],
                    asn: row[11],
                    organization: row[12],
                    provider: row[13],
                    metadata: row[19] && typeof row[19] === "object" ? row[19] : {}
                }
                : row || {};

            const meta = obj.metadata && typeof obj.metadata === "object"
                ? obj.metadata
                : {};

            const provider = providerFromRow({
                ...meta,
                ...obj
            });

            const host = String(address || obj.address || obj.node || "").toLowerCase();

            const isTor = Boolean(obj.tor || obj.is_tor || meta.is_tor || host.includes(".onion"));
            const isI2p = Boolean(obj.i2p || obj.is_i2p || meta.is_i2p || host.includes(".i2p"));
            const isIpv6 = Boolean(obj.is_ipv6 || meta.is_ipv6 || (host.includes(":") && !isTor && !isI2p));
            const isIpv4 = Boolean(obj.is_ipv4 || meta.is_ipv4 || (host.includes(".") && !isTor && !isI2p));
            const isVpn = Boolean(obj.vpn || obj.is_vpn || meta.is_vpn);
            const isProxy = Boolean(obj.proxy || obj.is_proxy || meta.is_proxy);

            const asn = obj.asn || meta.asn || "Unknown";
            const org = obj.organization || obj.org || meta.organization || meta.org || "Unknown";

            if (!map.has(provider)) {
                map.set(provider, {
                    provider,
                    name: provider,
                    total_nodes: 0,
                    reachable_nodes: 0,
                    ipv4_nodes: 0,
                    ipv6_nodes: 0,
                    tor_nodes: 0,
                    i2p_nodes: 0,
                    vpn_nodes: 0,
                    proxy_nodes: 0,
                    asns: new Map(),
                    orgs: new Map()
                });
            }

            const item = map.get(provider);

            item.total_nodes += 1;
            item.reachable_nodes += 1;

            if (isIpv4) {
                item.ipv4_nodes += 1;
            }

            if (isIpv6) {
                item.ipv6_nodes += 1;
            }

            if (isTor) {
                item.tor_nodes += 1;
            }

            if (isI2p) {
                item.i2p_nodes += 1;
            }

            if (isVpn) {
                item.vpn_nodes += 1;
            }

            if (isProxy) {
                item.proxy_nodes += 1;
            }

            item.asns.set(asn, (item.asns.get(asn) || 0) + 1);
            item.orgs.set(org, (item.orgs.get(org) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            provider: item.provider,
            name: item.name,
            total_nodes: item.total_nodes,
            reachable_nodes: item.reachable_nodes,
            ipv4_nodes: item.ipv4_nodes,
            ipv6_nodes: item.ipv6_nodes,
            tor_nodes: item.tor_nodes,
            i2p_nodes: item.i2p_nodes,
            vpn_nodes: item.vpn_nodes,
            proxy_nodes: item.proxy_nodes,
            top_asn: topValue(item.asns),
            top_organization: topValue(item.orgs)
        }));
    }

    function normalizePayload(payload) {
        const existing = normalizeExistingRows(payload);

        if (existing) {
            return existing;
        }

        return aggregateProviders(extractNodes(payload));
    }

    function card(label, value, sub) {
        return `
            <article class="bn-card">
                <span>${safeText(label)}</span>
                <strong>${safeText(value)}</strong>
                <small>${safeText(sub || "")}</small>
            </article>
        `;
    }

    function renderSummary(rows) {
        const mount = $("bn-summary");

        if (!mount) {
            return;
        }

        const totalProviders = rows.length;
        const totalNodes = rows.reduce((n, row) => n + Number(row.total_nodes || 0), 0);
        const badNames = rows.filter(row => looksWrongProvider(row.provider || row.name)).length;
        const top = rows[0];

        mount.innerHTML = [
            card("Providers", fmt(totalProviders), "unique provider labels"),
            card("Nodes", fmt(totalNodes), "nodes in provider view"),
            card("Top Provider", top ? (top.provider || top.name || "Unknown") : "Unknown", top ? `${fmt(top.total_nodes)} nodes` : ""),
            card("Schema Warnings", fmt(badNames), "decimal/empty provider labels")
        ].join("");
    }

    function renderTable(rows) {
        const mount = $("bn-table");

        if (!mount) {
            return;
        }

        const totalNodes = rows.reduce((n, row) => n + Number(row.total_nodes || 0), 0);

        if (!rows.length) {
            mount.innerHTML = `<p class="bn-muted">No provider records found.</p>`;
            return;
        }

        mount.innerHTML = `
            <div class="bn-table-wrap">
                <table class="bn-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Provider</th>
                            <th>Nodes</th>
                            <th>Share</th>
                            <th>Reachable</th>
                            <th>IPv4</th>
                            <th>IPv6</th>
                            <th>Tor</th>
                            <th>VPN</th>
                            <th>Proxy</th>
                            <th>Top ASN</th>
                            <th>Top Org</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map((row, index) => {
                            const provider = row.provider || row.name || "Unknown";
                            const warning = looksWrongProvider(provider)
                                ? ` <span class="bn-provider-warning">⚠</span>`
                                : "";

                            return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td><span class="bn-provider-name">${safeText(provider)}</span>${warning}</td>
                                    <td>${fmt(row.total_nodes)}</td>
                                    <td>${pct(row.total_nodes, totalNodes)}</td>
                                    <td>${fmt(row.reachable_nodes)}</td>
                                    <td>${fmt(row.ipv4_nodes)}</td>
                                    <td>${fmt(row.ipv6_nodes)}</td>
                                    <td>${fmt(row.tor_nodes)}</td>
                                    <td>${fmt(row.vpn_nodes)}</td>
                                    <td>${fmt(row.proxy_nodes)}</td>
                                    <td>${safeText(row.top_asn || "Unknown")}</td>
                                    <td>${safeText(row.top_organization || "Unknown")}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function load() {
        const sourceEl = $("bn-source");
        const source = sourceEl ? sourceEl.value : "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        status(`Loading provider distribution from ${source}...`);

        const payload = await getJson(url);

        ROWS = normalizePayload(payload);
        ROWS.sort((a, b) => Number(b.total_nodes || 0) - Number(a.total_nodes || 0));

        renderSummary(ROWS);
        renderTable(ROWS);

        const totalNodes = ROWS.reduce((n, row) => n + Number(row.total_nodes || 0), 0);

        status(
            `Loaded ${fmt(ROWS.length)} providers across ${fmt(totalNodes)} nodes from ${source}.`,
            "ok"
        );
    }

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    ready(() => {
        const refresh = $("bn-refresh");
        const source = $("bn-source");

        if (refresh) {
            refresh.addEventListener("click", () => {
                load().catch(err => status(`Provider load failed: ${err.message}`, "warn"));
            });
        }

        if (source) {
            source.addEventListener("change", () => {
                load().catch(err => status(`Provider load failed: ${err.message}`, "warn"));
            });
        }

        load().catch(err => status(`Provider load failed: ${err.message}`, "warn"));
    });
})();

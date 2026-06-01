(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latest.json",
        originalbitnodes: "../api/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
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

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
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

    function extractNodes(data) {
        if (!data || typeof data !== "object") return {};

        if (data.nodes && typeof data.nodes === "object") return data.nodes;
        if (data.reachable_nodes && typeof data.reachable_nodes === "object") return data.reachable_nodes;
        if (data.data && data.data.nodes && typeof data.data.nodes === "object") return data.data.nodes;

        return {};
    }

    function normalize(nodes) {
        return Object.entries(nodes || {}).map(([node, row]) => {
            if (Array.isArray(row)) {
                return {
                    node,
                    protocol: row?.[0] || "Unknown",
                    agent: row?.[1] || "Unknown",
                    services: row?.[3] || "Unknown",
                    height: row?.[4] || 0,
                    hostname: row?.[5] || "",
                    city: row?.[6] || "Unknown",
                    country: row?.[7] || "Unknown",
                    latitude: row?.[8],
                    longitude: row?.[9],
                    timezone: row?.[10] || "Unknown",
                    asn: row?.[11] || "Unknown",
                    org: row?.[12] || "Unknown",
                    provider: row?.[13] || "Unknown",
                    isTor: String(node).includes(".onion"),
                    isI2P: String(node).includes(".i2p"),
                    isIPv6: String(node).includes(":") && !String(node).includes(".onion") && !String(node).includes(".i2p")
                };
            }

            const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
            const address = row?.address || row?.node || row?.addr || node;
            const text = String(address || "").toLowerCase();

            return {
                node: address,
                protocol: row?.protocol || row?.protocol_version || row?.version || "Unknown",
                agent: row?.agent || row?.user_agent || row?.subver || "Unknown",
                services: row?.services || row?.service_bits || "Unknown",
                height: row?.height || row?.start_height || row?.latest_height || 0,
                hostname: row?.hostname || row?.host || meta.hostname || "",
                city: row?.city || meta.city || "Unknown",
                country: row?.country || row?.country_code || meta.country || "Unknown",
                latitude: row?.latitude || row?.lat || meta.latitude,
                longitude: row?.longitude || row?.lon || row?.lng || meta.longitude,
                timezone: row?.timezone || row?.tz || meta.timezone || "Unknown",
                asn: row?.asn || meta.asn || "Unknown",
                org: row?.organization || row?.org || meta.organization || meta.org || "Unknown",
                provider: row?.provider || meta.provider || "Unknown",
                isTor: Boolean(row?.tor || row?.is_tor || meta?.is_tor || text.includes(".onion")),
                isI2P: Boolean(row?.i2p || row?.is_i2p || meta?.is_i2p || text.includes(".i2p")),
                isIPv6: Boolean(row?.is_ipv6 || meta?.is_ipv6 || (text.includes(":") && !text.includes(".onion") && !text.includes(".i2p")))
            };
        });
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();

        return ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.country,
                row.city,
                row.asn,
                row.agent,
                row.services,
                row.org,
                row.provider,
                row.protocol
            ].join(" ").toLowerCase().includes(search);
        });
    }

    function aggregate(rows) {
        const group = $("#bn-group")?.value || "country";
        const map = new Map();

        for (const row of rows) {
            const key =
                group === "asn" ? row.asn :
                group === "agent" ? row.agent :
                group === "services" ? row.services :
                row.country;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    count: 0,
                    tor: 0,
                    i2p: 0,
                    ipv6: 0,
                    countries: new Set(),
                    agents: new Set(),
                    asns: new Set(),
                    orgs: new Set(),
                    providers: new Set()
                });
            }

            const item = map.get(key);

            item.count += 1;

            if (row.isTor) item.tor += 1;
            if (row.isI2P) item.i2p += 1;
            if (row.isIPv6) item.ipv6 += 1;

            item.countries.add(row.country);
            item.agents.add(row.agent);
            item.asns.add(row.asn);
            item.orgs.add(row.org);
            item.providers.add(row.provider);
        }

        return [...map.values()]
            .map(item => ({
                key: item.key,
                count: item.count,
                tor: item.tor,
                i2p: item.i2p,
                ipv6: item.ipv6,
                countries: item.countries.size,
                agents: item.agents.size,
                asns: item.asns.size,
                orgs: item.orgs.size,
                providers: item.providers.size
            }))
            .sort((a, b) => b.count - a.count);
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const asns = new Set(rows.map(row => row.asn).filter(Boolean));
        const agents = new Set(rows.map(row => row.agent).filter(Boolean));
        const tor = rows.filter(row => row.isTor).length;

        target.innerHTML = `
            <article class="bn-card"><span>Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
            <article class="bn-card"><span>Tor Nodes</span><strong>${fmt(tor)}</strong></article>
        `;
    }

    function renderNetwork(groups) {
        const map = $("#bn-map");

        if (!map) return;

        const visible = groups.slice(0, 32);
        const radius = 42;

        const center = `
            <div class="bn-network-center">
                Bitcoin<br>Network
            </div>
        `;

        const nodes = visible.map((item, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1);
            const x = 50 + Math.cos(angle) * radius;
            const y = 50 + Math.sin(angle) * radius;
            const rank = index < 5 ? "top" : "normal";
            const scale = Math.min(1.22, Math.max(0.78, 0.78 + item.count / Math.max(1, visible[0]?.count || 1) * 0.44));

            return `
                <div
                    class="bn-network-node"
                    data-rank="${rank}"
                    style="left:${x}%;top:${y}%;transform:translate(-50%, -50%) scale(${scale});"
                    title="${esc(fmt(item.key))} | ${fmt(item.count)} nodes"
                >
                    <strong>${fmt(item.count)}</strong>
                    ${esc(fmt(item.key))}
                </div>
            `;
        }).join("");

        map.innerHTML = center + nodes;
    }

    function renderRows(groups) {
        const view = $("#bn-view");

        if (!view) return;

        if (!groups.length) {
            view.innerHTML = `<div class="bn-empty">No network topology groups matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-network-list">
                ${groups.slice(0, 100).map(item => `
                    <article class="bn-network-card">
                        <strong>${esc(fmt(item.key))}</strong>
                        <span>Nodes: ${fmt(item.count)}</span>
                        <span>Tor Nodes: ${fmt(item.tor)}</span>
                        <span>I2P Nodes: ${fmt(item.i2p)}</span>
                        <span>IPv6 Nodes: ${fmt(item.ipv6)}</span>
                        <span>Countries: ${fmt(item.countries)}</span>
                        <span>ASNs: ${fmt(item.asns)}</span>
                        <span>Agents: ${fmt(item.agents)}</span>
                        <span>Organizations: ${fmt(item.orgs)}</span>
                        <span>Providers: ${fmt(item.providers)}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        const rows = filteredRows();
        const groups = aggregate(rows);

        renderSummary(rows);
        renderNetwork(groups);
        renderRows(groups);
    }

    async function loadNetworkMap() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading network topology from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(extractNodes(data));

            rerender();

            setStatus(`Loaded ${fmt(ROWS.length)} network topology records.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderNetwork([]);
            renderRows([]);

            setStatus(`Network map unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadNetworkMap);
        $("#bn-source")?.addEventListener("change", loadNetworkMap);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-group")?.addEventListener("change", rerender);

        loadNetworkMap();
    });
})();

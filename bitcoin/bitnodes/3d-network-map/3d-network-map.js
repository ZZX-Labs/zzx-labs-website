(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latest.json",
        originalbitnodes: "../api/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
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

    function networkType(address, row, meta) {
        const text = String(address || row?.address || row?.node || "").toLowerCase();

        if (text.includes(".onion") || row?.is_tor || meta?.is_tor) return "Tor";
        if (text.includes(".i2p") || row?.is_i2p || meta?.is_i2p) return "I2P";
        if (text.includes(":") || row?.is_ipv6 || meta?.is_ipv6) return "IPv6";

        return "IPv4";
    }

    function normalize(nodes) {
        return Object.entries(nodes || {}).map(([address, row]) => {
            if (Array.isArray(row)) {
                const meta = row[19] && typeof row[19] === "object" ? row[19] : {};

                return {
                    node: address,
                    protocol: row[0] || "Unknown",
                    agent: row[1] || "Unknown",
                    services: row[3] || "Unknown",
                    height: row[4] || 0,
                    city: row[6] || "Unknown",
                    country: row[7] || "Unknown",
                    asn: row[11] || "Unknown",
                    org: row[12] || "Unknown",
                    provider: row[13] || meta.provider || "Unknown",
                    network: networkType(address, {}, meta)
                };
            }

            const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
            const node = row?.address || row?.node || row?.addr || address;

            return {
                node,
                protocol: row?.protocol || row?.protocol_version || row?.version || "Unknown",
                agent: row?.agent || row?.user_agent || row?.subver || "Unknown",
                services: row?.services || row?.service_bits || "Unknown",
                height: row?.height || row?.start_height || row?.latest_height || 0,
                city: row?.city || meta.city || "Unknown",
                country: row?.country || row?.country_code || meta.country || "Unknown",
                asn: row?.asn || meta.asn || "Unknown",
                org: row?.organization || row?.org || meta.organization || meta.org || "Unknown",
                provider: row?.provider || meta.provider || "Unknown",
                network: networkType(node, row, meta)
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
                row.network
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
                group === "provider" ? row.provider :
                group === "network" ? row.network :
                row.country;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    count: 0,
                    countries: new Set(),
                    asns: new Set(),
                    agents: new Set(),
                    providers: new Set(),
                    networks: new Set()
                });
            }

            const item = map.get(key);

            item.count += 1;
            item.countries.add(row.country);
            item.asns.add(row.asn);
            item.agents.add(row.agent);
            item.providers.add(row.provider);
            item.networks.add(row.network);
        }

        return [...map.values()]
            .map(item => ({
                key: item.key,
                count: item.count,
                countries: item.countries.size,
                asns: item.asns.size,
                agents: item.agents.size,
                providers: item.providers.size,
                networks: [...item.networks].join(", ")
            }))
            .sort((a, b) => b.count - a.count);
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const asns = new Set(rows.map(row => row.asn).filter(Boolean));
        const providers = new Set(rows.map(row => row.provider).filter(Boolean));
        const networks = new Set(rows.map(row => row.network).filter(Boolean));

        target.innerHTML = `
            <article class="bn-card"><span>Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
            <article class="bn-card"><span>Networks</span><strong>${fmt(networks.size)}</strong></article>
        `;
    }

    function renderMap(groups) {
        const map = $("#bn-map3d");

        if (!map) return;

        const limit = Number($("#bn-limit")?.value || 36);
        const visible = groups.slice(0, limit);
        const max = visible[0]?.count || 1;

        const rings = `
            <div class="bn-map3d-ring"></div>
            <div class="bn-map3d-ring"></div>
            <div class="bn-map3d-ring"></div>
        `;

        const core = `
            <div class="bn-map3d-core">
                Bitcoin<br>Network
            </div>
        `;

        const nodes = visible.map((item, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1);
            const orbit = 140 + ((index % 3) * 95);
            const x = Math.cos(angle) * orbit;
            const y = Math.sin(angle) * orbit;
            const z = Math.round((item.count / max) * 150);
            const rank = index < 6 ? "top" : "normal";

            return `
                <div
                    class="bn-map3d-node"
                    data-rank="${rank}"
                    style="transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) translateZ(${z}px);"
                    title="${esc(fmt(item.key))} | ${fmt(item.count)} nodes"
                >
                    <strong>${fmt(item.count)}</strong>
                    ${esc(fmt(item.key))}
                    <span>${esc(fmt(item.networks))}</span>
                </div>
            `;
        }).join("");

        map.innerHTML = `
            <div class="bn-map3d-space">
                ${rings}
                ${core}
                ${nodes}
            </div>
        `;
    }

    function renderList(groups) {
        const view = $("#bn-view");

        if (!view) return;

        if (!groups.length) {
            view.innerHTML = `<div class="bn-empty">No 3D topology groups matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-map3d-list">
                ${groups.slice(0, 100).map(item => `
                    <article class="bn-map3d-card">
                        <strong>${esc(fmt(item.key))}</strong>
                        <span>Nodes: ${fmt(item.count)}</span>
                        <span>Countries: ${fmt(item.countries)}</span>
                        <span>ASNs: ${fmt(item.asns)}</span>
                        <span>Agents: ${fmt(item.agents)}</span>
                        <span>Providers: ${fmt(item.providers)}</span>
                        <span>Networks: ${esc(fmt(item.networks))}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        const rows = filteredRows();
        const groups = aggregate(rows);

        renderSummary(rows);
        renderMap(groups);
        renderList(groups);
    }

    async function loadMap() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading 3D topology from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(extractNodes(data));

            rerender();

            setStatus(`Loaded ${fmt(ROWS.length)} 3D topology records.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderMap([]);
            renderList([]);

            setStatus(`3D network map unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadMap);
        $("#bn-source")?.addEventListener("change", loadMap);
        $("#bn-group")?.addEventListener("change", rerender);
        $("#bn-limit")?.addEventListener("change", rerender);
        $("#bn-search")?.addEventListener("input", rerender);

        loadMap();
    });
})();

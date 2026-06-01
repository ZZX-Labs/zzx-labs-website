(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latest.json",
        originalbitnodes: "../api/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json",
        nodes: "../api/nodes.json",
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
        return Number.isFinite(n) ? n : null;
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

        if (Array.isArray(data.results)) {
            const out = {};

            for (const row of data.results) {
                const address = row.address || row.node || row.addr || row.host;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        return {};
    }

    function normalize(nodes) {
        return Object.entries(nodes || {}).map(([node, row]) => {
            if (Array.isArray(row)) {
                return {
                    node,
                    agent: row?.[1] || "Unknown",
                    city: row?.[6] || "Unknown",
                    country: row?.[7] || "Unknown",
                    lat: num(row?.[8]),
                    lon: num(row?.[9]),
                    asn: row?.[11] || "Unknown",
                    org: row?.[12] || "Unknown",
                    provider: row?.[13] || "Unknown",
                    network: String(node).includes(".onion")
                        ? "Tor"
                        : String(node).includes(".i2p")
                            ? "I2P"
                            : String(node).includes(":")
                                ? "IPv6"
                                : "IPv4"
                };
            }

            const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
            const address = row?.address || row?.node || row?.addr || node;
            const text = String(address || "").toLowerCase();

            return {
                node: address,
                agent: row?.agent || row?.user_agent || row?.subver || "Unknown",
                city: row?.city || meta.city || "Unknown",
                country: row?.country || row?.country_code || meta.country || "Unknown",
                lat: num(row?.latitude ?? row?.lat ?? meta.latitude),
                lon: num(row?.longitude ?? row?.lon ?? row?.lng ?? meta.longitude),
                asn: row?.asn || meta.asn || "Unknown",
                org: row?.organization || row?.org || meta.organization || meta.org || "Unknown",
                provider: row?.provider || meta.provider || "Unknown",
                network: text.includes(".onion") || row?.is_tor || meta?.is_tor
                    ? "Tor"
                    : text.includes(".i2p") || row?.is_i2p || meta?.is_i2p
                        ? "I2P"
                        : text.includes(":") || row?.is_ipv6 || meta?.is_ipv6
                            ? "IPv6"
                            : "IPv4"
            };
        }).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon));
    }

    function project(lat, lon) {
        return {
            x: ((lon + 180) / 360) * 100,
            y: ((90 - lat) / 180) * 100
        };
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();

        return ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.city,
                row.country,
                row.asn,
                row.org,
                row.provider,
                row.agent,
                row.network
            ].join(" ").toLowerCase().includes(search);
        });
    }

    function groupRows(rows) {
        const group = $("#bn-group")?.value || "country";
        const map = new Map();

        for (const row of rows) {
            const key =
                group === "city" ? `${row.city}, ${row.country}` :
                group === "asn" ? row.asn :
                row.country;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    count: 0,
                    lat: 0,
                    lon: 0,
                    agents: new Set(),
                    countries: new Set(),
                    networks: new Set(),
                    providers: new Set()
                });
            }

            const item = map.get(key);

            item.count += 1;
            item.lat += row.lat;
            item.lon += row.lon;

            if (row.agent) item.agents.add(row.agent);
            if (row.country) item.countries.add(row.country);
            if (row.network) item.networks.add(row.network);
            if (row.provider) item.providers.add(row.provider);
        }

        return [...map.values()].map(item => ({
            ...item,
            lat: item.lat / item.count,
            lon: item.lon / item.count,
            agents: item.agents.size,
            countries: item.countries.size,
            networks: [...item.networks].join(", "),
            providers: item.providers.size
        })).sort((a, b) => b.count - a.count);
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const cities = new Set(rows.map(row => `${row.city}|${row.country}`).filter(Boolean));
        const asns = new Set(rows.map(row => row.asn).filter(Boolean));
        const networks = new Set(rows.map(row => row.network).filter(Boolean));

        target.innerHTML = `
            <article class="bn-card"><span>Mapped Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Cities</span><strong>${fmt(cities.size)}</strong></article>
            <article class="bn-card"><span>Networks</span><strong>${fmt(networks.size)}</strong></article>
        `;
    }

    function renderMap(groups) {
        const map = $("#bn-map");

        if (!map) return;

        map.innerHTML = groups.slice(0, 1500).map(item => {
            const p = project(item.lat, item.lon);
            const density =
                item.count >= 100 ? "high" :
                item.count >= 25 ? "high" :
                "normal";

            return `
                <span
                    class="bn-map-dot"
                    data-density="${density}"
                    style="left:${p.x}%;top:${p.y}%"
                    title="${esc(fmt(item.key))} | ${fmt(item.count)} nodes"
                ></span>
            `;
        }).join("");
    }

    function renderRows(groups) {
        const view = $("#bn-view");

        if (!view) return;

        if (!groups.length) {
            view.innerHTML = `<div class="bn-empty">No map groups matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-map-list">
                ${groups.slice(0, 100).map(item => `
                    <article class="bn-map-card">
                        <strong>${esc(fmt(item.key))}</strong>
                        <span>Nodes: ${fmt(item.count)}</span>
                        <span>Agents: ${fmt(item.agents)}</span>
                        <span>Countries: ${fmt(item.countries)}</span>
                        <span>Providers: ${fmt(item.providers)}</span>
                        <span>Networks: ${esc(fmt(item.networks))}</span>
                        <span>Lat/Lon: ${fmt(item.lat.toFixed(4))}, ${fmt(item.lon.toFixed(4))}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        const rows = filteredRows();
        const groups = groupRows(rows);

        renderSummary(rows);
        renderMap(groups);
        renderRows(groups);
    }

    async function loadMap() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading map telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(extractNodes(data));

            rerender();

            setStatus(`Loaded ${fmt(ROWS.length)} mapped nodes.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderMap([]);
            renderRows([]);

            setStatus(`Map telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadMap);
        $("#bn-source")?.addEventListener("change", loadMap);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-group")?.addEventListener("change", rerender);

        loadMap();
    });
})();

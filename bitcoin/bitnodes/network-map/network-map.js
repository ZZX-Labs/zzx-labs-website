(() => {
    "use strict";

    const SOURCES = {
        local: "../api/nodes.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");
        if (!el) return;
        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return await response.json();
    }

    function normalize(nodes) {
        return Object.entries(nodes).map(([node, row]) => ({
            node,
            protocol: row?.[0] || "Unknown",
            agent: row?.[1] || "Unknown",
            services: row?.[3] || "Unknown",
            height: row?.[4] || 0,
            city: row?.[6] || "Unknown",
            country: row?.[7] || "Unknown",
            asn: row?.[11] || "Unknown",
            org: row?.[12] || "Unknown",
            isTor: node.includes(".onion")
        }));
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();

        return ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.country,
                row.asn,
                row.agent,
                row.services,
                row.org
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
                    countries: new Set(),
                    agents: new Set(),
                    asns: new Set()
                });
            }

            const item = map.get(key);
            item.count += 1;
            if (row.isTor) item.tor += 1;
            item.countries.add(row.country);
            item.agents.add(row.agent);
            item.asns.add(row.asn);
        }

        return [...map.values()].map(item => ({
            key: item.key,
            count: item.count,
            tor: item.tor,
            countries: item.countries.size,
            agents: item.agents.size,
            asns: item.asns.size
        })).sort((a, b) => b.count - a.count);
    }

    function renderSummary(rows) {
        const countries = new Set(rows.map(row => row.country));
        const asns = new Set(rows.map(row => row.asn));
        const agents = new Set(rows.map(row => row.agent));
        const tor = rows.filter(row => row.isTor).length;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
            <article class="bn-card"><span>Tor Nodes</span><strong>${fmt(tor)}</strong></article>
        `;
    }

    function renderNetwork(groups) {
        const map = $("#bn-map");

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

            return `
                <div
                    class="bn-network-node"
                    data-rank="${rank}"
                    style="left:${x}%;top:${y}%"
                    title="${fmt(item.key)} | ${fmt(item.count)} nodes"
                >
                    <strong>${fmt(item.count)}</strong>
                    ${fmt(item.key)}
                </div>
            `;
        }).join("");

        map.innerHTML = center + nodes;
    }

    function renderRows(groups) {
        const view = $("#bn-view");

        if (!groups.length) {
            view.innerHTML = `<div class="bn-empty">No network topology groups matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-network-list">
                ${groups.slice(0, 100).map(item => `
                    <article class="bn-network-card">
                        <strong>${fmt(item.key)}</strong>
                        <span>Nodes: ${fmt(item.count)}</span>
                        <span>Tor Nodes: ${fmt(item.tor)}</span>
                        <span>Countries: ${fmt(item.countries)}</span>
                        <span>ASNs: ${fmt(item.asns)}</span>
                        <span>Agents: ${fmt(item.agents)}</span>
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
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading network topology from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data.nodes || {});
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

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
            agent: row?.[1],
            city: row?.[6] || "Unknown",
            country: row?.[7] || "Unknown",
            lat: Number(row?.[8]),
            lon: Number(row?.[9]),
            asn: row?.[11] || "Unknown",
            org: row?.[12] || "Unknown"
        })).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon));
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
                row.agent
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
                    agents: new Set()
                });
            }

            const item = map.get(key);
            item.count += 1;
            item.lat += row.lat;
            item.lon += row.lon;
            if (row.agent) item.agents.add(row.agent);
        }

        return [...map.values()].map(item => ({
            ...item,
            lat: item.lat / item.count,
            lon: item.lon / item.count,
            agents: item.agents.size
        })).sort((a, b) => b.count - a.count);
    }

    function renderSummary(rows) {
        const countries = new Set(rows.map(row => row.country));
        const cities = new Set(rows.map(row => `${row.city}|${row.country}`));
        const asns = new Set(rows.map(row => row.asn));

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Mapped Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Cities</span><strong>${fmt(cities.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
        `;
    }

    function renderMap(groups) {
        const map = $("#bn-map");

        map.innerHTML = groups.slice(0, 1500).map(item => {
            const p = project(item.lat, item.lon);
            const density = item.count >= 25 ? "high" : "normal";

            return `
                <span
                    class="bn-map-dot"
                    data-density="${density}"
                    style="left:${p.x}%;top:${p.y}%"
                    title="${fmt(item.key)} | ${fmt(item.count)} nodes"
                ></span>
            `;
        }).join("");
    }

    function renderRows(groups) {
        const view = $("#bn-view");

        if (!groups.length) {
            view.innerHTML = `<div class="bn-empty">No map groups matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-map-list">
                ${groups.slice(0, 100).map(item => `
                    <article class="bn-map-card">
                        <strong>${fmt(item.key)}</strong>
                        <span>Nodes: ${fmt(item.count)}</span>
                        <span>Agents: ${fmt(item.agents)}</span>
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
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading map telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data.nodes || {});

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

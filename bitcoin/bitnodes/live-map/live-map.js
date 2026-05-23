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
            city: row?.[6],
            country: row?.[7],
            lat: Number(row?.[8]),
            lon: Number(row?.[9]),
            asn: row?.[11],
            org: row?.[12],
            isTor: node.includes(".onion")
        })).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon));
    }

    function renderSummary(rows) {
        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const tor = rows.filter(row => row.isTor).length;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Mapped Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Tor Points</span><strong>${fmt(tor)}</strong></article>
            <article class="bn-card"><span>Projection</span><strong>Equirect</strong></article>
        `;
    }

    function project(lat, lon) {
        return {
            x: ((lon + 180) / 360) * 100,
            y: ((90 - lat) / 180) * 100
        };
    }

    function renderMap(rows) {
        const map = $("#bn-map");

        map.innerHTML = rows.slice(0, 3000).map(row => {
            const p = project(row.lat, row.lon);

            return `
                <span
                    class="bn-map-point ${row.isTor ? "is-tor" : ""}"
                    style="left:${p.x}%;top:${p.y}%"
                    title="${fmt(row.node)} | ${fmt(row.city)}, ${fmt(row.country)}"
                ></span>
            `;
        }).join("");
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No mapped coordinates found.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-map-table-wrap">
                <table class="bn-map-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>City</th>
                            <th>Country</th>
                            <th>Latitude</th>
                            <th>Longitude</th>
                            <th>ASN</th>
                            <th>Organization</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 250).map(row => `
                            <tr>
                                <td class="bn-map-node">${fmt(row.node)}</td>
                                <td>${fmt(row.city)}</td>
                                <td>${fmt(row.country)}</td>
                                <td>${fmt(row.lat)}</td>
                                <td>${fmt(row.lon)}</td>
                                <td>${fmt(row.asn)}</td>
                                <td>${fmt(row.org)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadLiveMap() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading live map coordinates from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data.nodes || {});

            renderSummary(ROWS);
            renderMap(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} mapped node coordinates.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderMap([]);
            renderRows([]);

            setStatus(`Live map telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadLiveMap);
        $("#bn-source")?.addEventListener("change", loadLiveMap);

        loadLiveMap();
    });
})();

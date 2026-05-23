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

    function unix(value) {
        if (!value) return "—";

        const ts = Number(value) < 10000000000
            ? Number(value) * 1000
            : Number(value);

        return new Date(ts)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC");
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
        const rows = [];

        for (const [address, row] of Object.entries(nodes)) {
            const hostname = row?.[5] || "";

            if (!address.includes(".onion") && !hostname.includes(".onion")) {
                continue;
            }

            rows.push({
                node: address,
                protocol: row?.[0],
                userAgent: row?.[1],
                connectedSince: row?.[2],
                services: row?.[3],
                height: row?.[4],
                hostname,
                city: row?.[6],
                country: row?.[7],
                asn: row?.[11],
                organization: row?.[12]
            });
        }

        return rows;
    }

    function renderSummary(rows) {
        const agents = new Set(rows.map(row => row.userAgent).filter(Boolean));
        const protocols = new Set(rows.map(row => row.protocol).filter(Boolean));

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Tor Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>User Agents</span><strong>${fmt(agents.size)}</strong></article>
            <article class="bn-card"><span>Protocols</span><strong>${fmt(protocols.size)}</strong></article>
            <article class="bn-card"><span>Highest Height</span><strong>${fmt(rows[0]?.height)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "height";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.hostname,
                row.userAgent,
                row.protocol,
                row.services
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "protocol") rows.sort((a, b) => b.protocol - a.protocol);
        else if (sort === "agent") rows.sort((a, b) => String(a.userAgent).localeCompare(String(b.userAgent)));
        else if (sort === "port") rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        else rows.sort((a, b) => b.height - a.height);

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No reachable onion nodes matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-tor-grid">
                ${rows.map(row => `
                    <article class="bn-tor-card">
                        <div class="bn-tor-address">${fmt(row.node)}</div>

                        <div class="bn-tor-meta">
                            <div class="bn-tor-stat"><span>User Agent</span><strong>${fmt(row.userAgent)}</strong></div>
                            <div class="bn-tor-stat"><span>Protocol</span><strong>${fmt(row.protocol)}</strong></div>
                            <div class="bn-tor-stat"><span>Block Height</span><strong>${fmt(row.height)}</strong></div>
                            <div class="bn-tor-stat"><span>Services</span><strong>${fmt(row.services)}</strong></div>
                            <div class="bn-tor-stat"><span>Hostname</span><strong>${fmt(row.hostname)}</strong></div>
                            <div class="bn-tor-stat"><span>Organization</span><strong>${fmt(row.organization)}</strong></div>
                            <div class="bn-tor-stat"><span>Country</span><strong>${fmt(row.country)}</strong></div>
                            <div class="bn-tor-stat"><span>Connected Since</span><strong>${unix(row.connectedSince)}</strong></div>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadTor() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading Tor reachable-node telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data.nodes || {});
            ROWS.sort((a, b) => b.height - a.height);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} reachable onion nodes.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Tor telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadTor);
        $("#bn-source")?.addEventListener("change", loadTor);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadTor();
    });
})();

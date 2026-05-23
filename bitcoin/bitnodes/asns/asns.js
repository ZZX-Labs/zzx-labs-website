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

    function topValue(map) {
        return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function aggregate(nodes) {
        const total = Object.keys(nodes).length;
        const map = new Map();

        for (const row of Object.values(nodes)) {
            const asn = row?.[11] || "Unknown";
            const org = row?.[12] || "Unknown";
            const country = row?.[7] || "Unknown";
            const agent = row?.[1] || "Unknown";

            if (!map.has(asn)) {
                map.set(asn, {
                    asn,
                    nodes: 0,
                    orgs: new Map(),
                    countries: new Set(),
                    agents: new Map()
                });
            }

            const item = map.get(asn);
            item.nodes += 1;
            item.orgs.set(org, (item.orgs.get(org) || 0) + 1);
            item.countries.add(country);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            asn: item.asn,
            organization: topValue(item.orgs),
            nodes: item.nodes,
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
            countries: item.countries.size,
            countryList: [...item.countries].sort().slice(0, 10).join(", "),
            topAgent: topValue(item.agents)
        }));
    }

    function renderSummary(rows) {
        const totalNodes = rows.reduce((sum, row) => sum + row.nodes, 0);
        const multiCountry = rows.filter(row => row.countries > 1).length;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>ASNs</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Multi-Nation ASNs</span><strong>${fmt(multiCountry)}</strong></article>
            <article class="bn-card"><span>Largest ASN</span><strong>${fmt(rows[0]?.asn)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;
            return [row.asn, row.organization, row.countryList, row.topAgent]
                .join(" ")
                .toLowerCase()
                .includes(search);
        });

        if (sort === "asn") rows.sort((a, b) => a.asn.localeCompare(b.asn));
        else if (sort === "countries") rows.sort((a, b) => b.countries - a.countries);
        else if (sort === "org") rows.sort((a, b) => a.organization.localeCompare(b.organization));
        else rows.sort((a, b) => b.nodes - a.nodes);

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No ASN telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-asn-grid">
                ${rows.map(row => `
                    <article class="bn-asn-card">
                        <div class="bn-asn-top">
                            <div>
                                <div class="bn-asn-id">${fmt(row.asn)}</div>
                                <div class="bn-asn-org">${fmt(row.organization)}</div>
                            </div>
                            <div>
                                <div class="bn-asn-count">${fmt(row.nodes)}</div>
                                <div class="bn-asn-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-asn-stats">
                            <div class="bn-asn-stat"><span>Countries</span><strong>${fmt(row.countries)}</strong></div>
                            <div class="bn-asn-stat"><span>Observed Nations</span><strong>${fmt(row.countryList)}</strong></div>
                            <div class="bn-asn-stat"><span>Dominant Agent</span><strong>${fmt(row.topAgent)}</strong></div>
                            <div class="bn-asn-stat"><span>Network Share</span><strong>${fmt(row.percent)}%</strong></div>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadAsns() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading ASN distribution from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(data.nodes || {});
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} ASN distributions.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`ASN telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadAsns);
        $("#bn-source")?.addEventListener("change", loadAsns);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadAsns();
    });
})();

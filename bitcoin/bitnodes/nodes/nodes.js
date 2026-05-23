(() => {
    "use strict";

    const SOURCES = {
        local: "../api/nodes.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
    };

    let RAW_ROWS = [];

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

    function normalize(data) {
        const nodes = data.nodes || {};

        return Object.entries(nodes).map(([address, row]) => ({
            node: address,
            protocol: row?.[0],
            user_agent: row?.[1],
            connected_since: row?.[2],
            services: row?.[3],
            height: row?.[4],
            hostname: row?.[5],
            city: row?.[6],
            country: row?.[7],
            latitude: row?.[8],
            longitude: row?.[9],
            timezone: row?.[10],
            asn: row?.[11],
            organization: row?.[12]
        }));
    }

    function renderSummary(rows) {
        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const agents = new Set(rows.map(row => row.user_agent).filter(Boolean));
        const asns = new Set(rows.map(row => row.asn).filter(Boolean));

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>User Agents</span><strong>${fmt(agents.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
        `;
    }

    function populateFilters(rows) {
        const countrySelect = $("#bn-country-filter");
        const agentSelect = $("#bn-agent-filter");

        const countries = [...new Set(rows.map(row => row.country).filter(Boolean))].sort();
        const agents = [...new Set(rows.map(row => row.user_agent).filter(Boolean))].sort();

        if (countrySelect) {
            countrySelect.innerHTML =
                `<option value="">All</option>` +
                countries.map(value => `<option value="${value}">${value}</option>`).join("");
        }

        if (agentSelect) {
            agentSelect.innerHTML =
                `<option value="">All</option>` +
                agents.map(value => `<option value="${value}">${value}</option>`).join("");
        }
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const country = $("#bn-country-filter")?.value || "";
        const agent = $("#bn-agent-filter")?.value || "";

        return RAW_ROWS.filter(row => {
            if (country && row.country !== country) return false;
            if (agent && row.user_agent !== agent) return false;

            if (!search) return true;

            return [
                row.node,
                row.user_agent,
                row.hostname,
                row.city,
                row.country,
                row.asn,
                row.organization
            ].join(" ").toLowerCase().includes(search);
        });
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No reachable nodes matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-node-table-wrap">
                <table class="bn-node-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Agent</th>
                            <th>Height</th>
                            <th>Services</th>
                            <th>Country</th>
                            <th>City</th>
                            <th>ASN</th>
                            <th>Organization</th>
                            <th>Hostname</th>
                            <th>Connected Since</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.slice(0, 1000).map(row => `
                            <tr>
                                <td><span class="bn-node-address">${fmt(row.node)}</span></td>
                                <td><span class="bn-node-agent">${fmt(row.user_agent)}</span></td>
                                <td>${fmt(row.height)}</td>
                                <td><span class="bn-pill-small">${fmt(row.services)}</span></td>
                                <td class="bn-node-country">${fmt(row.country)}</td>
                                <td>${fmt(row.city)}</td>
                                <td>${fmt(row.asn)}</td>
                                <td class="bn-node-org">${fmt(row.organization)}</td>
                                <td>${fmt(row.hostname)}</td>
                                <td>${unix(row.connected_since)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadNodes() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading reachable Bitcoin nodes from ${source} source…`);

        try {
            const data = await getJson(url);

            RAW_ROWS = normalize(data);

            renderSummary(RAW_ROWS);
            populateFilters(RAW_ROWS);
            renderRows(RAW_ROWS);

            setStatus(`Loaded ${fmt(RAW_ROWS.length)} reachable Bitcoin nodes.`, "ok");
        } catch (err) {
            RAW_ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Reachable-node dataset unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadNodes);
        $("#bn-source")?.addEventListener("change", loadNodes);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-country-filter")?.addEventListener("change", rerender);
        $("#bn-agent-filter")?.addEventListener("change", rerender);

        loadNodes();
    });
})();

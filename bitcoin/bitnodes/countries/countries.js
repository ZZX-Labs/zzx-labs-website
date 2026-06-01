(() => {
    "use strict";

    const SOURCES = {

        zzxbitnodes:
            "../api/countries.json",

        originalbitnodes:
            "../api/originalbitnodes/countries.json",

        aggregate:
            "../api/aggregate/zzxbitnodes/latest.json",

        enriched:
            "../api/enriched/zzxbitnodes/latest.json"

    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {

        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
        }

        return String(value);
    }

    function setStatus(message, mode = "") {

        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className =
            `bn-status container ${mode}`.trim();

        el.textContent = message;
    }

    async function getJson(url) {

        const response =
            await fetch(
                `${url}?t=${Date.now()}`,
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText}`
            );
        }

        return await response.json();
    }

    function topValue(map) {

        return (
            [...map.entries()]
                .sort(
                    (a, b) => b[1] - a[1]
                )[0]?.[0]
            || "—"
        );
    }

    function extractNodes(payload) {

        if (
            payload &&
            typeof payload === "object"
        ) {

            if (
                payload.nodes &&
                typeof payload.nodes === "object"
            ) {
                return payload.nodes;
            }

            if (
                payload.reachable_nodes &&
                typeof payload.reachable_nodes === "object"
            ) {
                return payload.reachable_nodes;
            }

            if (
                payload.data &&
                payload.data.nodes
            ) {
                return payload.data.nodes;
            }
        }

        return {};
    }

    function aggregate(nodes) {

        const map =
            new Map();

        const totalNodes =
            Object.keys(nodes || {}).length;

        for (
            const row
            of Object.values(nodes || {})
        ) {

            const country =
                row?.[7]
                || row?.country
                || "Unknown";

            const countryCode =
                row?.[8]
                || row?.country_code
                || country;

            const asn =
                row?.[11]
                || row?.asn;

            const org =
                row?.[12]
                || row?.organization;

            const agent =
                row?.[1]
                || row?.agent;

            if (!map.has(country)) {

                map.set(
                    country,
                    {
                        country,
                        countryCode,
                        nodes: 0,
                        asns: new Set(),
                        agents: new Map(),
                        orgs: new Map()
                    }
                );
            }

            const item =
                map.get(country);

            item.nodes += 1;

            if (asn) {
                item.asns.add(asn);
            }

            if (agent) {

                item.agents.set(
                    agent,
                    (
                        item.agents.get(agent)
                        || 0
                    ) + 1
                );
            }

            if (org) {

                item.orgs.set(
                    org,
                    (
                        item.orgs.get(org)
                        || 0
                    ) + 1
                );
            }
        }

        return [...map.values()]
            .map(item => ({

                country:
                    item.country,

                countryCode:
                    item.countryCode,

                nodes:
                    item.nodes,

                percent:
                    totalNodes
                        ? (
                            (
                                item.nodes
                                / totalNodes
                            ) * 100
                        ).toFixed(2)
                        : "0.00",

                asns:
                    item.asns.size,

                topAgent:
                    topValue(
                        item.agents
                    ),

                topOrg:
                    topValue(
                        item.orgs
                    )
            }));
    }

    function renderSummary(rows) {

        const target =
            $("#bn-summary");

        if (!target) {
            return;
        }

        const totalNodes =
            rows.reduce(
                (sum, row) =>
                    sum + row.nodes,
                0
            );

        target.innerHTML = `
            <article class="bn-card">
                <span>Countries</span>
                <strong>${fmt(rows.length)}</strong>
            </article>

            <article class="bn-card">
                <span>Reachable Nodes</span>
                <strong>${fmt(totalNodes)}</strong>
            </article>

            <article class="bn-card">
                <span>Largest Nation</span>
                <strong>${fmt(rows[0]?.country)}</strong>
            </article>

            <article class="bn-card">
                <span>Largest Node Count</span>
                <strong>${fmt(rows[0]?.nodes)}</strong>
            </article>
        `;
    }

    function filteredRows() {

        const search =
            (
                $("#bn-search")
                    ?.value
                || ""
            )
            .trim()
            .toLowerCase();

        const sort =
            $("#bn-sort")
                ?.value
            || "nodes";

        let rows =
            ROWS.filter(row => {

                if (!search) {
                    return true;
                }

                return [
                    row.country,
                    row.countryCode,
                    row.topOrg,
                    row.topAgent
                ]
                .join(" ")
                .toLowerCase()
                .includes(search);
            });

        if (sort === "country") {

            rows.sort(
                (a, b) =>
                    String(a.country)
                        .localeCompare(
                            String(b.country)
                        )
            );

        } else if (
            sort === "asns"
        ) {

            rows.sort(
                (a, b) =>
                    b.asns
                    - a.asns
            );

        } else {

            rows.sort(
                (a, b) =>
                    b.nodes
                    - a.nodes
            );
        }

        return rows;
    }

    function renderRows(rows) {

        const view =
            $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {

            view.innerHTML = `
                <div class="bn-empty">
                    No country telemetry matched current filters.
                </div>
            `;

            return;
        }

        view.innerHTML = `
            <div class="bn-country-grid">

                ${rows.map(row => `

                    <article class="bn-country-card">

                        <div class="bn-country-header">

                            <div>

                                <div class="bn-country-name">
                                    ${fmt(row.country)}
                                </div>

                                <div class="bn-country-code">
                                    ${fmt(row.countryCode)}
                                </div>

                            </div>

                            <div>

                                <div class="bn-country-nodes">
                                    ${fmt(row.nodes)}
                                </div>

                                <div class="bn-country-percent">
                                    ${fmt(row.percent)}%
                                </div>

                            </div>

                        </div>

                        <div class="bn-country-stats">

                            <div class="bn-country-stat">
                                <span>Observed ASNs</span>
                                <strong>${fmt(row.asns)}</strong>
                            </div>

                            <div class="bn-country-stat">
                                <span>Dominant Agent</span>
                                <strong>${fmt(row.topAgent)}</strong>
                            </div>

                            <div class="bn-country-stat">
                                <span>Largest Organization</span>
                                <strong>${fmt(row.topOrg)}</strong>
                            </div>

                            <div class="bn-country-stat">
                                <span>Network Share</span>
                                <strong>${fmt(row.percent)}%</strong>
                            </div>

                        </div>

                    </article>

                `).join("")}

            </div>
        `;
    }

    function rerender() {

        renderRows(
            filteredRows()
        );
    }

    async function loadCountries() {

        const source =
            $("#bn-source")
                ?.value
            || "zzxbitnodes";

        const url =
            SOURCES[source]
            || SOURCES.zzxbitnodes;

        setStatus(
            `Loading country distribution telemetry from ${source}...`
        );

        try {

            const data =
                await getJson(url);

            ROWS =
                aggregate(
                    extractNodes(data)
                );

            ROWS.sort(
                (a, b) =>
                    b.nodes
                    - a.nodes
            );

            renderSummary(
                ROWS
            );

            renderRows(
                ROWS
            );

            setStatus(
                `Loaded ${fmt(ROWS.length)} country distributions.`,
                "ok"
            );

        } catch (err) {

            ROWS = [];

            renderSummary([]);

            renderRows([]);

            setStatus(
                `Country telemetry unavailable: ${err.message}`,
                "warn"
            );
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            $("#bn-refresh")
                ?.addEventListener(
                    "click",
                    loadCountries
                );

            $("#bn-source")
                ?.addEventListener(
                    "change",
                    loadCountries
                );

            $("#bn-search")
                ?.addEventListener(
                    "input",
                    rerender
                );

            $("#bn-sort")
                ?.addEventListener(
                    "change",
                    rerender
                );

            loadCountries();
        }
    );

})();

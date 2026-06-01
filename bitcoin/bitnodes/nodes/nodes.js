(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/nodes.json",
        originalbitnodes: "../api/originalbitnodes/nodes.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
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

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function unix(value) {
        if (!value) return "—";

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return String(value);
        }

        const ts = n < 10000000000 ? n * 1000 : n;

        try {
            return new Date(ts).toISOString().replace("T", " ").replace(".000Z", " UTC");
        } catch {
            return String(value);
        }
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

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
        if (!data || typeof data !== "object") {
            return {};
        }

        if (data.nodes && typeof data.nodes === "object") {
            return data.nodes;
        }

        if (data.reachable_nodes && typeof data.reachable_nodes === "object") {
            return data.reachable_nodes;
        }

        if (data.data && data.data.nodes && typeof data.data.nodes === "object") {
            return data.data.nodes;
        }

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

        if (Array.isArray(data.rows)) {
            const out = {};

            for (const row of data.rows) {
                const address = row.address || row.node || row.addr || row.host;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        return {};
    }

    function normalizeNode(address, row) {
        if (Array.isArray(row)) {
            return {
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
                organization: row?.[12],
                provider: row?.[13],
                metadata: row?.[19] && typeof row[19] === "object" ? row[19] : {}
            };
        }

        const meta = row?.metadata && typeof row.metadata === "object"
            ? row.metadata
            : {};

        return {
            node: row?.address || row?.node || row?.addr || address,
            protocol: row?.protocol || row?.protocol_version || row?.version,
            user_agent: row?.user_agent || row?.agent || row?.subver,
            connected_since: row?.connected_since || row?.timestamp || row?.seen_at || row?.last_seen,
            services: row?.services || row?.service_bits,
            height: row?.height || row?.start_height || row?.latest_height,
            hostname: row?.hostname || row?.host,
            city: row?.city || meta.city,
            country: row?.country || row?.country_code || meta.country,
            latitude: row?.latitude || row?.lat || meta.latitude,
            longitude: row?.longitude || row?.lon || row?.lng || meta.longitude,
            timezone: row?.timezone || row?.tz || meta.timezone,
            asn: row?.asn || meta.asn,
            organization: row?.organization || row?.org || meta.organization || meta.org,
            provider: row?.provider || meta.provider,
            metadata: meta
        };
    }

    function normalize(data) {
        const nodes = extractNodes(data);

        return Object.entries(nodes).map(([address, row]) => normalizeNode(address, row));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const countries = new Set(rows.map(row => row.country).filter(Boolean));
        const agents = new Set(rows.map(row => row.user_agent).filter(Boolean));
        const asns = new Set(rows.map(row => row.asn).filter(Boolean));

        target.innerHTML = `
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>User Agents</span><strong>${fmt(agents.size)}</strong></article>
            <article class="bn-card"><span>ASNs</span><strong>${fmt(asns.size)}</strong></article>
        `;
    }

    function populateFilters(rows) {
        const countrySelect = $("#bn-country-filter");
        const agentSelect = $("#bn-agent-filter");

        const currentCountry = countrySelect?.value || "";
        const currentAgent = agentSelect?.value || "";

        const countries = [...new Set(rows.map(row => row.country).filter(Boolean))].sort();
        const agents = [...new Set(rows.map(row => row.user_agent).filter(Boolean))].sort();

        if (countrySelect) {
            countrySelect.innerHTML =
                `<option value="">All</option>` +
                countries.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");

            if (countries.includes(currentCountry)) {
                countrySelect.value = currentCountry;
            }
        }

        if (agentSelect) {
            agentSelect.innerHTML =
                `<option value="">All</option>` +
                agents.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");

            if (agents.includes(currentAgent)) {
                agentSelect.value = currentAgent;
            }
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
                row.organization,
                row.provider,
                row.height,
                row.services
            ].join(" ").toLowerCase().includes(search);
        });
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

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
                            <th>Provider</th>
                            <th>Hostname</th>
                            <th>Connected Since</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.slice(0, 1000).map(row => `
                            <tr>
                                <td><span class="bn-node-address">${esc(fmt(row.node))}</span></td>
                                <td><span class="bn-node-agent">${esc(fmt(row.user_agent))}</span></td>
                                <td>${esc(fmt(row.height))}</td>
                                <td><span class="bn-pill-small">${esc(fmt(row.services))}</span></td>
                                <td class="bn-node-country">${esc(fmt(row.country))}</td>
                                <td>${esc(fmt(row.city))}</td>
                                <td>${esc(fmt(row.asn))}</td>
                                <td class="bn-node-org">${esc(fmt(row.organization))}</td>
                                <td class="bn-node-org">${esc(fmt(row.provider))}</td>
                                <td>${esc(fmt(row.hostname))}</td>
                                <td>${esc(unix(row.connected_since))}</td>
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
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading reachable Bitcoin nodes from ${source}...`);

        try {
            const data = await getJson(url);

            RAW_ROWS = normalize(data);

            renderSummary(RAW_ROWS);
            populateFilters(RAW_ROWS);
            renderRows(RAW_ROWS);

            setStatus(`Loaded ${fmt(RAW_ROWS.length)} reachable Bitcoin nodes. Showing first 1,000 matching rows.`, "ok");
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

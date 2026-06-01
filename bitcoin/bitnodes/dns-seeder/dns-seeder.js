(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/dns-seeder.json",
        originalbitnodes: "../api/originalbitnodes/dns-seeder.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/dns-seeder.json",
        external: "../api/dns-seeder.json"
    };

    let RECORDS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
        }

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

    function hostFromAddress(address) {
        const text = String(address || "").trim();

        if (text.startsWith("[") && text.includes("]")) {
            return text.slice(1, text.indexOf("]"));
        }

        if (text.includes(".onion:") || text.includes(".i2p:")) {
            return text.rsplit ? text.rsplit(":", 1)[0] : text.split(":").slice(0, -1).join(":");
        }

        if (text.split(":").length === 2) {
            return text.split(":")[0];
        }

        return text;
    }

    function classifyRecord(address, row) {
        const value = String(address || row?.host || row?.address || "").toLowerCase();

        if (row?.type) {
            return String(row.type).toUpperCase();
        }

        if (row?.tor || row?.is_tor || value.includes(".onion")) {
            return "TXT";
        }

        if (value.includes(":") && !value.includes(".onion")) {
            return "AAAA";
        }

        return "A";
    }

    function pushRecord(rows, type, value, meta = {}) {
        if (!value) {
            return;
        }

        rows.push({
            type,
            value: String(value),
            services: meta.services || "",
            source: meta.source || "",
            height: meta.height || "",
            agent: meta.agent || "",
            country: meta.country || "",
            city: meta.city || "",
            asn: meta.asn || "",
            organization: meta.organization || ""
        });
    }

    function normalizeFromNodes(nodes) {
        const rows = [];

        for (const [address, row] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(row);

            const host = isArray
                ? hostFromAddress(address)
                : hostFromAddress(row.address || row.host || address);

            const type = isArray
                ? classifyRecord(host, {})
                : classifyRecord(host, row);

            pushRecord(rows, type, host, {
                services: isArray ? row[3] : row.services,
                height: isArray ? row[4] : row.height,
                agent: isArray ? row[1] : (row.agent || row.user_agent),
                country: isArray ? row[7] : (row.country || row.country_code),
                city: isArray ? row[6] : row.city,
                asn: isArray ? row[11] : row.asn,
                organization: isArray ? row[12] : (row.organization || row.org)
            });
        }

        return rows;
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data.map(row => ({
                type: String(row.type || "A").toUpperCase(),
                value: row.value || row.address || row.host || "",
                services: row.services || "",
                source: row.source || "",
                height: row.height || "",
                agent: row.agent || "",
                country: row.country || "",
                city: row.city || "",
                asn: row.asn || "",
                organization: row.organization || ""
            })).filter(row => row.value);
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        if (Array.isArray(data.records)) {
            return normalize(data.records);
        }

        if (data.records && typeof data.records === "object") {
            const rows = [];

            for (const type of ["A", "AAAA", "TXT"]) {
                const values = data.records[type] || [];

                for (const value of values) {
                    pushRecord(rows, type, value);
                }
            }

            return rows;
        }

        if (data.nodes && typeof data.nodes === "object") {
            return normalizeFromNodes(data.nodes);
        }

        const rows = [];

        for (const type of ["A", "AAAA", "TXT"]) {
            const values = data[type] || [];

            for (const value of values) {
                pushRecord(rows, type, value);
            }
        }

        return rows;
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const ipv4 = rows.filter(row => row.type === "A").length;
        const ipv6 = rows.filter(row => row.type === "AAAA").length;
        const tor = rows.filter(row => row.type === "TXT").length;

        target.innerHTML = `
            <article class="bn-card"><span>Total Records</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>IPv4 A</span><strong>${fmt(ipv4)}</strong></article>
            <article class="bn-card"><span>IPv6 AAAA</span><strong>${fmt(ipv6)}</strong></article>
            <article class="bn-card"><span>Tor TXT</span><strong>${fmt(tor)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const type = $("#bn-record-type")?.value || "all";

        return RECORDS.filter(row => {
            if (type !== "all" && row.type !== type) {
                return false;
            }

            if (!search) {
                return true;
            }

            return [
                row.value,
                row.services,
                row.agent,
                row.country,
                row.city,
                row.asn,
                row.organization
            ].join(" ").toLowerCase().includes(search);
        });
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No DNS seed records matched current filters.</div>`;
            return;
        }

        const groups = {
            A: [],
            AAAA: [],
            TXT: []
        };

        for (const row of rows) {
            if (!groups[row.type]) {
                groups[row.type] = [];
            }

            groups[row.type].push(row);
        }

        view.innerHTML = `
            <div class="bn-dns-grid">
                ${["A", "AAAA", "TXT"].map(type => {
                    const label = {
                        A: "IPv4 A Records",
                        AAAA: "IPv6 AAAA Records",
                        TXT: "Tor Onion TXT Records"
                    }[type];

                    return `
                        <article class="bn-dns-card">
                            <div class="bn-dns-header">
                                <div class="bn-dns-type">${label}</div>
                                <div class="bn-dns-count">${fmt(groups[type].length)}</div>
                            </div>

                            <div class="bn-dns-body">
                                ${groups[type].map(row => `
                                    <div class="bn-dns-row">
                                        <div class="bn-dns-badge">${esc(type)}</div>
                                        <div class="bn-dns-address">
                                            ${esc(row.value)}
                                            <small>
                                                ${esc([
                                                    row.country,
                                                    row.city,
                                                    row.asn,
                                                    row.organization
                                                ].filter(Boolean).join(" / "))}
                                            </small>
                                        </div>
                                    </div>
                                `).join("")}
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadDnsSeeder() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading DNS seeder telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            RECORDS = normalize(data);

            renderSummary(RECORDS);
            renderRows(RECORDS);

            setStatus(`Loaded ${fmt(RECORDS.length)} DNS seed records.`, "ok");
        } catch (err) {
            RECORDS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`DNS seeder telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadDnsSeeder);
        $("#bn-source")?.addEventListener("change", loadDnsSeeder);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-record-type")?.addEventListener("change", rerender);

        loadDnsSeeder();
    });
})();

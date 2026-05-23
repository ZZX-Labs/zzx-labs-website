(() => {
    "use strict";

    const SOURCES = {
        local: "../api/dns-seeder.json",
        external: "../api/dns-seeder.json"
    };

    let RECORDS = [];

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

    function normalize(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.records)) return data.records;

        const rows = [];

        for (const type of ["A", "AAAA", "TXT"]) {
            const values = data?.[type] || [];

            for (const value of values) {
                rows.push({ type, value });
            }
        }

        return rows;
    }

    function renderSummary(rows) {
        const ipv4 = rows.filter(row => row.type === "A").length;
        const ipv6 = rows.filter(row => row.type === "AAAA").length;
        const tor = rows.filter(row => row.type === "TXT").length;

        $("#bn-summary").innerHTML = `
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
            if (type !== "all" && row.type !== type) return false;
            if (!search) return true;
            return String(row.value).toLowerCase().includes(search);
        });
    }

    function renderRows(rows) {
        const view = $("#bn-view");

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
            if (!groups[row.type]) groups[row.type] = [];
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
                                        <div class="bn-dns-badge">${type}</div>
                                        <div class="bn-dns-address">${fmt(row.value)}</div>
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
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading DNS seeder telemetry from ${source} source…`);

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

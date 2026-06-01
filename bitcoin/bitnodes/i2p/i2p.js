(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/enriched/zzxbitnodes/latest.json",
        originalbitnodes: "../api/enriched/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
    };

    let ROWS = [];

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

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) return;

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
        if (!data || typeof data !== "object") return {};

        if (data.nodes && typeof data.nodes === "object") return data.nodes;
        if (data.reachable_nodes && typeof data.reachable_nodes === "object") return data.reachable_nodes;
        if (data.data && data.data.nodes && typeof data.data.nodes === "object") return data.data.nodes;

        return {};
    }

    function extractPort(address) {
        const text = String(address || "");

        const match = text.match(/:(\d+)$/);

        return match ? match[1] : "Unknown";
    }

    function isI2PNode(address, row, meta) {
        const text = [
            address,
            row?.address,
            row?.node,
            row?.hostname,
            row?.host,
            meta?.hostname,
            meta?.host
        ].join(" ").toLowerCase();

        return Boolean(
            row?.i2p ||
            row?.is_i2p ||
            meta?.i2p ||
            meta?.is_i2p ||
            text.includes(".i2p")
        );
    }

    function normalizeNode(address, row) {
        if (Array.isArray(row)) {
            const meta = row[19] && typeof row[19] === "object" ? row[19] : {};

            return {
                node: address,
                protocol: row?.[0],
                userAgent: row?.[1],
                connectedSince: row?.[2],
                services: row?.[3],
                height: row?.[4],
                hostname: row?.[5],
                city: row?.[6],
                country: row?.[7],
                asn: row?.[11],
                organization: row?.[12],
                provider: row?.[13],
                port: extractPort(address),
                metadata: meta
            };
        }

        const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
        const node = row?.address || row?.node || row?.addr || address;

        return {
            node,
            protocol: row?.protocol || row?.protocol_version || row?.version,
            userAgent: row?.user_agent || row?.agent || row?.subver,
            connectedSince: row?.connected_since || row?.timestamp || row?.seen_at || row?.last_seen,
            services: row?.services || row?.service_bits,
            height: row?.height || row?.start_height || row?.latest_height,
            hostname: row?.hostname || row?.host || meta.hostname || meta.host,
            city: row?.city || meta.city,
            country: row?.country || row?.country_code || meta.country,
            asn: row?.asn || meta.asn,
            organization: row?.organization || row?.org || meta.organization || meta.org,
            provider: row?.provider || meta.provider,
            port: row?.port || extractPort(node),
            metadata: meta
        };
    }

    function normalize(data) {
        const nodes = extractNodes(data);
        const rows = [];

        for (const [address, row] of Object.entries(nodes || {})) {
            const meta = Array.isArray(row)
                ? row[19] && typeof row[19] === "object" ? row[19] : {}
                : row?.metadata && typeof row.metadata === "object" ? row.metadata : {};

            if (!isI2PNode(address, row, meta)) {
                continue;
            }

            rows.push(normalizeNode(address, row));
        }

        return rows;
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const agents = new Set(rows.map(row => row.userAgent).filter(Boolean));
        const protocols = new Set(rows.map(row => row.protocol).filter(Boolean));
        const ports = new Set(rows.map(row => row.port).filter(Boolean));

        target.innerHTML = `
            <article class="bn-card"><span>I2P Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>User Agents</span><strong>${fmt(agents.size)}</strong></article>
            <article class="bn-card"><span>Protocols</span><strong>${fmt(protocols.size)}</strong></article>
            <article class="bn-card"><span>Ports</span><strong>${fmt(ports.size)}</strong></article>
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
                row.services,
                row.port,
                row.organization,
                row.provider
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "protocol") {
            rows.sort((a, b) => num(b.protocol) - num(a.protocol));
        } else if (sort === "agent") {
            rows.sort((a, b) => String(a.userAgent).localeCompare(String(b.userAgent)));
        } else if (sort === "port") {
            rows.sort((a, b) => String(a.port).localeCompare(String(b.port)));
        } else {
            rows.sort((a, b) => num(b.height) - num(a.height));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) return;

        if (!rows.length) {
            view.innerHTML = `<div class="bn-i2p-empty">No reachable I2P nodes matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-i2p-grid">
                ${rows.slice(0, 500).map(row => `
                    <article class="bn-i2p-card">
                        <div class="bn-i2p-address">${esc(fmt(row.node))}</div>
                        <div class="bn-i2p-label">I2P Bitcoin Peer</div>

                        <div class="bn-i2p-meta">
                            <div class="bn-i2p-stat"><span>User Agent</span><strong>${esc(fmt(row.userAgent))}</strong></div>
                            <div class="bn-i2p-stat"><span>Protocol</span><strong>${fmt(row.protocol)}</strong></div>
                            <div class="bn-i2p-stat"><span>Block Height</span><strong>${fmt(row.height)}</strong></div>
                            <div class="bn-i2p-stat"><span>Services</span><strong>${fmt(row.services)}</strong></div>
                            <div class="bn-i2p-stat"><span>Port</span><strong>${esc(fmt(row.port))}</strong></div>
                            <div class="bn-i2p-stat"><span>Hostname</span><strong>${esc(fmt(row.hostname))}</strong></div>
                            <div class="bn-i2p-stat"><span>Organization</span><strong>${esc(fmt(row.organization))}</strong></div>
                            <div class="bn-i2p-stat"><span>Provider</span><strong>${esc(fmt(row.provider))}</strong></div>
                            <div class="bn-i2p-stat"><span>Country</span><strong>${esc(fmt(row.country))}</strong></div>
                            <div class="bn-i2p-stat"><span>Connected Since</span><strong>${esc(unix(row.connectedSince))}</strong></div>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadI2P() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading I2P reachable-node telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => num(b.height) - num(a.height));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} reachable I2P nodes. Showing first 500 matching rows.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`I2P telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadI2P);
        $("#bn-source")?.addEventListener("change", loadI2P);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadI2P();
    });
})();

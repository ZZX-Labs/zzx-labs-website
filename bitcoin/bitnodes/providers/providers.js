(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const API_BASE = "../api";

    function apiPath(source, file) {
        return `${API_BASE}/${source}/${file}`;
    }

    function providerPath(source) {
        return apiPath(source, "providers.json");
    }

    function status(text) {
        const el = $("bn-status");

        if (el) {
            el.textContent = text;
        }
    }

    function fmt(value) {
        const n = Number(value || 0);

        return Number.isFinite(n)
            ? n.toLocaleString()
            : "0";
    }

    function pct(part, total) {
        const a = Number(part || 0);
        const b = Number(total || 0);

        if (!b) {
            return "0.0000%";
        }

        return `${((a / b) * 100).toFixed(4)}%`;
    }

    function safeText(value) {
        return String(value ?? "")
            .replace(/[&<>"']/g, (ch) => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[ch]));
    }

    function looksWrongProvider(name) {
        const text = String(name || "").trim();

        if (!text) {
            return true;
        }

        if (/^\d+(\.\d+)?$/.test(text)) {
            return true;
        }

        if (/^\d+\.\d{3,}$/.test(text)) {
            return true;
        }

        return false;
    }

    async function getJson(url) {
        const res = await fetch(`${url}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error(`${url} returned HTTP ${res.status}`);
        }

        return res.json();
    }

    function card(label, value, sub) {
        return `
            <article class="bn-card">
                <span>${safeText(label)}</span>
                <strong>${safeText(value)}</strong>
                <small>${safeText(sub || "")}</small>
            </article>
        `;
    }

    function renderSummary(payload, rows) {
        const mount = $("bn-summary");

        if (!mount) {
            return;
        }

        const totalProviders = payload.total_providers || rows.length;
        const totalNodes = payload.total_nodes || rows.reduce((n, row) => n + Number(row.total_nodes || 0), 0);
        const badNames = rows.filter((row) => looksWrongProvider(row.provider || row.name)).length;
        const top = rows[0];

        mount.innerHTML = [
            card("Providers", fmt(totalProviders), "unique provider labels"),
            card("Nodes", fmt(totalNodes), "nodes in provider view"),
            card("Top Provider", top ? (top.provider || top.name || "Unknown") : "Unknown", top ? `${fmt(top.total_nodes)} nodes` : ""),
            card("Schema Warnings", fmt(badNames), "decimal/empty provider labels")
        ].join("");
    }

    function renderTable(payload) {
        const mount = $("bn-table");

        if (!mount) {
            return;
        }

        const rows = Array.isArray(payload.results)
            ? payload.results
            : [];

        const totalNodes = payload.total_nodes || rows.reduce((n, row) => n + Number(row.total_nodes || 0), 0);

        if (!rows.length) {
            mount.innerHTML = `<p class="bn-muted">No provider records found.</p>`;
            return;
        }

        mount.innerHTML = `
            <div class="bn-table-wrap">
                <table class="bn-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Provider</th>
                            <th>Nodes</th>
                            <th>Share</th>
                            <th>Reachable</th>
                            <th>IPv4</th>
                            <th>IPv6</th>
                            <th>Tor</th>
                            <th>VPN</th>
                            <th>Proxy</th>
                            <th>Top ASN</th>
                            <th>Top Org</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row, index) => {
                            const provider = row.provider || row.name || "Unknown";
                            const warning = looksWrongProvider(provider)
                                ? " ⚠"
                                : "";

                            return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${safeText(provider)}${warning}</td>
                                    <td>${fmt(row.total_nodes)}</td>
                                    <td>${pct(row.total_nodes, totalNodes)}</td>
                                    <td>${fmt(row.reachable_nodes)}</td>
                                    <td>${fmt(row.ipv4_nodes)}</td>
                                    <td>${fmt(row.ipv6_nodes)}</td>
                                    <td>${fmt(row.tor_nodes)}</td>
                                    <td>${fmt(row.vpn_nodes)}</td>
                                    <td>${fmt(row.proxy_nodes)}</td>
                                    <td>${safeText(row.top_asn || "Unknown")}</td>
                                    <td>${safeText(row.top_organization || "Unknown")}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function load() {
        const sourceEl = $("bn-source");
        const source = sourceEl ? sourceEl.value : "zzxbitnodes";

        status(`Loading provider distribution from ${source}…`);

        const payload = await getJson(providerPath(source));
        const rows = Array.isArray(payload.results) ? payload.results : [];

        renderSummary(payload, rows);
        renderTable(payload);

        status(
            `Loaded ${fmt(payload.total_providers || rows.length)} providers across ` +
            `${fmt(payload.total_nodes || 0)} nodes from ${source}.`
        );
    }

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    ready(() => {
        const refresh = $("bn-refresh");
        const source = $("bn-source");

        if (refresh) {
            refresh.addEventListener("click", () => {
                load().catch((err) => status(`Provider load failed: ${err.message}`));
            });
        }

        if (source) {
            source.addEventListener("change", () => {
                load().catch((err) => status(`Provider load failed: ${err.message}`));
            });
        }

        load().catch((err) => status(`Provider load failed: ${err.message}`));
    });
})();

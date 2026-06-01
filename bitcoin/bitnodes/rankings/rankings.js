(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/leaderboard.json",
        originalbitnodes: "../api/originalbitnodes/leaderboard.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/leaderboard.json",
        external: "https://bitnodes.io/api/v1/nodes/leaderboard/"
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

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
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

        return {};
    }

    function computeNodeScore(address, row) {
        const isArray = Array.isArray(row);

        const protocol = isArray ? num(row[0]) : num(row.protocol || row.protocol_version || row.version);
        const services = isArray ? num(row[3]) : num(row.services || row.service_bits);
        const height = isArray ? num(row[4]) : num(row.height || row.start_height || row.latest_height);
        const connectedSince = isArray ? num(row[2]) : num(row.connected_since || row.timestamp || row.seen_at || row.last_seen);
        const meta = isArray && row[19] && typeof row[19] === "object"
            ? row[19]
            : !isArray && row.metadata && typeof row.metadata === "object"
                ? row.metadata
                : {};

        const uptimeHours = connectedSince
            ? Math.max(0, (Date.now() / 1000 - connectedSince) / 3600)
            : num(meta.uptime_hours);

        const latency = num(meta.latency_ms || row.latency_ms, 300);
        const peerIndex = num(meta.peer_index || row.peer_index || row.health_score);

        const vi = Math.min(1, protocol / 70016);
        const si = Math.min(1, services / 1033);
        const hi = Math.min(1, height / 900000);
        const ai = Math.min(1, uptimeHours / 720);
        const pi = latency > 0 ? Math.max(0, 1 - Math.min(latency, 5000) / 5000) : 0;
        const dli = pi;
        const dui = Math.min(1, uptimeHours / 24);
        const wli = pi;
        const wui = Math.min(1, uptimeHours / 168);
        const mli = pi;
        const mui = Math.min(1, uptimeHours / 720);
        const nsi = si;
        const ni = peerIndex ? Math.min(1, peerIndex / 100) : (vi + si + hi + ai + pi) / 5;
        const bi = Math.min(1, services > 0 ? 0.8 : 0.2);

        const score = (
            vi +
            si +
            hi +
            ai +
            pi +
            dli +
            dui +
            wli +
            wui +
            mli +
            mui +
            nsi +
            ni +
            bi
        ) / 14;

        return {
            node: isArray ? address : (row.address || row.node || row.addr || address),
            peer_index: peerIndex || Number((score * 100).toFixed(6)),
            vi: Number(vi.toFixed(6)),
            si: Number(si.toFixed(6)),
            hi: Number(hi.toFixed(6)),
            ai: Number(ai.toFixed(6)),
            pi: Number(pi.toFixed(6)),
            dli: Number(dli.toFixed(6)),
            dui: Number(dui.toFixed(6)),
            wli: Number(wli.toFixed(6)),
            wui: Number(wui.toFixed(6)),
            mli: Number(mli.toFixed(6)),
            mui: Number(mui.toFixed(6)),
            nsi: Number(nsi.toFixed(6)),
            ni: Number(ni.toFixed(6)),
            bi: Number(bi.toFixed(6))
        };
    }

    function normalizeFromNodes(nodes) {
        return Object.entries(nodes || {})
            .map(([address, row]) => computeNodeScore(address, row))
            .sort((a, b) => num(b.peer_index) - num(a.peer_index))
            .map((row, index) => ({
                rank: index + 1,
                ...row
            }));
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        if (Array.isArray(data.results)) {
            return data.results;
        }

        if (Array.isArray(data.leaderboard)) {
            return data.leaderboard;
        }

        const nodes = extractNodes(data);

        if (Object.keys(nodes).length) {
            return normalizeFromNodes(nodes);
        }

        return [];
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        target.innerHTML = `
            <article class="bn-card"><span>Ranked Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Top Node</span><strong>${esc(fmt(rows[0]?.node))}</strong></article>
            <article class="bn-card"><span>Best Peer Index</span><strong>${fmt(rows[0]?.peer_index)}</strong></article>
            <article class="bn-card"><span>Best Rank</span><strong>${fmt(rows[0]?.rank)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "rank";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.rank,
                row.peer_index
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "peer_index") {
            rows.sort((a, b) => num(b.peer_index) - num(a.peer_index));
        } else if (sort === "node") {
            rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        } else {
            rows.sort((a, b) => num(a.rank) - num(b.rank));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No ranking rows matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-rank-table-wrap">
                <table class="bn-rank-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Node</th>
                            <th>Peer Index</th>
                            <th>VI</th>
                            <th>SI</th>
                            <th>HI</th>
                            <th>AI</th>
                            <th>PI</th>
                            <th>DLI</th>
                            <th>DUI</th>
                            <th>WLI</th>
                            <th>WUI</th>
                            <th>MLI</th>
                            <th>MUI</th>
                            <th>NSI</th>
                            <th>NI</th>
                            <th>BI</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.slice(0, 1000).map(row => `
                            <tr>
                                <td class="bn-rank-number">${fmt(row.rank)}</td>
                                <td class="bn-rank-node">${esc(fmt(row.node))}</td>
                                <td class="bn-score">${fmt(row.peer_index)}</td>
                                <td class="bn-score">${fmt(row.vi)}</td>
                                <td class="bn-score">${fmt(row.si)}</td>
                                <td class="bn-score">${fmt(row.hi)}</td>
                                <td class="bn-score">${fmt(row.ai)}</td>
                                <td class="bn-score">${fmt(row.pi)}</td>
                                <td class="bn-score">${fmt(row.dli)}</td>
                                <td class="bn-score">${fmt(row.dui)}</td>
                                <td class="bn-score">${fmt(row.wli)}</td>
                                <td class="bn-score">${fmt(row.wui)}</td>
                                <td class="bn-score">${fmt(row.mli)}</td>
                                <td class="bn-score">${fmt(row.mui)}</td>
                                <td class="bn-score">${fmt(row.nsi)}</td>
                                <td class="bn-score">${fmt(row.ni)}</td>
                                <td class="bn-score">${fmt(row.bi)}</td>
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

    async function loadRankings() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading rankings from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => num(a.rank) - num(b.rank));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} ranked nodes. Showing first 1,000 matching rows.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Rankings unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadRankings);
        $("#bn-source")?.addEventListener("change", loadRankings);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadRankings();
    });
})();

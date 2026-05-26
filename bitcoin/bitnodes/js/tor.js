(() => {
    "use strict";

    const BN = window.BN || {};

    function percent(part, total) {
        if (!total) {
            return "—";
        }

        return `${((part / total) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function isTorRow(row) {
        return BN.isTor
            ? BN.isTor(row)
            : String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function buildTorRows(rows) {
        return rows
            .filter(isTorRow)
            .map(row => ({
                address: row.address || row.node || "—",
                agent: row.agent || row.user_agent || "—",
                services: row.services || "—",
                port: row.port || "—",
                height: row.height || "—",
                latency_ms: row.latency_ms,
                uptime_seconds: row.uptime_seconds,
                first_seen: row.first_seen || "—",
                last_seen: row.last_seen || "—"
            }));
    }

    function render(target, rows) {
        const torRows = buildTorRows(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">Tor / Onion Nodes</span>
                    <h2>Bitcoin Tor Node Registry</h2>
                    <p>
                        ${BN.formatNumber(torRows.length)} onion nodes detected from
                        ${BN.formatNumber(rows.length)} loaded node records
                        (${percent(torRows.length, rows.length)}).
                    </p>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Node</th>
                                <th>Agent</th>
                                <th>Services</th>
                                <th>Port</th>
                                <th>Height</th>
                                <th>Latency</th>
                                <th>First Seen</th>
                                <th>Last Seen</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${torRows.map(row => `
                                <tr>
                                    <td>${BN.escape(row.address)}</td>
                                    <td>${BN.escape(row.agent)}</td>
                                    <td>${BN.escape(row.services)}</td>
                                    <td>${BN.escape(row.port)}</td>
                                    <td>${BN.escape(BN.formatNumber(row.height))}</td>
                                    <td>${BN.escape(BN.formatMs(row.latency_ms))}</td>
                                    <td>${BN.escape(row.first_seen)}</td>
                                    <td>${BN.escape(row.last_seen)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;

        window.BNSearchInit?.();
        window.BNTables?.init?.();
    }

    async function init() {
        const targets = BN.$$("[data-bn-tor], #bn-tor");

        if (!targets.length) {
            return;
        }

        let rows = BN.state?.rows || [];

        if (!rows.length && window.BNAPI?.fetchLatest) {
            const latest = await window.BNAPI.fetchLatest({
                cacheSeconds: 30
            });

            rows = BN.mapRows(BN.normalizeLatest(latest));
        }

        targets.forEach(target => {
            render(target, rows);
        });
    }

    window.BNTor = {
        init,
        render,
        buildTorRows,
        isTorRow
    };

    BN.ready(init);
})(); 
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

    function buildPortCounts(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const port = String(
                row.port ||
                BN.extractPort?.(row.address || row.node) ||
                "Unknown"
            );

            counts.set(
                port,
                (counts.get(port) || 0) + 1
            );
        });

        return Array.from(counts.entries())
            .map(([port, count]) => ({
                port,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function render(target, rows) {
        const ports = buildPortCounts(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">Listening Ports</span>
                    <h2>Bitcoin Node Port Distribution</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Port</th>
                                <th>Node Count</th>
                                <th>Share</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${ports.map(item => `
                                <tr>
                                    <td>${BN.escape(item.port)}</td>
                                    <td>${BN.formatNumber(item.count)}</td>
                                    <td>${percent(item.count, rows.length)}</td>
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
        const targets = BN.$$("[data-bn-ports], #bn-ports");

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

    window.BNPorts = {
        init,
        render,
        buildPortCounts
    };
})();
(() => {
    "use strict";

    const BN = window.BN || {};

    function formatPercent(part, total) {
        if (!total) {
            return "—";
        }

        return `${((part / total) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function countVersions(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const key = String(
                row.protocol ||
                row.version ||
                "Unknown"
            );

            counts.set(
                key,
                (counts.get(key) || 0) + 1
            );
        });

        return Array.from(counts.entries())
            .map(([version, count]) => ({
                version,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function renderVersionsTable(target, rows) {
        const versions = countVersions(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">Protocol Versions</span>
                    <h2>Bitcoin Node Protocol Version Distribution</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Protocol Version</th>
                                <th>Node Count</th>
                                <th>Share</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${versions.map(item => `
                                <tr>
                                    <td>${BN.escape(item.version)}</td>
                                    <td>${BN.formatNumber(item.count)}</td>
                                    <td>${formatPercent(item.count, rows.length)}</td>
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

    async function initVersions() {
        const targets = BN.$$("[data-bn-versions], #bn-versions");

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
            renderVersionsTable(target, rows);
        });
    }

    window.BNVersions = {
        init: initVersions,
        count: countVersions,
        render: renderVersionsTable
    };
})();
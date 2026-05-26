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

    function countAgents(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const key = String(row.agent || row.user_agent || "Unknown");

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([agent, count]) => ({
                agent,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function renderAgentsTable(target, rows) {
        const agents = countAgents(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">Bitcoin Clients</span>
                    <h2>Bitcoin Node Agent Distribution</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Node Count</th>
                                <th>Share</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${agents.map(item => `
                                <tr>
                                    <td>${BN.escape(item.agent)}</td>
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

    async function initAgents() {
        const targets = BN.$$("[data-bn-agents], #bn-agents");

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
            renderAgentsTable(target, rows);
        });
    }

    window.BNAgents = {
        init: initAgents,
        count: countAgents,
        render: renderAgentsTable
    };

    BN.ready(initAgents);
})(); 
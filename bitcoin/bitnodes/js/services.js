(() => {
    "use strict";

    const BN = window.BN || {};

    const SERVICE_FLAGS = {
        1: "NODE_NETWORK",
        2: "NODE_GETUTXO",
        4: "NODE_BLOOM",
        8: "NODE_WITNESS",
        16: "NODE_XTHIN",
        32: "NODE_COMPACT_FILTERS",
        64: "NODE_NETWORK_LIMITED",
        1024: "NODE_P2P_V2"
    };

    function percent(part, total) {
        if (!total) {
            return "—";
        }

        return `${((part / total) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function parseServices(value) {
        const n = BN.number(value, 0);
        const flags = [];

        Object.entries(SERVICE_FLAGS).forEach(([bit, name]) => {
            if ((n & Number(bit)) !== 0) {
                flags.push(name);
            }
        });

        return flags.length ? flags : ["NONE"];
    }

    function buildServiceCounts(rows) {
        const counts = new Map();

        rows.forEach(row => {
            parseServices(row.services).forEach(flag => {
                counts.set(flag, (counts.get(flag) || 0) + 1);
            });
        });

        return Array.from(counts.entries())
            .map(([service, count]) => ({ service, count }))
            .sort((a, b) => b.count - a.count);
    }

    function render(target, rows) {
        const services = buildServiceCounts(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">Service Flags</span>
                    <h2>Bitcoin Service Bit Distribution</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Service Flag</th>
                                <th>Node Count</th>
                                <th>Share</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${services.map(item => `
                                <tr>
                                    <td>${BN.escape(item.service)}</td>
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
        const targets = BN.$$("[data-bn-services], #bn-services");

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

    window.BNServices = {
        init,
        render,
        parseServices,
        buildServiceCounts
    };

    BN.ready(init);
})(); 
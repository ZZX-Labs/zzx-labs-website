(() => {
    "use strict";

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function $all(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function number(value, fallback = 0) {
        if (window.BN && window.BN.number) {
            return window.BN.number(value, fallback);
        }

        if (window.BNAPI && window.BNAPI.number) {
            return window.BNAPI.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (window.BN && window.BN.formatNumber) {
            return window.BN.formatNumber(value);
        }

        if (window.BNAPI && window.BNAPI.formatNumber) {
            return window.BNAPI.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function escapeHtml(value) {
        if (window.BN && window.BN.escape) {
            return window.BN.escape(value);
        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function percentNumber(part, total) {
        const p = number(part);
        const t = number(total);

        if (!t) {
            return 0;
        }

        return (p / t) * 100;
    }

    function percent(part, total) {
        return `${percentNumber(part, total).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function normalizeLatest(payload) {
        const normalized =
            window.BN && window.BN.normalizeLatest
                ? window.BN.normalizeLatest(payload)
                : null;

        if (normalized) {
            return normalized;
        }

        const nodes =
            payload && payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const total = Object.keys(nodes).length;

        return {
            known_nodes:
                payload?.known_nodes ||
                payload?.total_known_nodes ||
                payload?.total_nodes ||
                total,

            reachable_nodes:
                payload?.reachable_nodes ||
                payload?.total_nodes ||
                total,

            unreachable_nodes:
                payload?.unreachable_nodes ||
                0,

            total_nodes:
                payload?.total_nodes ||
                total,

            updated_at:
                payload?.updated_at ||
                null,

            source:
                payload?.source ||
                "zzx-labs-bitnodes-crawler",

            rows:
                payload?.rows ||
                null,

            nodes
        };
    }

    function inferCounts(latest) {
        const known = number(
            latest.known_nodes ||
            latest.total_known_nodes ||
            latest.total_nodes
        );

        const reachable = number(
            latest.reachable_nodes ||
            latest.total_nodes
        );

        const unreachable = number(
            latest.unreachable_nodes,
            Math.max(0, known - reachable)
        );

        const stale = Math.max(
            0,
            known - reachable - unreachable
        );

        return {
            known,
            reachable,
            unreachable: Math.max(0, unreachable),
            stale,
            reachablePercent: percent(reachable, known),
            unreachablePercent: percent(unreachable, known),
            reachablePercentNumber: percentNumber(reachable, known),
            unreachablePercentNumber: percentNumber(unreachable, known)
        };
    }

    function rowAgent(row) {
        return String(
            row.agent ||
            row.user_agent ||
            row[1] ||
            ""
        );
    }

    function getRows(payload, latest) {
        if (window.BN && window.BN.mapRows) {
            return window.BN.mapRows(latest || payload);
        }

        if (Array.isArray(payload?.rows)) {
            return payload.rows;
        }

        const nodes =
            payload?.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        return Object.entries(nodes).map(([address, values]) => {
            const row = Array.isArray(values) ? values : [];

            return {
                address,
                node: address,
                agent: row[1],
                user_agent: row[1],
                height: row[4],
                services: row[3],
                country: row[7],
                asn: row[11]
            };
        });
    }

    function inferClientCounts(rows) {
        const knots = [];
        const core = [];
        const other = [];

        rows.forEach(row => {
            const agent = rowAgent(row).toLowerCase();

            if (agent.includes("knots")) {
                knots.push(row);
                return;
            }

            if (
                agent.includes("satoshi") ||
                agent.includes("bitcoin core")
            ) {
                core.push(row);
                return;
            }

            other.push(row);
        });

        return {
            knots,
            core,
            other,
            knotsCount: knots.length,
            coreCount: core.length,
            otherCount: other.length,
            total: rows.length,
            knotsPercent: percent(knots.length, rows.length),
            corePercent: percent(core.length, rows.length),
            otherPercent: percent(other.length, rows.length)
        };
    }

    function maxHeight(rows) {
        const heights = rows
            .map(row => number(row.height, null))
            .filter(value => value !== null);

        if (!heights.length) {
            return "—";
        }

        return formatNumber(Math.max(...heights));
    }

    function avgHeight(rows) {
        const heights = rows
            .map(row => number(row.height, null))
            .filter(value => value !== null);

        if (!heights.length) {
            return "—";
        }

        const total = heights.reduce((sum, value) => sum + value, 0);

        return formatNumber(Math.round(total / heights.length));
    }

    function ratio(a, b) {
        if (!b) {
            return "—";
        }

        return (a / b).toLocaleString(undefined, {
            maximumFractionDigits: 4
        });
    }

    function registerChartDatasets(clientCounts, counts) {
        if (!window.BNCharts || !window.BNCharts.registerDataset) {
            return;
        }

        window.BNCharts.registerDataset(
            "known-vs-reachable",
            {
                labels: [
                    "Reachable",
                    "Unreachable"
                ],
                values: [
                    counts.reachable,
                    counts.unreachable
                ]
            }
        );

        window.BNCharts.registerDataset(
            "knots-vs-core",
            {
                labels: [
                    "Bitcoin Knots",
                    "Bitcoin Core",
                    "Other"
                ],
                values: [
                    clientCounts.knotsCount,
                    clientCounts.coreCount,
                    clientCounts.otherCount
                ]
            }
        );

        window.BNCharts.registerDataset(
            "client-heights",
            {
                labels: [
                    "Knots Max Height",
                    "Core Max Height"
                ],
                values: [
                    Math.max(
                        ...clientCounts.knots.map(row => number(row.height, 0)),
                        0
                    ),
                    Math.max(
                        ...clientCounts.core.map(row => number(row.height, 0)),
                        0
                    )
                ]
            }
        );
    }

    function buildKnownReachableMarkup(counts, latest) {
        return `
            <section class="bn-knotsvscore-panel">
                <div class="bn-knotsvscore-header">
                    <div>
                        <h2>Known Nodes vs Reachable Nodes</h2>
                        <p>
                            Persistent crawler registry comparison between all known Bitcoin nodes
                            and nodes reachable during the active crawl window.
                        </p>
                    </div>

                    <span class="bn-knotsvscore-source">
                        ${escapeHtml(latest.source || "zzx-labs-bitnodes-crawler")}
                    </span>
                </div>

                <div class="bn-knotsvscore-grid">
                    <article class="bn-knotsvscore-card">
                        <span>Known Nodes</span>
                        <strong>${formatNumber(counts.known)}</strong>
                        <small>Total persistent node records retained by crawler state.</small>
                    </article>

                    <article class="bn-knotsvscore-card success">
                        <span>Reachable Nodes</span>
                        <strong>${formatNumber(counts.reachable)}</strong>
                        <small>${counts.reachablePercent} of known nodes reachable in the current window.</small>
                    </article>

                    <article class="bn-knotsvscore-card warning">
                        <span>Unreachable Nodes</span>
                        <strong>${formatNumber(counts.unreachable)}</strong>
                        <small>${counts.unreachablePercent} of known nodes currently unreachable.</small>
                    </article>

                    <article class="bn-knotsvscore-card">
                        <span>Updated</span>
                        <strong>${escapeHtml(latest.updated_at || "—")}</strong>
                        <small>Latest crawler export timestamp.</small>
                    </article>
                </div>

                <div class="bn-knotsvscore-bars" aria-label="Known versus reachable node ratio">
                    <div class="bn-knotsvscore-bar-row">
                        <span>Reachable</span>

                        <div class="bn-knotsvscore-bar-track">
                            <div
                                class="bn-knotsvscore-bar-fill reachable"
                                style="width: ${escapeHtml(counts.reachablePercent)};"
                            ></div>
                        </div>

                        <strong>${counts.reachablePercent}</strong>
                    </div>

                    <div class="bn-knotsvscore-bar-row">
                        <span>Unreachable</span>

                        <div class="bn-knotsvscore-bar-track">
                            <div
                                class="bn-knotsvscore-bar-fill unreachable"
                                style="width: ${escapeHtml(counts.unreachablePercent)};"
                            ></div>
                        </div>

                        <strong>${counts.unreachablePercent}</strong>
                    </div>
                </div>
            </section>
        `;
    }

    function buildClientMarkup(clientCounts) {
        return `
            <section class="bn-knotsvscore-panel">
                <div class="bn-knotsvscore-header">
                    <div>
                        <h2>Knots vs Bitcoin Core</h2>
                        <p>
                            Comparative telemetry between Bitcoin Knots and Bitcoin Core nodes
                            detected across the loaded reachable-node registry.
                        </p>
                    </div>

                    <span class="bn-knotsvscore-source">
                        Client Distribution
                    </span>
                </div>

                <div class="bn-card-grid">
                    <article class="bn-card">
                        <span class="bn-card-label">Bitcoin Knots</span>
                        <strong class="bn-card-value">${formatNumber(clientCounts.knotsCount)}</strong>
                        <span class="bn-card-subtitle">${clientCounts.knotsPercent} of loaded nodes.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Bitcoin Core</span>
                        <strong class="bn-card-value">${formatNumber(clientCounts.coreCount)}</strong>
                        <span class="bn-card-subtitle">${clientCounts.corePercent} of loaded nodes.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Other Clients</span>
                        <strong class="bn-card-value">${formatNumber(clientCounts.otherCount)}</strong>
                        <span class="bn-card-subtitle">${clientCounts.otherPercent} alternative or unidentified clients.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Knots/Core Ratio</span>
                        <strong class="bn-card-value">${ratio(clientCounts.knotsCount, clientCounts.coreCount)}</strong>
                        <span class="bn-card-subtitle">Relative Knots prevalence against Core.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Knots Max Height</span>
                        <strong class="bn-card-value">${maxHeight(clientCounts.knots)}</strong>
                        <span class="bn-card-subtitle">Highest reported Knots block height.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Core Max Height</span>
                        <strong class="bn-card-value">${maxHeight(clientCounts.core)}</strong>
                        <span class="bn-card-subtitle">Highest reported Core block height.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Knots Avg Height</span>
                        <strong class="bn-card-value">${avgHeight(clientCounts.knots)}</strong>
                        <span class="bn-card-subtitle">Average reported Knots block height.</span>
                    </article>

                    <article class="bn-card">
                        <span class="bn-card-label">Core Avg Height</span>
                        <strong class="bn-card-value">${avgHeight(clientCounts.core)}</strong>
                        <span class="bn-card-subtitle">Average reported Core block height.</span>
                    </article>
                </div>
            </section>
        `;
    }

    async function render(target) {
        if (!window.BNAPI || !window.BNAPI.fetchLatest) {
            target.innerHTML = `
                <section class="bn-knotsvscore-panel">
                    <p>BNAPI is not loaded. Cannot render known-versus-reachable node comparison.</p>
                </section>
            `;
            return;
        }

        try {
            const payload = await window.BNAPI.fetchLatest({
                cacheSeconds: 30
            });

            const latest = normalizeLatest(payload);
            const rows = getRows(payload, latest);
            const counts = inferCounts(latest);
            const clientCounts = inferClientCounts(rows);

            registerChartDatasets(clientCounts, counts);

            target.innerHTML = `
                ${buildKnownReachableMarkup(counts, latest)}
                ${buildClientMarkup(clientCounts)}
            `;

            window.BNCharts?.renderAll?.();
        } catch (err) {
            target.innerHTML = `
                <section class="bn-knotsvscore-panel">
                    <p>${escapeHtml(err.message || "Could not load known-versus-reachable node data.")}</p>
                </section>
            `;
        }
    }

    function init() {
        $all("[data-bn-knotsvscore], #bn-knotsvscore").forEach(render);
    }

    window.BNKnotsVsCore = {
        init,
        render,
        inferCounts,
        inferClientCounts
    };

    ready(init);
})();
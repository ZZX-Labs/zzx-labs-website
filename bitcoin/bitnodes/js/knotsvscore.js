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
        if (window.BNAPI && window.BNAPI.number) {
            return window.BNAPI.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (window.BNAPI && window.BNAPI.formatNumber) {
            return window.BNAPI.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function percent(part, total) {
        const p = number(part);
        const t = number(total);

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function normalizeLatest(payload) {
        if (window.BNAPI && window.BNAPI.normalizeLatest) {
            return window.BNAPI.normalizeLatest(payload);
        }

        const nodes =
            payload && payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const total = Object.keys(nodes).length;

        return {
            known_nodes: payload?.known_nodes || payload?.total_known_nodes || payload?.total_nodes || total,
            reachable_nodes: payload?.reachable_nodes || payload?.total_nodes || total,
            unreachable_nodes: payload?.unreachable_nodes || 0,
            total_nodes: payload?.total_nodes || total,
            updated_at: payload?.updated_at || null,
            source: payload?.source || "zzx-labs-bitnodes-crawler"
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

        const stale = Math.max(0, known - reachable - unreachable);

        return {
            known,
            reachable,
            unreachable: Math.max(0, unreachable),
            stale: Math.max(0, stale),
            reachablePercent: percent(reachable, known),
            unreachablePercent: percent(unreachable, known)
        };
    }

    function buildMarkup(counts, latest) {
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
                        ${latest.source || "zzx-labs-bitnodes-crawler"}
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
                        <strong>${latest.updated_at || "—"}</strong>
                        <small>Latest crawler export timestamp.</small>
                    </article>
                </div>

                <div class="bn-knotsvscore-bars" aria-label="Known versus reachable node ratio">
                    <div class="bn-knotsvscore-bar-row">
                        <span>Reachable</span>
                        <div class="bn-knotsvscore-bar-track">
                            <div
                                class="bn-knotsvscore-bar-fill reachable"
                                style="width: ${counts.reachablePercent};"
                            ></div>
                        </div>
                        <strong>${counts.reachablePercent}</strong>
                    </div>

                    <div class="bn-knotsvscore-bar-row">
                        <span>Unreachable</span>
                        <div class="bn-knotsvscore-bar-track">
                            <div
                                class="bn-knotsvscore-bar-fill unreachable"
                                style="width: ${counts.unreachablePercent};"
                            ></div>
                        </div>
                        <strong>${counts.unreachablePercent}</strong>
                    </div>
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
            const counts = inferCounts(latest);

            target.innerHTML = buildMarkup(counts, latest);
        } catch (err) {
            target.innerHTML = `
                <section class="bn-knotsvscore-panel">
                    <p>${err.message || "Could not load known-versus-reachable node data."}</p>
                </section>
            `;
        }
    }

    function init() {
        $all("[data-bn-knotsvscore], #bn-knotsvscore").forEach(render);
    }

    window.BNKnotsVsCore = {
        init,
        render
    };

    ready(init);
})();
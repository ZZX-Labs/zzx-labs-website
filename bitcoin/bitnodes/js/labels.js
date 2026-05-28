(() => {
    "use strict";

    const BN = window.BN || {};

    function $all(selector, scope = document) {
        if (BN.$$) {
            return BN.$$(selector, scope);
        }

        return Array.from(scope.querySelectorAll(selector));
    }

    function number(value, fallback = 0) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function escapeHtml(value) {
        if (BN.escape) {
            return BN.escape(value);
        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function percent(part, total) {
        if (BN.percent) {
            return BN.percent(part, total);
        }

        const p = number(part, 0);
        const t = number(total, 0);

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function rows() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function latest() {
        return BN.state?.latest || {};
    }

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function classifyClient(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "core";
        }

        return "other";
    }

    function classifyNetwork(row) {
        if (isTor(row)) {
            return "tor";
        }

        const address = String(row.address || row.node || "");

        if (/^[0-9]+\./.test(address)) {
            return "ipv4";
        }

        if (address.startsWith("[") || address.includes(":")) {
            return "ipv6";
        }

        return "unknown";
    }

    function countWhere(rowsInput, predicate) {
        return rowsInput.reduce((count, row) => predicate(row) ? count + 1 : count, 0);
    }

    function countBy(rowsInput, getter) {
        const map = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
    }

    function buildLabels(rowsInput = rows(), latestInput = latest()) {
        const known = number(
            latestInput.known_nodes ||
            latestInput.total_known_nodes ||
            latestInput.total_nodes ||
            rowsInput.length,
            rowsInput.length
        );

        const reachable = number(
            latestInput.reachable_nodes ||
            latestInput.reachable_now ||
            countWhere(rowsInput, row => row.reachable !== false) ||
            rowsInput.length,
            rowsInput.length
        );

        const unreachable = number(
            latestInput.unreachable_nodes ||
            latestInput.unreachable_now,
            Math.max(0, known - reachable)
        );

        const clientCounts = countBy(rowsInput, classifyClient);
        const networkCounts = countBy(rowsInput, classifyNetwork);
        const countryCounts = countBy(rowsInput, row => row.country || row.country_code || "Unknown");
        const asnCounts = countBy(rowsInput, row => row.asn || "Unknown");
        const portCounts = countBy(rowsInput, row => row.port || "Unknown");

        return [
            {
                label: "Source",
                value: latestInput.source || latestInput.crawler || BN.state?.source || "zzxbitnodes",
                tone: "primary"
            },
            {
                label: "Updated",
                value: latestInput.updated_at || latestInput.timestamp || latestInput.generated_at || "—",
                tone: "muted"
            },
            {
                label: "Known",
                value: formatNumber(known),
                subvalue: "persistent registry",
                tone: "primary"
            },
            {
                label: "Reachable",
                value: formatNumber(reachable),
                subvalue: percent(reachable, known),
                tone: "success"
            },
            {
                label: "Unreachable",
                value: formatNumber(unreachable),
                subvalue: percent(unreachable, known),
                tone: "warning"
            },
            {
                label: "Top Client",
                value: clientCounts[0]?.label || "—",
                subvalue: formatNumber(clientCounts[0]?.value || 0),
                tone: "primary"
            },
            {
                label: "Top Country",
                value: countryCounts[0]?.label || "—",
                subvalue: formatNumber(countryCounts[0]?.value || 0),
                tone: "primary"
            },
            {
                label: "Top ASN",
                value: asnCounts[0]?.label || "—",
                subvalue: formatNumber(asnCounts[0]?.value || 0),
                tone: "muted"
            },
            {
                label: "Top Port",
                value: portCounts[0]?.label || "—",
                subvalue: formatNumber(portCounts[0]?.value || 0),
                tone: "muted"
            },
            {
                label: "Tor",
                value: formatNumber(networkCounts.find(item => item.label === "tor")?.value || 0),
                subvalue: "onion nodes",
                tone: "tor"
            }
        ];
    }

    function renderLabelStrip(target, rowsInput = rows(), latestInput = latest()) {
        const labels = buildLabels(rowsInput, latestInput);

        target.innerHTML = `
            <section class="bn-label-strip-card">
                <header class="bn-label-strip-head">
                    <span class="bn-kicker">Labels</span>
                    <h2>${escapeHtml(target.dataset.title || "Crawler State Labels")}</h2>
                </header>

                <div class="bn-label-strip">
                    ${labels.map(item => `
                        <article class="bn-label-pill is-${escapeHtml(item.tone || "muted")}">
                            <span>${escapeHtml(item.label)}</span>
                            <strong>${escapeHtml(item.value)}</strong>
                            ${item.subvalue ? `<small>${escapeHtml(item.subvalue)}</small>` : ""}
                        </article>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function annotateCards(scope = document) {
        $all(".bn-card", scope).forEach(card => {
            if (card.dataset.bnLabelAnnotated === "true") {
                return;
            }

            card.dataset.bnLabelAnnotated = "true";

            const label = card.querySelector(".bn-card-label");
            const value = card.querySelector(".bn-card-value");

            if (!label || !value) {
                return;
            }

            card.setAttribute(
                "aria-label",
                `${label.textContent.trim()}: ${value.textContent.trim()}`
            );
        });
    }

    function renderAll(scope = document) {
        $all("[data-bn-labels], #bn-labels", scope).forEach(target => {
            renderLabelStrip(target);
        });

        annotateCards(scope);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", event => {
        const eventRows = event.detail?.rows || rows();
        const eventLatest = event.detail?.latest || latest();

        $all("[data-bn-labels], #bn-labels").forEach(target => {
            renderLabelStrip(target, eventRows, eventLatest);
        });

        annotateCards();
    });

    window.BNLabels = {
        init,
        renderAll,
        renderLabelStrip,
        annotateCards,
        buildLabels,
        classifyClient,
        classifyNetwork
    };
})();

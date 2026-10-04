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

    function rows() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
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
            return "Bitcoin Knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "Bitcoin Core";
        }

        return "Other Clients";
    }

    function classifyNetwork(row) {
        if (isTor(row)) {
            return "Tor / Onion";
        }

        const address = String(row.address || row.node || "");

        if (/^[0-9]+\./.test(address)) {
            return "IPv4";
        }

        if (address.startsWith("[") || address.includes(":")) {
            return "IPv6";
        }

        return "Unknown";
    }

    function countBy(rowsInput, getter) {
        const counts = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
    }

    function top(rowsInput, getter, limit = 4) {
        return countBy(rowsInput, getter).slice(0, limit);
    }

    function buildDiagramModel(type, rowsInput = rows()) {
        const total = rowsInput.length;

        if (type === "network-stack") {
            return {
                title: "Bitcoin Network Stack",
                description: "Logical crawler path from discovered node records to analytics surfaces.",
                groups: [
                    {
                        label: "Discovery",
                        nodes: [
                            {
                                label: "DNS Seeds",
                                value: "seed"
                            },
                            {
                                label: "getaddr Peers",
                                value: "peer crawl"
                            },
                            {
                                label: "Persistent State",
                                value: formatNumber(total)
                            }
                        ]
                    },
                    {
                        label: "Classification",
                        nodes: [
                            {
                                label: "Reachability",
                                value: "24h window"
                            },
                            {
                                label: "GeoIP / ASN",
                                value: formatNumber(top(rowsInput, row => row.asn).length)
                            },
                            {
                                label: "Clients",
                                value: formatNumber(top(rowsInput, classifyClient).length)
                            }
                        ]
                    },
                    {
                        label: "Publication",
                        nodes: [
                            {
                                label: "Static JSON API",
                                value: "public"
                            },
                            {
                                label: "Widgets",
                                value: "frontend"
                            },
                            {
                                label: "Registry Backup",
                                value: "private"
                            }
                        ]
                    }
                ]
            };
        }

        if (type === "clients") {
            return {
                title: "Client Ecosystem Diagram",
                description: "Distribution of detected Bitcoin client implementations.",
                groups: [
                    {
                        label: "Bitcoin Clients",
                        nodes: top(rowsInput, classifyClient, 6).map(item => ({
                            label: item.label,
                            value: formatNumber(item.value)
                        }))
                    }
                ]
            };
        }

        if (type === "network-types") {
            return {
                title: "Network Type Diagram",
                description: "IPv4, IPv6, Tor, and unknown node address classes.",
                groups: [
                    {
                        label: "Address Classes",
                        nodes: top(rowsInput, classifyNetwork, 8).map(item => ({
                            label: item.label,
                            value: formatNumber(item.value)
                        }))
                    }
                ]
            };
        }

        return {
            title: "Crawler Data Flow",
            description: "High-level Bitnodes mirror data flow from crawl to display.",
            groups: [
                {
                    label: "Input",
                    nodes: [
                        {
                            label: "Seeds",
                            value: "crawl"
                        },
                        {
                            label: "Peers",
                            value: "probe"
                        }
                    ]
                },
                {
                    label: "Process",
                    nodes: [
                        {
                            label: "Normalize",
                            value: "rows"
                        },
                        {
                            label: "Enrich",
                            value: "geo/asn"
                        }
                    ]
                },
                {
                    label: "Output",
                    nodes: [
                        {
                            label: "API",
                            value: "json"
                        },
                        {
                            label: "UI",
                            value: "widgets"
                        }
                    ]
                }
            ]
        };
    }

    function renderDiagram(target) {
        const type = target.dataset.bnDiagram || "data-flow";
        const model = buildDiagramModel(type);

        target.innerHTML = `
            <section class="bn-diagram-card">
                <header class="bn-diagram-head">
                    <span class="bn-kicker">Diagram</span>
                    <h2>${escapeHtml(model.title)}</h2>
                    <p>${escapeHtml(model.description)}</p>
                </header>

                <div
                    class="bn-diagram-flow"
                    style="--bn-diagram-groups: ${model.groups.length};"
                >
                    ${model.groups.map((group, groupIndex) => `
                        <section class="bn-diagram-group">
                            <header>
                                <span>${escapeHtml(String(groupIndex + 1).padStart(2, "0"))}</span>
                                <strong>${escapeHtml(group.label)}</strong>
                            </header>

                            <div class="bn-diagram-nodes">
                                ${group.nodes.map(node => `
                                    <article class="bn-diagram-node">
                                        <span>${escapeHtml(node.label)}</span>
                                        <strong>${escapeHtml(node.value)}</strong>
                                    </article>
                                `).join("")}
                            </div>
                        </section>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function renderAll(scope = document) {
        $all("[data-bn-diagram], #bn-diagram", scope).forEach(renderDiagram);
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    window.BNDiagrams = {
        init,
        renderAll,
        renderDiagram,
        buildDiagramModel,
        classifyClient,
        classifyNetwork
    };
})();

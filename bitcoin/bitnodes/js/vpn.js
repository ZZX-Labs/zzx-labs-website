(() => {
    "use strict";

    const BN = window.BN || {};

    const VPN_DATA_PATHS = [
        "./data/vpn/vpn-ips.json",
        "./data/vpn/datacenter-asns.json",
        "./data/vpn/vpn-providers.json"
    ];

    const DEFAULT_VPN_PROVIDER_TERMS = [
        "nordvpn",
        "expressvpn",
        "mullvad",
        "proton",
        "protonvpn",
        "private internet access",
        "pia",
        "surfshark",
        "cyberghost",
        "windscribe",
        "torguard",
        "ivpn",
        "airvpn",
        "hide.me",
        "vpn",
        "proxy",
        "hosting",
        "colo",
        "colocation",
        "datacenter",
        "data center",
        "vps",
        "cloud",
        "server"
    ];

    const DEFAULT_DATACENTER_TERMS = [
        "amazon",
        "aws",
        "google",
        "microsoft",
        "azure",
        "oracle",
        "digitalocean",
        "linode",
        "akamai",
        "vultr",
        "ovh",
        "hetzner",
        "leaseweb",
        "contabo",
        "netcup",
        "scaleway",
        "cloudflare",
        "rackspace",
        "choopa",
        "quadranet",
        "m247",
        "datacamp",
        "server",
        "hosting",
        "cloud",
        "colo",
        "datacenter",
        "data center"
    ];

    const state = {
        loaded: false,
        ipSet: new Set(),
        asnSet: new Set(),
        providerTerms: new Set(DEFAULT_VPN_PROVIDER_TERMS),
        datacenterTerms: new Set(DEFAULT_DATACENTER_TERMS)
    };

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .trim();
    }

    function normalizeASN(value) {
        const text = String(value || "")
            .trim()
            .toUpperCase();

        if (!text) {
            return "";
        }

        if (text.startsWith("AS")) {
            return text;
        }

        if (/^\d+$/.test(text)) {
            return `AS${text}`;
        }

        return text;
    }

    function normalizeIP(value) {
        return String(value || "")
            .trim()
            .replace(/^\[/, "")
            .replace(/\]$/, "");
    }

    function extractHost(address) {
        if (BN.extractHost) {
            return BN.extractHost(address);
        }

        const value = String(address || "").trim();

        if (value.startsWith("[") && value.includes("]:")) {
            return value.split("]:")[0].replace("[", "");
        }

        if (value.includes(".onion:")) {
            return value.split(":")[0];
        }

        if ((value.match(/:/g) || []).length === 1) {
            return value.split(":")[0];
        }

        return value;
    }

    async function fetchOptionalJson(path) {
        try {
            const url = BN.path ? BN.path(path) : path;

            const response = await fetch(url, {
                cache: "no-store"
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (_err) {
            return null;
        }
    }

    function ingestList(payload) {
        if (!payload) {
            return;
        }

        const ips =
            payload.ips ||
            payload.vpn_ips ||
            payload.addresses ||
            [];

        const asns =
            payload.asns ||
            payload.vpn_asns ||
            payload.datacenter_asns ||
            [];

        const providers =
            payload.providers ||
            payload.provider_terms ||
            payload.terms ||
            [];

        const datacenterTerms =
            payload.datacenter_terms ||
            [];

        ips.forEach(ip => {
            const normalized = normalizeIP(ip);

            if (normalized) {
                state.ipSet.add(normalized);
            }
        });

        asns.forEach(asn => {
            const normalized = normalizeASN(asn);

            if (normalized) {
                state.asnSet.add(normalized);
            }
        });

        providers.forEach(term => {
            const normalized = normalizeText(term);

            if (normalized) {
                state.providerTerms.add(normalized);
            }
        });

        datacenterTerms.forEach(term => {
            const normalized = normalizeText(term);

            if (normalized) {
                state.datacenterTerms.add(normalized);
            }
        });
    }

    async function loadLists() {
        if (state.loaded) {
            return state;
        }

        for (const path of VPN_DATA_PATHS) {
            const payload = await fetchOptionalJson(path);

            ingestList(payload);
        }

        state.loaded = true;

        return state;
    }

    function hasProviderTerm(row, terms) {
        const text = normalizeText([
            row.provider,
            row.organization,
            row.org,
            row.asn,
            row.hosting_type,
            row.network_type,
            row.hostname
        ].join(" "));

        for (const term of terms) {
            if (term && text.includes(term)) {
                return true;
            }
        }

        return false;
    }

    function classify(row) {
        const host = normalizeIP(
            extractHost(row.address || row.node || "")
        );

        const asn = normalizeASN(row.asn);
        const hostingType = normalizeText(row.hosting_type);
        const networkType = normalizeText(row.network_type);
        const torStatus = normalizeText(row.tor_status);

        const matchedIP =
            host &&
            state.ipSet.has(host);

        const matchedASN =
            asn &&
            state.asnSet.has(asn);

        const matchedProvider =
            hasProviderTerm(
                row,
                state.providerTerms
            );

        const matchedDatacenter =
            hasProviderTerm(
                row,
                state.datacenterTerms
            );

        let classification = "unknown";
        let confidence = 0;
        const reasons = [];

        if (matchedIP) {
            classification = "vpn_or_proxy";
            confidence += 0.6;
            reasons.push("ip_list_match");
        }

        if (matchedASN) {
            classification = "vpn_or_datacenter";
            confidence += 0.35;
            reasons.push("asn_list_match");
        }

        if (matchedProvider) {
            classification = "vpn_or_proxy";
            confidence += 0.25;
            reasons.push("provider_term_match");
        }

        if (
            matchedDatacenter ||
            hostingType.includes("datacenter")
        ) {
            if (classification === "unknown") {
                classification = "datacenter";
            }

            confidence += 0.18;
            reasons.push("datacenter_term_match");
        }

        if (hostingType.includes("residential")) {
            classification = "residential";
            confidence = Math.max(confidence, 0.55);
            reasons.push("residential_hosting_type");
        }

        if (
            networkType === "tor" ||
            torStatus.includes("onion") ||
            (BN.isTor && BN.isTor(row))
        ) {
            classification = "tor";
            confidence = 1.0;
            reasons.push("tor_onion");
        }

        return {
            classification,
            confidence: Math.min(
                1,
                Number(confidence.toFixed(3))
            ),
            reasons
        };
    }

    function buildVPNRows(rows) {
        return rows
            .map(row => ({
                ...row,
                vpn: classify(row)
            }))
            .filter(row => row.vpn.classification !== "unknown")
            .sort((a, b) => b.vpn.confidence - a.vpn.confidence);
    }

    function render(target, rows) {
        const vpnRows = buildVPNRows(rows);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">VPN / Datacenter Heuristics</span>

                    <h2>VPN, Proxy, Cloud, and Residential Classification</h2>

                    <p>
                        ${BN.formatNumber(vpnRows.length)}
                        classified records from
                        ${BN.formatNumber(rows.length)}
                        loaded node records.
                    </p>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                <th>Node</th>
                                <th>Classification</th>
                                <th>Confidence</th>
                                <th>ASN</th>
                                <th>Provider / Org</th>
                                <th>Hosting</th>
                                <th>Network</th>
                                <th>Reasons</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${vpnRows.map(row => `
                                <tr>
                                    <td>${BN.escape(row.address || row.node || "—")}</td>
                                    <td>${BN.escape(row.vpn.classification)}</td>
                                    <td>${BN.escape(Math.round(row.vpn.confidence * 100) + "%")}</td>
                                    <td>${BN.escape(row.asn || "—")}</td>
                                    <td>${BN.escape(row.provider || row.organization || row.org || "—")}</td>
                                    <td>${BN.escape(row.hosting_type || "—")}</td>
                                    <td>${BN.escape(row.network_type || "—")}</td>
                                    <td>${BN.escape(row.vpn.reasons.join(", ") || "—")}</td>
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
        const targets = BN.$$("[data-bn-vpn], #bn-vpn");

        if (!targets.length) {
            return;
        }

        await loadLists();

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

    window.BNVPN = {
        init,
        loadLists,
        classify,
        buildVPNRows,
        render
    };
})();
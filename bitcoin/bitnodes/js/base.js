(() => {
    "use strict";

    const BN = window.BN || {};

    BN.config = {
        ...(BN.config || {}),
        appName: "ZZX-Labs R&D Bitnodes Mirror",
        registryName: "Global Bitcoin Node Crawler Registry",
        defaultSource: "zzxbitnodes",
        defaultCacheSeconds: 30
    };

    BN.state = BN.state || {
        source: "zzxbitnodes",
        latest: null,
        rows: [],
        endpoints: {},
        loadedAt: null
    };

    BN.$ = function $(selector, scope = document) {
        return scope.querySelector(selector);
    };

    BN.$$ = function $$(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    };

    BN.ready = function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    };

    BN.depth = function depth() {
        return document.body?.dataset?.bnDepth || ".";
    };

    BN.cleanDepth = function cleanDepth(value = BN.depth()) {
        return String(value || ".").replace(/\/+$/, "") || ".";
    };

    BN.isAbsoluteUrl = function isAbsoluteUrl(value) {
        return /^https?:\/\//i.test(String(value || ""));
    };

    BN.path = function path(relativePath) {
        const raw = String(relativePath || "");

        if (BN.isAbsoluteUrl(raw)) {
            return raw;
        }

        if (raw.startsWith("./")) {
            return `${BN.cleanDepth()}/${raw.slice(2)}`;
        }

        const clean = raw.replace(/^\/+/, "");

        return `${BN.cleanDepth()}/${clean}`;
    };

    BN.joinPath = function joinPath(base, leaf) {
        const baseText = String(base || "").replace(/\/+$/, "");
        const leafText = String(leaf || "").replace(/^\/+/, "");

        if (!baseText || !leafText) {
            return baseText || leafText || "";
        }

        return `${baseText}/${leafText}`;
    };

    BN.escape = function escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    };

    BN.text = function text(value, fallback = "—") {
        if (value === null || value === undefined || value === "") {
            return fallback;
        }

        return String(value);
    };

    BN.number = function number(value, fallback = null) {
        if (value === null || value === undefined || value === "") {
            return fallback;
        }

        const n = Number(
            String(value)
                .replace(/,/g, "")
                .trim()
        );

        return Number.isFinite(n) ? n : fallback;
    };

    BN.formatNumber = function formatNumber(value) {
        const n = BN.number(value);

        if (n === null) {
            return value === null || value === undefined || value === "" ? "—" : String(value);
        }

        return n.toLocaleString();
    };

    BN.formatCompact = function formatCompact(value) {
        const n = BN.number(value);

        if (n === null) {
            return "—";
        }

        return Intl.NumberFormat(
            undefined,
            {
                notation: "compact",
                maximumFractionDigits: 2
            }
        ).format(n);
    };

    BN.percent = function percent(part, total, digits = 2) {
        const p = BN.number(part, 0);
        const t = BN.number(total, 0);

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: digits
        })}%`;
    };

    BN.percentNumber = function percentNumber(part, total) {
        const p = BN.number(part, 0);
        const t = BN.number(total, 0);

        if (!t) {
            return 0;
        }

        return (p / t) * 100;
    };

    BN.formatMs = function formatMs(value) {
        const n = BN.number(value);

        if (n === null || n <= 0) {
            return "—";
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    };

    BN.formatCoord = function formatCoord(value) {
        const n = BN.number(value);

        return n === null ? "—" : n.toFixed(5);
    };

    BN.formatPeer = function formatPeer(value) {
        const n = BN.number(value);

        return n === null
            ? "—"
            : n.toLocaleString(undefined, {
                maximumFractionDigits: 2
            });
    };

    BN.formatTime = function formatTime(value) {
        if (!value) {
            return "—";
        }

        const n = Number(value);

        if (Number.isFinite(n)) {
            return new Date(n * 1000).toISOString().replace(".000Z", "Z");
        }

        return String(value);
    };

    BN.formatUptime = function formatUptime(row) {
        const direct = row?.uptime_human || row?.uptime;

        if (direct && typeof direct === "string") {
            return direct;
        }

        const seconds = BN.number(row?.uptime_seconds ?? row?.total_uptime);

        if (seconds === null) {
            return "—";
        }

        if (seconds < 60) {
            return `${Math.floor(seconds)}s`;
        }

        const minutes = Math.floor(seconds / 60);

        if (minutes < 60) {
            return `${minutes}m`;
        }

        const hours = Math.floor(minutes / 60);

        if (hours < 24) {
            return `${hours}h ${minutes % 60}m`;
        }

        const days = Math.floor(hours / 24);

        if (days < 7) {
            return `${days}d ${hours % 24}h`;
        }

        const weeks = Math.floor(days / 7);

        if (weeks < 52) {
            return `${weeks}w ${days % 7}d`;
        }

        const years = Math.floor(weeks / 52);

        return `${years}y ${weeks % 52}w`;
    };

    BN.countryFlag = function countryFlag(code) {
        const cc = String(code || "").trim().toUpperCase();

        if (!/^[A-Z]{2}$/.test(cc)) {
            return "";
        }

        return cc
            .split("")
            .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
            .join("");
    };

    BN.extractPort = function extractPort(address) {
        const value = String(address || "");

        if (value.startsWith("[") && value.includes("]:")) {
            return value.split("]:").pop() || "—";
        }

        if (value.includes(":")) {
            return value.split(":").pop() || "—";
        }

        return "—";
    };

    BN.extractHost = function extractHost(address) {
        const value = String(address || "").trim();

        if (value.startsWith("[") && value.includes("]:")) {
            return value.split("]:")[0].replace("[", "");
        }

        if (value.includes(".onion:")) {
            return value.rsplit ? value.rsplit(":", 1)[0] : value.split(":")[0];
        }

        if ((value.match(/:/g) || []).length === 1) {
            return value.split(":")[0];
        }

        return value;
    };

    BN.isTor = function isTor(rowOrAddress, hostname = "", metadata = {}) {
        if (typeof rowOrAddress === "object" && rowOrAddress !== null) {
            const row = rowOrAddress;

            return Boolean(row.tor) ||
                String(row.address || row.node || "").toLowerCase().includes(".onion") ||
                String(row.hostname || "").toLowerCase().includes(".onion") ||
                String(row.network_type || "").toLowerCase() === "tor" ||
                String(row.tor_status || "").toLowerCase().includes("onion");
        }

        return Boolean(metadata.tor) ||
            String(rowOrAddress || "").toLowerCase().includes(".onion") ||
            String(hostname || "").toLowerCase().includes(".onion");
    };

    BN.setStatus = function setStatus(message, mode = "") {
        const el = BN.$("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    };

    BN.dispatch = function dispatch(name, detail = {}) {
        document.dispatchEvent(
            new CustomEvent(
                name,
                {
                    detail
                }
            )
        );
    };

    BN.setState = function setState(patch = {}) {
        BN.state = {
            ...(BN.state || {}),
            ...patch
        };

        return BN.state;
    };

    window.BN = BN;
})();

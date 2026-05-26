(() => {
    "use strict";

    const BN = window.BN || {};

    BN.config = BN.config || {
        appName: "ZZX-Labs R&D Bitnodes Mirror",
        registryName: "Global Bitcoin Node Crawler Registry",
        defaultCacheSeconds: 30
    };

    BN.$ = function $(selector, scope = document) {
        return scope.querySelector(selector);
    };

    BN.$$ = function $$(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    };

    BN.depth = function depth() {
        return document.body.dataset.bnDepth || ".";
    };

    BN.path = function path(relativePath) {
        const base = BN.depth().replace(/\/+$/, "");
        const clean = String(relativePath || "").replace(/^\/+/, "");

        return `${base}/${clean}`;
    };

    BN.escape = function escape(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    };

    BN.number = function number(value, fallback = null) {
        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    };

    BN.formatNumber = function formatNumber(value) {
        const n = BN.number(value);

        if (n === null) {
            return value === null || value === undefined || value === "" ? "—" : String(value);
        }

        return n.toLocaleString();
    };

    BN.formatMs = function formatMs(value) {
        const n = BN.number(value);

        if (n === null || n <= 0) {
            return "—";
        }

        return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
    };

    BN.formatCoord = function formatCoord(value) {
        const n = BN.number(value);

        return n === null ? "—" : n.toFixed(5);
    };

    BN.formatPeer = function formatPeer(value) {
        const n = BN.number(value);

        return n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

    BN.setStatus = function setStatus(message, mode = "") {
        const el = BN.$("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    };

    BN.ready = function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    };

    window.BN = BN;
})();
// contact/key-history/script.js

"use strict";

(function () {
    const DATA_URL = "./data/key-history.json";

    const STATUS = {
        ACTIVE: "active",
        TRANSITIONAL: "transitional",
        RETIRED: "retired"
    };

    const STATUS_LABELS = {
        active: "Active",
        transitional: "Transitional",
        retired: "Retired"
    };

    const DEFAULT_DATA = {
        generated_at: "2026-05-30",
        rotation_policy_days: 90,
        keys: [
            {
                id: "zzx-labs-2026-05-30",
                status: "active",
                label: "ZZX-Labs R&D Public Signing Key",
                fingerprint: "E380 9BF9 E743 3793 95CD 3D1E C135 207D DC09 1042",
                listed_on: "2026-05-30",
                active_from: "2026-05-30",
                active_until: null,
                retired_on: null,
                file: "./keys/active/current.asc",
                designation: "Standard ZZX-Labs R&D release and communications key.",
                reason: "Initial public key-history page standard signing key.",
                primary_use: "Website releases, software releases, firmware packages, hardware documentation, papers, reports, databases, AI/ML models, datasets, detached signatures, checksums, and release manifests.",
                purposes: [
                    "website",
                    "software",
                    "firmware",
                    "hardware",
                    "apps",
                    "ai",
                    "ml",
                    "models",
                    "databases",
                    "datasets",
                    "papers",
                    "reports",
                    "downloads",
                    "checksums",
                    "release manifests"
                ],
                public_key_block: ""
            }
        ]
    };

    function $(selector, root = document) {
        return root.querySelector(selector);
    }

    function $all(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function create(tag, className, text) {
        const el = document.createElement(tag);

        if (className) {
            el.className = className;
        }

        if (typeof text === "string") {
            el.textContent = text;
        }

        return el;
    }

    function normalizeStatus(status) {
        const clean = String(status || "").trim().toLowerCase();

        if (clean === STATUS.ACTIVE || clean === STATUS.TRANSITIONAL || clean === STATUS.RETIRED) {
            return clean;
        }

        return STATUS.RETIRED;
    }

    function formatStatus(status) {
        return STATUS_LABELS[normalizeStatus(status)] || "Retired";
    }

    function parseDate(value) {
        if (!value) {
            return null;
        }

        const date = new Date(`${value}T00:00:00Z`);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date;
    }

    function daysBetween(start, end) {
        const startDate = parseDate(start);
        const endDate = end ? parseDate(end) : new Date();

        if (!startDate || !endDate) {
            return null;
        }

        const ms = endDate.getTime() - startDate.getTime();

        return Math.max(0, Math.floor(ms / 86400000));
    }

    function addDays(dateString, days) {
        const date = parseDate(dateString);

        if (!date || typeof days !== "number") {
            return null;
        }

        date.setUTCDate(date.getUTCDate() + days);

        return date.toISOString().slice(0, 10);
    }

    function sortKeys(keys) {
        return [...keys].sort((a, b) => {
            const aDate = parseDate(a.listed_on || a.active_from || a.retired_on);
            const bDate = parseDate(b.listed_on || b.active_from || b.retired_on);

            const av = aDate ? aDate.getTime() : 0;
            const bv = bDate ? bDate.getTime() : 0;

            return bv - av;
        });
    }

    function getKeys(data) {
        if (Array.isArray(data.keys)) {
            return data.keys;
        }

        const keys = [];

        if (data.active) {
            keys.push(data.active);
        }

        if (Array.isArray(data.transitional)) {
            keys.push(...data.transitional);
        }

        if (Array.isArray(data.retired)) {
            keys.push(...data.retired);
        }

        return keys;
    }

    async function loadJson() {
        try {
            const response = await fetch(DATA_URL, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data || typeof data !== "object") {
                throw new Error("Invalid key-history JSON.");
            }

            return data;
        }
        catch (err) {
            console.warn("Using embedded key-history fallback:", err);
            showLoadNotice("Local key-history JSON was not found. Showing embedded fallback data.");
            return DEFAULT_DATA;
        }
    }

    function showLoadNotice(message) {
        const target = $("#kh-load-notice");

        if (!target) {
            return;
        }

        target.textContent = message;
        target.classList.remove("kh-hidden");
    }

    function renderDashboard(data, keys) {
        const target = $("#kh-dashboard");

        if (!target) {
            return;
        }

        const active = keys.filter((key) => normalizeStatus(key.status) === STATUS.ACTIVE);
        const transitional = keys.filter((key) => normalizeStatus(key.status) === STATUS.TRANSITIONAL);
        const retired = keys.filter((key) => normalizeStatus(key.status) === STATUS.RETIRED);

        const current = active[0] || null;
        const activeAge = current ? daysBetween(current.active_from || current.listed_on, null) : null;
        const rotationDays = Number(data.rotation_policy_days || 90);
        const nextRotation = current ? addDays(current.active_from || current.listed_on, rotationDays) : null;

        const stats = [
            ["Total Keys", String(keys.length)],
            ["Active", String(active.length)],
            ["Transitional", String(transitional.length)],
            ["Retired", String(retired.length)],
            ["Active Key Age", activeAge === null ? "Unknown" : `${activeAge} Days`],
            ["Rotation Policy", `${rotationDays} Days`],
            ["Last Listed", keys[0] ? (keys[0].listed_on || "Unknown") : "Unknown"],
            ["Next Review", nextRotation || "Unknown"]
        ];

        target.textContent = "";

        for (const [label, value] of stats) {
            const card = create("article", "kh-stat-card");
            card.appendChild(create("h3", "", label));
            card.appendChild(create("p", "", value));
            target.appendChild(card);
        }
    }

    function renderActiveKey(keys) {
        const target = $("#kh-active-key");

        if (!target) {
            return;
        }

        const active = keys.find((key) => normalizeStatus(key.status) === STATUS.ACTIVE);

        target.textContent = "";

        if (!active) {
            target.appendChild(create("p", "kh-empty", "No active key is currently listed."));
            return;
        }

        target.appendChild(renderKeyRecord(active, { includeKeyBlock: true }));
    }

    function renderTimeline(keys) {
        const target = $("#kh-key-timeline");

        if (!target) {
            return;
        }

        target.textContent = "";

        if (!keys.length) {
            target.appendChild(create("li", "kh-empty", "No key history entries are available."));
            return;
        }

        for (const key of keys) {
            const status = normalizeStatus(key.status);
            const item = create("li", `kh-timeline-item ${status}`);

            const time = create("time", "", key.listed_on || key.active_from || key.retired_on || "Unknown");
            const body = create("span");

            const strong = create("strong", `kh-${status}`, `${formatStatus(status)}: `);
            body.appendChild(strong);

            body.appendChild(document.createTextNode(key.reason || key.designation || key.label || "Key history event."));
            body.appendChild(create("br"));

            const code = create("code", `kh-fingerprint kh-${status}`, key.fingerprint || "Fingerprint unavailable.");
            body.appendChild(code);

            item.appendChild(time);
            item.appendChild(body);
            target.appendChild(item);
        }
    }

    function renderRecordList(keys) {
        const target = $("#kh-record-list");

        if (!target) {
            return;
        }

        target.textContent = "";

        if (!keys.length) {
            target.appendChild(create("p", "kh-empty", "No key records match the current filter."));
            return;
        }

        for (const key of keys) {
            target.appendChild(renderKeyRecord(key, { includeKeyBlock: false }));
        }
    }

    function renderKeyRecord(key, options = {}) {
        const status = normalizeStatus(key.status);
        const record = create("article", `kh-record ${status}`);
        record.dataset.status = status;

        const header = create("div", "kh-record-header");
        const titleWrap = create("div");
        const title = create("h3", `kh-record-title kh-${status}`, `${formatStatus(status)} — ${key.label || "ZZX-Labs Signing Key"}`);
        const meta = create("p", "kh-record-meta", `Listed: ${key.listed_on || "Unknown"} | Active From: ${key.active_from || "Unknown"} | Retired: ${key.retired_on || "Not retired"}`);

        titleWrap.appendChild(title);
        titleWrap.appendChild(meta);

        const statusPill = create("span", "kh-status-pill");
        statusPill.innerHTML = `<span class="kh-status-dot ${status}"></span>${formatStatus(status)}`;

        header.appendChild(titleWrap);
        header.appendChild(statusPill);

        const body = create("div", "kh-record-body");

        if (key.designation) {
            const p = create("p");
            p.innerHTML = `<strong>Designation:</strong> ${escapeHtml(key.designation)}`;
            body.appendChild(p);
        }

        if (key.primary_use) {
            const p = create("p");
            p.innerHTML = `<strong>Primary Use:</strong> ${escapeHtml(key.primary_use)}`;
            body.appendChild(p);
        }

        const fpLabel = create("p");
        fpLabel.innerHTML = "<strong>Fingerprint:</strong>";
        body.appendChild(fpLabel);

        const fp = create("pre", `kh-fingerprint kh-${status}`, key.fingerprint || "Fingerprint unavailable.");
        body.appendChild(fp);

        const copyRow = create("div", "kh-copy-row");
        const copyFingerprint = create("button", "kh-copy-button", "Copy Fingerprint");
        copyFingerprint.type = "button";
        copyFingerprint.dataset.copy = key.fingerprint || "";
        copyRow.appendChild(copyFingerprint);

        if (key.file) {
            const fileLink = create("a", "kh-small-button", "Open Key File");
            fileLink.href = key.file;
            fileLink.rel = "noopener";
            copyRow.appendChild(fileLink);
        }

        body.appendChild(copyRow);

        if (Array.isArray(key.purposes) && key.purposes.length) {
            const ul = create("ul", "kh-purpose-list");

            for (const purpose of key.purposes) {
                ul.appendChild(create("li", "", purpose));
            }

            body.appendChild(ul);
        }

        if (options.includeKeyBlock && key.public_key_block) {
            const details = create("details", "kh-details");
            const summary = create("summary", "", "Show Public Key Block");
            const block = create("pre", `zzx-code-block kh-key-block kh-${status}`, key.public_key_block);
            details.appendChild(summary);
            details.appendChild(block);
            body.appendChild(details);
        }

        const footer = create("div", "kh-record-footer");

        if (key.reason) {
            footer.appendChild(create("p", "kh-muted", key.reason));
        }
        else {
            footer.appendChild(create("p", "kh-muted", "No rotation reason has been recorded for this key."));
        }

        record.appendChild(header);
        record.appendChild(body);
        record.appendChild(footer);

        return record;
    }

    function setupFilters(keys) {
        const buttons = $all("[data-kh-filter]");
        const listTarget = $("#kh-record-list");

        if (!buttons.length || !listTarget) {
            return;
        }

        function applyFilter(filter) {
            for (const button of buttons) {
                button.setAttribute("aria-pressed", button.dataset.khFilter === filter ? "true" : "false");
            }

            if (filter === "all") {
                renderRecordList(keys);
                return;
            }

            renderRecordList(keys.filter((key) => normalizeStatus(key.status) === filter));
        }

        for (const button of buttons) {
            button.addEventListener("click", () => {
                applyFilter(button.dataset.khFilter || "all");
            });
        }

        applyFilter("all");
    }

    function setupCopyButtons() {
        document.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-copy]");

            if (!button) {
                return;
            }

            const value = button.dataset.copy || "";

            if (!value) {
                return;
            }

            try {
                await navigator.clipboard.writeText(value);
                flashButton(button, "Copied");
            }
            catch (err) {
                fallbackCopy(value);
                flashButton(button, "Copied");
            }
        });
    }

    function flashButton(button, text) {
        const original = button.textContent;
        button.textContent = text;

        window.setTimeout(() => {
            button.textContent = original;
        }, 1300);
    }

    function fallbackCopy(value) {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand("copy");
        }
        catch (err) {
            console.warn("Copy fallback failed:", err);
        }

        document.body.removeChild(textarea);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function init() {
        setupCopyButtons();

        const data = await loadJson();
        const keys = sortKeys(getKeys(data));

        renderDashboard(data, keys);
        renderActiveKey(keys);
        renderTimeline(keys);
        setupFilters(keys);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    }
    else {
        init();
    }
})();

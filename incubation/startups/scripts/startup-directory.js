"use strict";

(function () {
    const DATA_URL = "./_data/startups.json";

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

    async function loadStartups() {
        const fullDirectoryTarget = $("#startup-directory-dynamic");
        const categoryTargets = $all(".startup-directory-dynamic[data-startup-track]");

        if (!fullDirectoryTarget && !categoryTargets.length) {
            return;
        }

        try {
            const response = await fetch(DATA_URL, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(`Unable to load ${DATA_URL}`);
            }

            const data = await response.json();
            const startups = Array.isArray(data.startups) ? data.startups : [];

            if (fullDirectoryTarget) {
                renderDirectory(fullDirectoryTarget, startups);
            }

            for (const target of categoryTargets) {
                renderCategoryTarget(target, startups);
            }
        }
        catch (err) {
            console.warn(err);

            if (fullDirectoryTarget) {
                fullDirectoryTarget.innerHTML = "<p class=\"zzx-empty-state\">Startup data file not loaded. Static directory remains authoritative.</p>";
            }

            for (const target of categoryTargets) {
                target.textContent = "";
            }
        }
    }

    function renderDirectory(target, startups) {
        target.textContent = "";

        const listed = getListed(startups);

        if (!listed.length) {
            target.appendChild(create("p", "zzx-empty-state", "No generated startup records are listed yet."));
            return;
        }

        const groups = groupBy(listed, "track");

        for (const [track, items] of Object.entries(groups)) {
            const section = create("section", "zzx-panel");

            section.appendChild(create("p", "zzx-kicker", track));
            section.appendChild(create("h2", "", track));

            const grid = create("div", "zzx-card-grid");

            for (const startup of items) {
                grid.appendChild(renderCard(startup));
            }

            section.appendChild(grid);
            target.appendChild(section);
        }
    }

    function renderCategoryTarget(target, startups) {
        const track = String(target.dataset.startupTrack || "").trim();

        if (!track) {
            target.textContent = "";
            return;
        }

        const listed = getListed(startups);
        const filtered = listed.filter((startup) => {
            return String(startup.track || "").trim() === track;
        });

        target.textContent = "";

        if (!filtered.length) {
            return;
        }

        for (const startup of filtered) {
            target.appendChild(renderCard(startup));
        }
    }

    function renderCard(startup) {
        const slug = String(startup.slug || "").trim();
        const card = create("a", "zzx-card link-card");

        card.href = slug ? `./${slug}/` : "./";

        card.appendChild(create("p", "zzx-kicker", startup.stage || startup.track || "Startup"));
        card.appendChild(create("h3", "", startup.name || slug || "Unnamed Startup"));
        card.appendChild(create("p", "", startup.summary || "Startup profile pending."));

        const metaText = [
            startup.status || "Status pending",
            startup.posture || "Posture pending",
            startup.region || "Global"
        ].join(" / ");

        card.appendChild(create("p", "", metaText));

        return card;
    }

    function getListed(startups) {
        return startups.filter((startup) => startup && startup.listed_in_directory !== false);
    }

    function groupBy(items, key) {
        return items.reduce((groups, item) => {
            const value = item[key] || "Other";
            groups[value] = groups[value] || [];
            groups[value].push(item);
            return groups;
        }, {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadStartups);
    }
    else {
        loadStartups();
    }
})();

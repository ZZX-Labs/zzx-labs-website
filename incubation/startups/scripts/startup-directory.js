"use strict";

(function () {
    const DATA_URL = "./_data/startups.json";

    function $(selector, root = document) {
        return root.querySelector(selector);
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
        const target = $("#startup-directory-dynamic");

        if (!target) {
            return;
        }

        try {
            const response = await fetch(DATA_URL, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(`Unable to load ${DATA_URL}`);
            }

            const data = await response.json();
            renderDirectory(target, data.startups || []);
        }
        catch (err) {
            console.warn(err);
            target.innerHTML = "<p class=\"zzx-empty-state\">Startup data file not loaded. Static directory remains authoritative.</p>";
        }
    }

    function renderDirectory(target, startups) {
        target.textContent = "";

        const listed = startups.filter((startup) => startup.listed_in_directory !== false);

        if (!listed.length) {
            target.appendChild(create("p", "zzx-empty-state", "No generated startup records are listed yet."));
            return;
        }

        const groups = groupBy(listed, "track");

        for (const [track, items] of Object.entries(groups)) {
            const section = create("section", "zzx-panel");

            const kicker = create("p", "zzx-kicker", track);
            const heading = create("h2", "", track);
            const grid = create("div", "zzx-card-grid");

            for (const startup of items) {
                grid.appendChild(renderCard(startup));
            }

            section.appendChild(kicker);
            section.appendChild(heading);
            section.appendChild(grid);
            target.appendChild(section);
        }
    }

    function renderCard(startup) {
        const card = create("a", "zzx-card link-card");
        card.href = `./${startup.slug}/`;

        card.appendChild(create("p", "zzx-kicker", startup.stage || startup.track || "Startup"));
        card.appendChild(create("h3", "", startup.name || startup.slug));
        card.appendChild(create("p", "", startup.summary || "Startup profile pending."));

        const meta = create("p", "", `${startup.status || "Status pending"} / ${startup.posture || "Posture pending"} / ${startup.region || "Global"}`);
        card.appendChild(meta);

        return card;
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

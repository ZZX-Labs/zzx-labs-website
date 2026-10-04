(() => {
    "use strict";

    const DATA_INDEX = "./data/index.json";

    const FALLBACK_DEPARTMENTS = [
        "executive",
        "technology",
        "design",
        "research",
        "web",
        "software",
        "firmware",
        "hardware",
        "engineering",
        "applications",
        "adult",
        "bitcoin",
        "ai",
        "ml",
        "osint",
        "cyber-investigation",
        "cyber-security",
        "cyber-warfare",
        "drones",
        "uavs",
        "umvs",
        "rovs",
        "usmrovs",
        "ugvs",
        "robotics",
        "droids",
        "droeds",
        "defense",
        "biological-sciences",
        "mycological-sciences",
        "botanical-sciences",
        "chemical-sciences",
        "admin",
        "hr",
        "accounting",
        "payroll",
        "finance",
        "investments",
        "legal",
        "management",
        "security",
        "consulting",
        "lab-staff",
        "technicians"
    ];

    const state = {
        index: null,
        departments: [],
        activeSlug: null,
        activeData: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function titleFromSlug(slug) {
        return String(slug)
            .split("-")
            .map((part) => {
                const upper = ["ai", "ml", "osint", "uavs", "umvs", "rovs", "ugvs", "hr"].includes(part);
                return upper ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
            })
            .join(" ");
    }

    async function readJson(url) {
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
            throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
        }

        return res.json();
    }

    function normalizeIndex(index) {
        if (index && Array.isArray(index.departments)) {
            return index.departments.map((dept) => ({
                slug: dept.slug,
                name: dept.name || titleFromSlug(dept.slug),
                description: dept.description || "",
                accent: dept.accent || "#c0d674",
                headcount_target: dept.headcount_target ?? null,
                data_file: dept.data_file || `./data/${dept.slug}.json`
            }));
        }

        return FALLBACK_DEPARTMENTS.map((slug) => ({
            slug,
            name: titleFromSlug(slug),
            description: "",
            accent: "#c0d674",
            headcount_target: 32,
            data_file: `./data/${slug}.json`
        }));
    }

    function renderDepartmentNav() {
        const nav = $("staff-department-nav");

        if (!nav) {
            return;
        }

        nav.innerHTML = "";

        for (const dept of state.departments) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "staff-department-button";
            btn.textContent = dept.name;
            btn.style.setProperty("--staff-accent", dept.accent || "#c0d674");

            if (dept.slug === state.activeSlug) {
                btn.classList.add("is-active");
                btn.setAttribute("aria-current", "true");
            }

            btn.addEventListener("click", () => {
                loadDepartment(dept.slug);
            });

            nav.appendChild(btn);
        }
    }

    function renderCapabilityMap() {
        const map = $("staff-capability-map");

        if (!map) {
            return;
        }

        map.innerHTML = state.departments.map((dept) => `
            <button type="button"
                    class="zzx-card link-card staff-capability-card"
                    style="--staff-accent:${esc(dept.accent)}"
                    data-staff-department="${esc(dept.slug)}">
                <h3>${esc(dept.name)}</h3>
                <p>${esc(dept.description || "Department profile records loaded from JSON.")}</p>
            </button>
        `).join("");

        map.querySelectorAll("[data-staff-department]").forEach((el) => {
            el.addEventListener("click", () => {
                loadDepartment(el.getAttribute("data-staff-department"));
                const target = $("staff-profiles");
                if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        });
    }

    function renderAvatarLegend() {
        const legend = $("staff-avatar-legend");

        if (!legend) {
            return;
        }

        legend.innerHTML = state.departments.slice(0, 16).map((dept) => `
            <article class="zzx-card" style="--staff-accent:${esc(dept.accent)}">
                <div class="staff-avatar-dot" aria-hidden="true"></div>
                <h3>${esc(dept.name)}</h3>
                <p>${esc(dept.accent)} accent marker for ${esc(dept.name)} public-profile avatars.</p>
            </article>
        `).join("");
    }

    function avatarHtml(member, accent) {
        const avatar = member.avatar || "";
        const label = member.display_name || member.public_title || member.id || "ZZX";
        const initials = String(label).slice(0, 3).toUpperCase();

        if (!avatar) {
            return `<div class="staff-card-avatar staff-avatar-fallback" style="--staff-accent:${esc(accent)}">${esc(initials)}</div>`;
        }

        return `
            <img class="staff-card-avatar"
                 src="${esc(avatar)}"
                 alt="${esc(label)} avatar"
                 loading="lazy"
                 style="--staff-accent:${esc(accent)}"
                 onerror="this.outerHTML='&lt;div class=&quot;staff-card-avatar staff-avatar-fallback&quot; style=&quot;--staff-accent:${esc(accent)}&quot;&gt;${esc(initials)}&lt;/div&gt;'">
        `;
    }

    function chipHtml(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return "";
        }

        return `
            <div class="staff-specialties">
                ${items.slice(0, 8).map((item) => `<span class="staff-chip">${esc(item)}</span>`).join("")}
            </div>
        `;
    }

    function statHtml(stats) {
        if (!stats || typeof stats !== "object") {
            return "";
        }

        const rows = Object.entries(stats)
            .filter(([, value]) => value !== null && value !== undefined)
            .map(([key, value]) => `<span>${esc(key)}: ${esc(value)}</span>`);

        if (rows.length === 0) {
            return "";
        }

        return `<p class="staff-stats">${rows.join(" · ")}</p>`;
    }

    function staffCard(member, dept) {
        const accent = dept.accent || "#c0d674";
        const profile = member.links?.profile || `./${member.slug || member.id || ""}/`;
        const rank = member.rank || member.department || dept.name || "Staff";
        const title = member.public_title || member.display_name || "Staff Profile";

        return `
            <a class="zzx-card link-card staff-profile-card"
               href="${esc(profile)}"
               style="--staff-accent:${esc(accent)}">
                ${avatarHtml(member, accent)}
                <p class="zzx-kicker">${esc(rank)}</p>
                <h3>${esc(member.display_name || title)}</h3>
                <p><strong>${esc(title)}</strong></p>
                <p>${esc(member.bio || "")}</p>
                ${chipHtml(member.specialties)}
                ${statHtml(member.stats)}
                <p class="staff-meta">
                    Status: ${esc(member.status || "Unknown")} ·
                    Visibility: ${esc(member.visibility || "Unlisted")} ·
                    ID: ${esc(member.id || "")}
                </p>
            </a>
        `;
    }

    async function loadDepartment(slug) {
        const dept = state.departments.find((item) => item.slug === slug);

        if (!dept) {
            return;
        }

        state.activeSlug = slug;
        renderDepartmentNav();

        const heading = $("staff-active-heading");
        const description = $("staff-active-description");
        const grid = $("staff-grid");

        if (heading) {
            heading.textContent = `Loading ${dept.name}`;
        }

        if (description) {
            description.textContent = dept.description || "";
        }

        if (grid) {
            grid.innerHTML = `<article class="zzx-card"><h3>Loading</h3><p>Reading ${esc(dept.data_file)}...</p></article>`;
        }

        try {
            const data = await readJson(dept.data_file || `./data/${slug}.json`);
            const department = data.department || dept;
            const staff = Array.isArray(data.staff) ? data.staff : [];

            state.activeData = data;

            if (heading) {
                heading.textContent = department.name || dept.name;
            }

            if (description) {
                const target = department.headcount_target ? ` Target headcount: ${department.headcount_target}.` : "";
                description.textContent = `${department.description || dept.description || ""}${target}`;
            }

            if (grid) {
                if (staff.length === 0) {
                    grid.innerHTML = `<article class="zzx-card"><h3>No Public Records</h3><p>This department JSON loaded, but contains no staff records yet.</p></article>`;
                } else {
                    grid.innerHTML = staff.map((member) => staffCard(member, department)).join("");
                }
            }
        } catch (err) {
            console.error(err);

            if (heading) {
                heading.textContent = dept.name;
            }

            if (description) {
                description.textContent = dept.description || "";
            }

            if (grid) {
                grid.innerHTML = `
                    <article class="zzx-card">
                        <h3>Department Data Missing</h3>
                        <p>Could not load <code>${esc(dept.data_file || `./data/${slug}.json`)}</code>.</p>
                        <p class="staff-meta">${esc(err.message)}</p>
                    </article>
                `;
            }
        }
    }

    async function init() {
        try {
            state.index = await readJson(DATA_INDEX);
        } catch (err) {
            console.warn("Could not load staff/data/index.json; using fallback department list.", err);
            state.index = { departments: null };
        }

        state.departments = normalizeIndex(state.index);
        state.activeSlug = state.departments[0]?.slug || "executive";

        renderDepartmentNav();
        renderCapabilityMap();
        renderAvatarLegend();

        await loadDepartment(state.activeSlug);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

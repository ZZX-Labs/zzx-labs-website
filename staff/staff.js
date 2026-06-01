
(() => {
    "use strict";

    const state = {
        index: null,
        activeSlug: null
    };

    const $ = (id) => document.getElementById(id);

    async function readJson(url) {
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
            throw new Error(`Failed to load ${url}: ${res.status}`);
        }

        return res.json();
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderDepartmentNav() {
        const nav = $("staff-department-nav");

        if (!nav || !state.index) {
            return;
        }

        nav.innerHTML = "";

        for (const dept of state.index.departments) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "staff-department-button";
            btn.textContent = dept.name;
            btn.style.setProperty("--staff-accent", dept.accent || "#c0d674");

            if (dept.slug === state.activeSlug) {
                btn.classList.add("is-active");
            }

            btn.addEventListener("click", () => {
                loadDepartment(dept.slug);
            });

            nav.appendChild(btn);
        }
    }

    function avatarHtml(member, accent) {
        const avatar = escapeHtml(member.avatar);
        const initials = escapeHtml((member.display_name || "ZZX").slice(0, 3).toUpperCase());

        return `
            <img class="staff-card-avatar"
                 src="${avatar}"
                 alt="${escapeHtml(member.display_name)} avatar"
                 loading="lazy"
                 style="--staff-accent:${escapeHtml(accent)}"
                 onerror="this.outerHTML='<div class=&quot;staff-card-avatar staff-avatar-fallback&quot; style=&quot;--staff-accent:${escapeHtml(accent)}&quot;>${initials}</div>'">
        `;
    }

    function staffCard(member, accent) {
        const specialties = Array.isArray(member.specialties)
            ? member.specialties.slice(0, 6)
            : [];

        return `
            <a class="zzx-card link-card staff-profile-card" href="${escapeHtml(member.links?.profile || "#")}" style="--staff-accent:${escapeHtml(accent)}">
                ${avatarHtml(member, accent)}
                <p class="zzx-kicker">${escapeHtml(member.rank || member.department || "Staff")}</p>
                <h3>${escapeHtml(member.display_name)}</h3>
                <p><strong>${escapeHtml(member.public_title || "")}</strong></p>
                <p>${escapeHtml(member.bio || "")}</p>
                <div class="staff-specialties">
                    ${specialties.map((item) => `<span class="staff-chip">${escapeHtml(item)}</span>`).join("")}
                </div>
                <p class="staff-meta">
                    Status: ${escapeHtml(member.status)} · Visibility: ${escapeHtml(member.visibility)} · ID: ${escapeHtml(member.id)}
                </p>
            </a>
        `;
    }

    async function loadDepartment(slug) {
        state.activeSlug = slug;
        renderDepartmentNav();

        const deptMeta = state.index.departments.find((item) => item.slug === slug);

        if (!deptMeta) {
            return;
        }

        const data = await readJson(`./data/${slug}.json`);

        const heading = $("staff-active-heading");
        const description = $("staff-active-description");
        const grid = $("staff-grid");

        if (heading) {
            heading.textContent = data.department.name;
        }

        if (description) {
            description.textContent = `${data.department.description} Target headcount: ${data.department.headcount_target}.`;
        }

        if (grid) {
            grid.innerHTML = data.staff.map((member) => staffCard(member, data.department.accent)).join("");
        }
    }

    async function init() {
        state.index = await readJson("./data/index.json");
        state.activeSlug = state.index.departments[0]?.slug || "executive";
        renderDepartmentNav();
        await loadDepartment(state.activeSlug);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

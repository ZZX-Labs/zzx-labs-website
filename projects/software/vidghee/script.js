// VidGhee page boot: fetch ./manifest.json → hydrate hero, buttons, badges, gallery.
(async function () {
  const $ = (sel) => document.querySelector(sel);

  // DOM refs
  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const descEl    = $("#project-desc");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  // helpers
  const addBtn = (text, href, variant = "solid") => {
    if (!href) return;
    const a = document.createElement("a");
    a.className = "btn" + (variant === "ghost" ? " ghost" : "");
    a.textContent = text;
    a.href = href;
    if (/^https?:\/\//i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    ctaRow.appendChild(a);
  };

  const addBadge = (label, colorDot = true) => {
    const b = document.createElement("span");
    b.className = "badge";
    b.innerHTML = (colorDot ? '<span class="dot"></span>' : '') + label;
    badgesEl.appendChild(b);
  };

  const addImg = (src, alt) => {
    const wrap = document.createElement("figure");
    wrap.className = "image";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    img.alt = alt || "VidGhee screenshot";
    wrap.appendChild(img);
    galleryEl.appendChild(wrap);
  };

  try {
    const res = await fetch("./manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    // text
    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description;

    // logo
    const logo = m.logo || (m.images && m.images[0]);
    if (logoEl && logo) logoEl.src = logo;

    // buttons
    addBtn("Open", m.href || "/projects/software/vidghee/");
    addBtn("GitHub", m.github_url, "ghost");
    addBtn("Docs", m.docs_url, "ghost");
    addBtn("Demo", m.demo_url, "ghost");

    // badges
    const state = (m.state || "pre-release").trim();
    addBadge(state === "released" ? "Released" : state.charAt(0).toUpperCase() + state.slice(1));
    if (Array.isArray(m.versions) && m.versions.length) {
      const latest = m.versions[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);
    }

    // gallery
    const imgs = Array.isArray(m.images) ? m.images : [];
    if (!imgs.length) {
      galHintEl.textContent = "No screenshots yet.";
    } else {
      imgs.forEach((src) => addImg(src, m.title || "VidGhee"));
      galHintEl.textContent = "";
    }
  } catch (e) {
    console.error(e);
    if (ctaRow) {
      const err = document.createElement("p");
      err.className = "muted";
      err.textContent = `Failed to load manifest: ${e.message}`;
      ctaRow.appendChild(err);
    }
  }
})();

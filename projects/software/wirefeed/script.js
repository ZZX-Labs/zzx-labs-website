// WireFeed page boot: fetch ./manifest.json → hydrate hero, buttons, badges, gallery,
// then run a client-side tickers demo by fetching feeds (RSS/Atom/JSON).

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

  const noteEl    = $("#demo-note");
  const modeSel   = $("#mode");
  const limitEl   = $("#limit");
  const queryEl   = $("#query");
  const refreshBt = $("#refresh");

  const marquee   = $("#ticker");
  const marqueeTrack = $("#marquee-track");
  const stack     = $("#stack");
  const grid      = $("#grid");

  // state
  let manifest = null;
  let headlines = [];

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
    img.alt = alt || "WireFeed screenshot";
    wrap.appendChild(img);
    galleryEl.appendChild(wrap);
  };

  function uniq(items, keyFn) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      const k = keyFn(it);
      if (!seen.has(k)) { seen.add(k); out.push(it); }
    }
    return out;
  }

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const items = [...doc.querySelectorAll("item")].map(i => ({
      title: i.querySelector("title")?.textContent?.trim() || "",
      link: i.querySelector("link")?.textContent?.trim() || "",
      date: new Date(i.querySelector("pubDate")?.textContent || Date.now())
    }));
    return items;
  }

  function parseAtom(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const entries = [...doc.querySelectorAll("entry")].map(e => ({
      title: e.querySelector("title")?.textContent?.trim() || "",
      link: e.querySelector("link")?.getAttribute("href") || "",
      date: new Date(e.querySelector("updated")?.textContent || e.querySelector("published")?.textContent || Date.now())
    }));
    return entries;
  }

  function fromJSON(json) {
    // Accept a variety of shapes; try common fields
    const arr = Array.isArray(json?.items) ? json.items
            : Array.isArray(json) ? json
            : Array.isArray(json?.articles) ? json.articles
            : [];
    return arr.map(x => ({
      title: String(x.title || x.headline || "").trim(),
      link: String(x.url || x.link || ""),
      date: new Date(x.date || x.published_at || x.pubDate || Date.now())
    }));
  }

  async function safeFetch(url) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      throw e;
    }
  }

  function maybeProxy(url) {
    const p = manifest?.proxy_url;
    if (!p) return url;
    // naive: encode full upstream URL onto proxy param
    return p + encodeURIComponent(url);
  }

  async function fetchFeed(entry) {
    let type = "rss"; let url = entry;
    if (typeof entry === "object" && entry) {
      type = (entry.type || "rss").toLowerCase();
      url = entry.url || "";
    }
    if (!url) return [];

    // try direct, then proxy
    const tries = [url, maybeProxy(url)];
    let lastErr = null;

    for (const candidate of tries) {
      if (!candidate) continue;
      try {
        const res = await safeFetch(candidate);
        const ct = res.headers.get("content-type") || "";

        if (type === "json" || ct.includes("json")) {
          const j = await res.json();
          return fromJSON(j);
        } else {
          const txt = await res.text();
          // Very loose content-type detection
          if (ct.includes("atom") || /<feed[\s>]/i.test(txt)) return parseAtom(txt);
          return parseRSS(txt);
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn("[wirefeed] feed failed", url, lastErr?.message || lastErr);
    return [];
  }

  async function loadFeeds() {
    const feeds = Array.isArray(manifest?.feeds) ? manifest.feeds : [];
    const limit = Math.max(1, Math.min(100, parseInt(limitEl.value || "20", 10)));
    const query = (queryEl.value || "").trim().toLowerCase();

    let all = [];
    for (const f of feeds) {
      const items = await fetchFeed(f);
      all.push(...items);
    }

    // normalize
    all = all
      .map(x => ({ title: x.title || "", link: x.link || "", date: x.date instanceof Date ? x.date : new Date(x.date || Date.now()) }))
      .filter(x => x.title && x.link);

    // filter / sort / dedupe
    if (query) {
      all = all.filter(x => x.title.toLowerCase().includes(query));
    }
    all.sort((a,b) => b.date - a.date);
    all = uniq(all, x => (x.title + "||" + x.link)).slice(0, limit);

    headlines = all;
  }

  function render() {
    const mode = modeSel.value;

    // toggle sections
    marquee.hidden = mode !== "marquee";
    stack.hidden   = mode !== "stack";
    grid.hidden    = mode !== "grid";

    if (mode === "marquee") {
      marqueeTrack.innerHTML = "";
      // Duplicate list to smooth loop
      const list = [...headlines, ...headlines];
      for (const h of list) {
        const a = document.createElement("a");
        a.href = h.link;
        a.textContent = h.title;
        a.target = "_blank"; a.rel = "noopener noreferrer";
        marqueeTrack.appendChild(a);
      }
      // If nothing, put a placeholder
      if (!list.length) {
        const span = document.createElement("span");
        span.textContent = "No headlines (check CORS or feeds).";
        marqueeTrack.appendChild(span);
      }
    }

    if (mode === "stack") {
      stack.innerHTML = "";
      for (const h of headlines) {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `<a href="${h.link}" target="_blank" rel="noopener noreferrer">${h.title}</a>`;
        stack.appendChild(div);
      }
      if (!headlines.length) stack.innerHTML = `<p class="muted">No headlines.</p>`;
    }

    if (mode === "grid") {
      grid.innerHTML = "";
      for (const h of headlines) {
        const div = document.createElement("div");
        div.className = "tile";
        div.innerHTML = `<a href="${h.link}" target="_blank" rel="noopener noreferrer">${h.title}</a>`;
        grid.appendChild(div);
      }
      if (!headlines.length) grid.innerHTML = `<p class="muted">No headlines.</p>`;
    }
  }

  async function boot() {
    // manifest
    const res = await fetch("./manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    // text / hero
    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    if (manifest.description && descEl) descEl.textContent = manifest.description;

    const logo = manifest.logo || (manifest.images && manifest.images[0]);
    if (logoEl && logo) logoEl.src = logo;

    // buttons
    addBtn("Open", manifest.href || "/projects/software/wirefeed/");
    if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
    if (manifest.docs_url) addBtn("Docs", manifest.docs_url, "ghost");
    if (manifest.huggingface_url) addBtn("Hugging Face", manifest.huggingface_url, "ghost");

    // badges
    const state = (manifest.state || "pre-release").trim();
    addBadge(state === "released" ? "Released" : state.charAt(0).toUpperCase() + state.slice(1));
    if (Array.isArray(manifest.versions) && manifest.versions.length) {
      const latest = manifest.versions[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);
    }

    // gallery
    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    if (!imgs.length) {
      galHintEl.textContent = "No screenshots yet.";
    } else {
      imgs.forEach((src) => addImg(src, manifest.title || "WireFeed"));
      galHintEl.textContent = "";
    }

    // demo
    await loadFeeds();
    render();

    // handlers
    refreshBt.addEventListener("click", async () => { await loadFeeds(); render(); });
    modeSel.addEventListener("change", render);
    limitEl.addEventListener("change", async () => { await loadFeeds(); render(); });
    queryEl.addEventListener("input", async () => { await loadFeeds(); render(); });

    // note about proxy
    if (manifest.proxy_url) {
      noteEl.innerHTML = `Proxy enabled: <code>${manifest.proxy_url}</code>`;
    }
  }

  try { await boot(); }
  catch (e) {
    console.error(e);
    if (ctaRow) {
      const err = document.createElement("p");
      err.className = "muted";
      err.textContent = `Failed to load WireFeed: ${e.message}`;
      ctaRow.appendChild(err);
    }
  }
})();

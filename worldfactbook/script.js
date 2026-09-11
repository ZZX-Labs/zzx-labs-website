/* worldfactbook/script.js — archive portal UI */
(function () {
  "use strict";

  const D = document;
  const API = window.ZZXWorldFactbook;
  if (!API) return;

  const q = (selector, root) => (root || D).querySelector(selector);
  const qa = (selector, root) => Array.from((root || D).querySelectorAll(selector));

  const els = {
    root: q("[data-wfb-root]"),
    statusWrap: q(".wfb-status"),
    status: q("[data-wfb-status]"),
    timeline: q("[data-wfb-timeline]"),
    year: q("[data-wfb-year]"),
    compareYear: q("[data-wfb-compare-year]"),
    entity: q("[data-wfb-entity]"),
    category: q("[data-wfb-category]"),
    visual: q("[data-wfb-visual]"),
    search: q("[data-wfb-search]"),
    editionLabel: q("[data-wfb-edition-label]"),
    viewTitle: q("[data-wfb-view-title]"),
    viewSubtitle: q("[data-wfb-view-subtitle]"),
    textStream: q("[data-wfb-text-stream]"),
    mediaGrid: q("[data-wfb-media-grid]"),
    sourceList: q("[data-wfb-source-list]"),
    resultCount: q("[data-wfb-result-count]"),
    resultContext: q("[data-wfb-result-context]"),
    mediaCount: q("[data-wfb-media-count]"),
    sourceCount: q("[data-wfb-source-count]"),
    empty: q("[data-wfb-empty]"),
    loadMoreWrap: q("[data-wfb-loadmore-wrap]"),
    loadMore: q("[data-wfb-loadmore]"),
    refresh: q("[data-wfb-refresh]"),
    copyLink: q("[data-wfb-copy-link]"),
    navSources: q("[data-wfb-nav-sources]"),
    generated: q("[data-wfb-generated]"),
    statEditions: q("[data-wfb-stat-editions]"),
    statChunks: q("[data-wfb-stat-chunks]"),
    statImages: q("[data-wfb-stat-images]"),
    statSources: q("[data-wfb-stat-sources]"),
    healthStatus: q("[data-wfb-health-status]"),
    healthChunks: q("[data-wfb-health-chunks]"),
    healthCategories: q("[data-wfb-health-categories]"),
    healthImages: q("[data-wfb-health-images]"),
    healthSources: q("[data-wfb-health-sources]"),
    compareLeftYear: q("[data-wfb-compare-left-year]"),
    compareRightYear: q("[data-wfb-compare-right-year]"),
    compareLeft: q("[data-wfb-compare-left]"),
    compareRight: q("[data-wfb-compare-right]"),
    dialog: q("[data-wfb-dialog]"),
    dialogImage: q("[data-wfb-dialog-image]"),
    dialogTitle: q("[data-wfb-dialog-title]"),
    dialogCaption: q("[data-wfb-dialog-caption]"),
    dialogFacts: q("[data-wfb-dialog-facts]"),
    dialogCitation: q("[data-wfb-dialog-citation]"),
    copyCitation: q("[data-wfb-copy-citation]")
  };

  const state = {
    index: null,
    sources: [],
    edition: null,
    chunks: [],
    media: [],
    attributions: new Map(),
    year: null,
    compareYear: "",
    entity: "",
    category: "",
    visualType: "",
    query: "",
    tab: "text",
    visible: 40,
    compareChunks: [],
    loadingToken: 0
  };

  const CATEGORY_LABELS = {
    "raw": "Raw / uncategorized",
    "introduction": "Introduction / Background",
    "geography": "Geography",
    "people-and-society": "People & Society",
    "environment": "Environment",
    "government": "Government",
    "economy": "Economy",
    "energy": "Energy",
    "communications": "Communications",
    "transportation": "Transportation",
    "military-and-security": "Military & Security",
    "terrorism": "Terrorism",
    "transnational-issues": "Transnational Issues",
    "space": "Space"
  };

  function text(value) {
    return String(value == null ? "" : value);
  }

  function fmtInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat("en-US").format(n) : "—";
  }

  function shortHash(value) {
    const s = text(value).trim();
    return s ? s.slice(0, 12) + (s.length > 12 ? "…" : "") : "—";
  }

  function categoryLabel(id) {
    return CATEGORY_LABELS[id] || text(id).replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function setStatus(message, kind) {
    els.status.textContent = message;
    els.statusWrap.classList.remove("is-ready", "is-error");
    if (kind === "ready") els.statusWrap.classList.add("is-ready");
    if (kind === "error") els.statusWrap.classList.add("is-error");
  }

  function element(tag, className, content) {
    const node = D.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function option(select, value, label, selected) {
    const node = D.createElement("option");
    node.value = value;
    node.textContent = label;
    if (selected) node.selected = true;
    select.appendChild(node);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function currentEditionMeta() {
    return (state.index && Array.isArray(state.index.editions))
      ? state.index.editions.find((row) => Number(row.year) === Number(state.year))
      : null;
  }

  function parseHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    return {
      year: params.get("year"),
      category: params.get("category"),
      entity: params.get("entity"),
      tab: params.get("tab"),
      compare: params.get("compare"),
      q: params.get("q")
    };
  }

  function updateHash(replace) {
    const params = new URLSearchParams();
    if (state.year) params.set("year", String(state.year));
    if (state.category) params.set("category", state.category);
    if (state.entity) params.set("entity", state.entity);
    if (state.tab && state.tab !== "text") params.set("tab", state.tab);
    if (state.compareYear) params.set("compare", String(state.compareYear));
    if (state.query) params.set("q", state.query);
    const next = "#" + params.toString();
    if (replace) history.replaceState(null, "", next);
    else if (location.hash !== next) history.pushState(null, "", next);
  }

  function renderStats() {
    const editions = Array.isArray(state.index && state.index.editions) ? state.index.editions : [];
    const available = editions.filter((row) => row.status === "available");
    const chunks = editions.reduce((sum, row) => sum + Number(row.chunks || 0), 0);
    const images = editions.reduce((sum, row) => sum + Number(row.images || 0), 0);
    els.statEditions.textContent = fmtInt(available.length) + " / " + fmtInt(editions.length);
    els.statChunks.textContent = fmtInt(chunks);
    els.statImages.textContent = fmtInt(images);
    els.statSources.textContent = fmtInt(state.sources.length);
  }

  function renderTimeline() {
    clear(els.timeline);
    const editions = Array.isArray(state.index && state.index.editions) ? state.index.editions : [];

    editions.forEach((row) => {
      const button = element("button", "wfb-year", String(row.year));
      button.type = "button";
      button.dataset.status = row.status || "missing";
      button.setAttribute("role", "listitem");
      button.setAttribute("aria-current", Number(row.year) === Number(state.year) ? "true" : "false");
      button.title = String(row.year) + " · " + (row.status || "missing") +
        " · " + fmtInt(row.chunks) + " chunks · " + fmtInt(row.images) + " images";
      button.addEventListener("click", () => {
        selectYear(Number(row.year), true);
      });
      els.timeline.appendChild(button);
    });

    requestAnimationFrame(() => {
      const current = q('.wfb-year[aria-current="true"]', els.timeline);
      if (current) current.scrollIntoView({ block: "nearest", inline: "center" });
    });
  }

  function renderYearSelectors() {
    clear(els.year);
    clear(els.compareYear);
    option(els.compareYear, "", "None", !state.compareYear);

    const editions = Array.isArray(state.index && state.index.editions) ? state.index.editions : [];
    editions.forEach((row) => {
      const suffix = row.status === "available" ? "" : " · unresolved";
      option(els.year, String(row.year), String(row.year) + suffix, Number(row.year) === Number(state.year));
      option(
        els.compareYear,
        String(row.year),
        String(row.year) + suffix,
        String(row.year) === String(state.compareYear)
      );
    });
  }

  function renderCategorySelector() {
    clear(els.category);
    option(els.category, "__all__", "All categories", state.category === "__all__");
    const categories = Array.isArray(state.edition && state.edition.categories) ? state.edition.categories : [];

    categories.forEach((row) => {
      option(
        els.category,
        row.id,
        categoryLabel(row.id) + " (" + fmtInt(row.chunks) + ")",
        state.category === row.id
      );
    });
  }

  function renderEntitySelector() {
    const rows = state.chunks.concat(state.media);
    const entities = API.entities(rows);
    const previous = state.entity;

    clear(els.entity);
    option(els.entity, "", "All entities", !previous);

    entities.forEach((entity) => {
      option(els.entity, entity.key, entity.label + (entity.code && entity.name ? " · " + entity.code : ""), entity.key === previous);
    });

    if (previous && !entities.some((entity) => entity.key === previous)) {
      state.entity = "";
      els.entity.value = "";
    }
  }

  function renderVisualSelector() {
    const types = Array.from(new Set(
      state.media.map((row) => text(row.visual_type).trim()).filter(Boolean)
    )).sort();

    clear(els.visual);
    option(els.visual, "", "All visual types", !state.visualType);
    types.forEach((type) => option(els.visual, type, categoryLabel(type), type === state.visualType));

    if (state.visualType && !types.includes(state.visualType)) {
      state.visualType = "";
      els.visual.value = "";
    }
  }

  function renderHealth() {
    const meta = currentEditionMeta();
    const edition = state.edition || {};
    els.healthStatus.textContent = text(edition.status || meta && meta.status || "unknown");
    els.healthChunks.textContent = fmtInt(edition.chunks != null ? edition.chunks : meta && meta.chunks);
    els.healthCategories.textContent = fmtInt(Array.isArray(edition.categories) ? edition.categories.length : meta && meta.categories);
    els.healthImages.textContent = fmtInt(edition.images != null ? edition.images : meta && meta.images);
    els.healthSources.textContent = fmtInt(Array.isArray(edition.sources) ? edition.sources.length : 0);
  }

  function renderHeader() {
    const cat = state.category && state.category !== "__all__" ? categoryLabel(state.category) : "All categories";
    const entity = state.entity || "All entities";
    els.editionLabel.textContent = "EDITION " + state.year;
    els.viewTitle.textContent = String(state.year) + " · " + cat;
    els.viewSubtitle.textContent = entity === "All entities"
      ? "All entities in the selected archive view."
      : "Filtered entity: " + entity;
  }

  function highlightFragment(value, query) {
    const fragment = D.createDocumentFragment();
    const raw = text(value);
    const needle = text(query).trim();
    if (!needle) {
      fragment.appendChild(D.createTextNode(raw));
      return fragment;
    }

    const lower = raw.toLowerCase();
    const qlower = needle.toLowerCase();
    let start = 0;
    let index;

    while ((index = lower.indexOf(qlower, start)) !== -1) {
      if (index > start) fragment.appendChild(D.createTextNode(raw.slice(start, index)));
      const mark = element("mark", "", raw.slice(index, index + needle.length));
      fragment.appendChild(mark);
      start = index + needle.length;
    }

    if (start < raw.length) fragment.appendChild(D.createTextNode(raw.slice(start)));
    return fragment;
  }

  function recordCard(row, compact) {
    const card = element("article", "wfb-record");
    const head = element("header", "wfb-record__head");
    const identity = element("div", "wfb-record__identity");
    const entity = API.normalizedEntity(row);

    identity.appendChild(element("strong", "", entity.label));
    identity.appendChild(element("span", "", categoryLabel(row.category || "raw")));
    head.appendChild(identity);
    head.appendChild(element("span", "wfb-record__ordinal", "#" + fmtInt(row.ordinal || 0)));
    card.appendChild(head);

    const body = element("div", "wfb-record__body");
    const content = compact && text(row.content).length > 5000
      ? text(row.content).slice(0, 5000) + "\n[…]"
      : text(row.content);
    body.appendChild(highlightFragment(content, state.query));
    card.appendChild(body);

    const foot = element("footer", "wfb-record__foot");
    foot.appendChild(element("span", "", text(row.source_provider || "archive")));
    foot.appendChild(element("span", "", text(row.source_format || "unknown format")));
    foot.appendChild(element("span", "", "source " + shortHash(row.source_sha256)));
    if (row.source_url) {
      const link = element("a", "", "source");
      link.href = row.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      foot.appendChild(link);
    }
    if (row.media_citation_key) {
      foot.appendChild(element("span", "", "[" + row.media_citation_key + "]"));
    }
    card.appendChild(foot);

    return card;
  }

  function filteredChunks() {
    return API.filterRows(state.chunks, {
      entity: state.entity,
      query: state.query
    });
  }

  function filteredMedia() {
    return API.filterRows(state.media, {
      entity: state.entity,
      category: state.category === "__all__" ? "" : state.category,
      visualType: state.visualType,
      query: state.query
    });
  }

  function renderText() {
    clear(els.textStream);
    const rows = filteredChunks();
    const shown = rows.slice(0, state.visible);

    shown.forEach((row) => els.textStream.appendChild(recordCard(row, false)));

    els.resultCount.textContent = fmtInt(rows.length) + (rows.length === 1 ? " record" : " records");
    els.resultContext.textContent = shown.length < rows.length
      ? "showing " + fmtInt(shown.length) + " of " + fmtInt(rows.length)
      : "all matching records";

    els.loadMoreWrap.hidden = shown.length >= rows.length;
    els.empty.hidden = rows.length > 0 || state.tab !== "text";
  }

  function mediaImageURL(row) {
    return API.assetURL(row.path || "");
  }

  function mediaCard(row) {
    const card = element("article", "wfb-media-card");
    const imageWrap = element("button", "wfb-media-card__image");
    imageWrap.type = "button";
    imageWrap.setAttribute("aria-label", "Open image " + text(row.citation_key || row.filename || ""));

    const img = D.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = mediaImageURL(row);
    img.alt = text(row.caption || row.entity_name || row.visual_type || "World Factbook archive image");
    imageWrap.appendChild(img);
    imageWrap.appendChild(element("span", "wfb-media-card__type", text(row.visual_type || "image")));
    imageWrap.addEventListener("click", () => openMediaDialog(row));
    card.appendChild(imageWrap);

    const body = element("div", "wfb-media-card__body");
    body.appendChild(element("strong", "", text(row.caption || row.entity_name || row.filename || "Archive image")));

    const credit = row.credit_status === "explicit" && row.credit
      ? "Credit: " + row.credit
      : "Credit: not printed or recovered in source";
    body.appendChild(element("p", "wfb-media-card__credit", credit));

    const meta = element("div", "wfb-media-card__meta");
    meta.appendChild(element("span", "", "p. " + fmtInt(row.page || 0)));
    meta.appendChild(element("span", "", text(row.citation_key || "")));
    body.appendChild(meta);
    card.appendChild(body);

    return card;
  }

  function renderMedia() {
    clear(els.mediaGrid);
    const rows = filteredMedia();
    rows.forEach((row) => els.mediaGrid.appendChild(mediaCard(row)));
    els.mediaCount.textContent = fmtInt(rows.length) + (rows.length === 1 ? " image" : " images");
    els.empty.hidden = rows.length > 0 || state.tab !== "media";
  }

  function sourceCard(row) {
    const card = element("article", "wfb-source-card");
    const head = element("div", "wfb-source-card__head");
    head.appendChild(element("strong", "", text(row.name || row.source_name || row.identifier || row.source_identifier || "Archive source")));
    head.appendChild(element("span", "wfb-source-card__provider", text(row.provider || row.source_provider || "archive")));
    card.appendChild(head);

    const dl = element("dl");
    const facts = [
      ["Identifier", row.identifier || row.source_identifier],
      ["Format", row.format || row.source_format],
      ["Timestamp", row.timestamp || row.source_timestamp],
      ["SHA-256", row.sha256 || row.source_sha256],
      ["URL", row.url || row.source_url]
    ];

    facts.forEach(([label, value]) => {
      if (!value) return;
      dl.appendChild(element("dt", "", label));
      const dd = element("dd");
      if (label === "URL") {
        const link = element("a", "", text(value));
        link.href = value;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        dd.appendChild(link);
      } else {
        dd.textContent = text(value);
      }
      dl.appendChild(dd);
    });

    card.appendChild(dl);
    return card;
  }

  function renderSources() {
    clear(els.sourceList);
    const sources = Array.isArray(state.edition && state.edition.sources) ? state.edition.sources : [];
    sources.forEach((row) => els.sourceList.appendChild(sourceCard(row)));
    els.sourceCount.textContent = fmtInt(sources.length) + (sources.length === 1 ? " source" : " sources");
    els.empty.hidden = sources.length > 0 || state.tab !== "sources";
  }

  async function loadCompare() {
    clear(els.compareLeft);
    clear(els.compareRight);
    els.compareLeftYear.textContent = String(state.year || "—");
    els.compareRightYear.textContent = state.compareYear ? String(state.compareYear) : "Select a year";

    if (!state.compareYear) {
      els.compareRight.appendChild(element("div", "wfb-empty", "Choose a comparison year from the sidebar."));
      state.compareChunks = [];
      return;
    }

    const leftRows = filteredChunks().slice(0, 20);
    leftRows.forEach((row) => els.compareLeft.appendChild(recordCard(row, true)));

    try {
      const edition = await API.edition(state.compareYear);
      const ids = state.category === "__all__"
        ? (edition.categories || []).map((row) => row.id)
        : [state.category];

      state.compareChunks = await API.loadCategories(state.compareYear, ids);
      const rightRows = API.filterRows(state.compareChunks, {
        entity: state.entity,
        query: state.query
      }).slice(0, 20);

      if (!rightRows.length) {
        els.compareRight.appendChild(element("div", "wfb-empty", "No matching records in this edition."));
      } else {
        rightRows.forEach((row) => els.compareRight.appendChild(recordCard(row, true)));
      }
    } catch (error) {
      els.compareRight.appendChild(element("div", "wfb-empty", "Comparison edition is unavailable."));
    }
  }

  function renderTab() {
    qa("[data-wfb-tab]").forEach((button) => {
      const active = button.dataset.wfbTab === state.tab;
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    qa("[data-wfb-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.wfbPanel !== state.tab;
    });

    if (state.tab === "text") renderText();
    if (state.tab === "media") renderMedia();
    if (state.tab === "sources") renderSources();
    if (state.tab === "compare") loadCompare();

    updateHash(true);
  }

  function renderAll() {
    renderTimeline();
    renderYearSelectors();
    renderCategorySelector();
    renderEntitySelector();
    renderVisualSelector();
    renderHealth();
    renderHeader();
    renderText();
    renderMedia();
    renderSources();
    renderTab();
  }

  async function loadEditionData(refresh) {
    const token = ++state.loadingToken;
    state.visible = 40;
    setStatus("Loading " + state.year + " edition…");

    try {
      const edition = await API.edition(state.year, { refresh });
      if (token !== state.loadingToken) return;

      state.edition = edition;
      const availableCategories = Array.isArray(edition.categories) ? edition.categories.map((row) => row.id) : [];

      if (!state.category || (state.category !== "__all__" && !availableCategories.includes(state.category))) {
        state.category = availableCategories.includes("geography")
          ? "geography"
          : (availableCategories[0] || "__all__");
      }

      const ids = state.category === "__all__" ? availableCategories : [state.category];

      const [chunks, media, attributions] = await Promise.all([
        API.loadCategories(state.year, ids, { refresh }),
        API.media(state.year, { refresh }).catch(() => ({ images: [] })),
        API.attributions(state.year, { refresh }).catch(() => ({ images: [] }))
      ]);

      if (token !== state.loadingToken) return;

      state.chunks = Array.isArray(chunks) ? chunks : [];
      state.media = Array.isArray(media && media.images) ? media.images : [];
      state.attributions = new Map(
        (Array.isArray(attributions && attributions.images) ? attributions.images : [])
          .map((row) => [row.citation_key, row])
      );

      renderAll();

      const status = edition.status === "available" ? "Archive ready" : "Edition unresolved";
      setStatus(status + " · " + state.year, edition.status === "available" ? "ready" : "");
    } catch (error) {
      if (token !== state.loadingToken) return;
      state.edition = null;
      state.chunks = [];
      state.media = [];
      renderAll();
      setStatus("Failed to load " + state.year + " edition", "error");
      console.error(error);
    }
  }

  async function reloadCategory() {
    if (!state.edition) return;
    const categories = Array.isArray(state.edition.categories) ? state.edition.categories.map((row) => row.id) : [];
    const ids = state.category === "__all__" ? categories : [state.category];
    state.visible = 40;
    state.chunks = await API.loadCategories(state.year, ids);
    renderEntitySelector();
    renderHeader();
    renderText();
    if (state.tab === "compare") loadCompare();
    updateHash(true);
  }

  function selectYear(year, pushHash) {
    if (!Number.isFinite(Number(year))) return;
    state.year = Number(year);
    state.entity = "";
    state.visualType = "";
    if (pushHash) updateHash(false);
    loadEditionData(false);
  }

  function openMediaDialog(row) {
    if (!els.dialog || !row) return;

    els.dialogImage.src = mediaImageURL(row);
    els.dialogImage.alt = text(row.caption || row.entity_name || "World Factbook archive image");
    els.dialogTitle.textContent = text(row.citation_key || row.filename || "Archive image");
    els.dialogCaption.textContent = text(row.caption || "");

    clear(els.dialogFacts);
    const facts = [
      ["Edition", row.edition_year],
      ["Entity", row.entity_name || row.entity_code || "Global"],
      ["Category", categoryLabel(row.category || "raw")],
      ["Visual type", row.visual_type || "image"],
      ["Page", row.page || "—"],
      ["Dimensions", row.width && row.height ? row.width + " × " + row.height : "—"],
      ["OCR confidence", row.ocr_confidence != null ? row.ocr_confidence : "—"],
      ["Recognition", row.recognition_method || "—"],
      ["Credit", row.credit_status === "explicit" ? row.credit : "not found in source"],
      ["Source", row.source_provider || "archive"],
      ["Source SHA", row.source_sha256 || "—"],
      ["Image SHA", row.sha256 || "—"]
    ];

    facts.forEach(([label, value]) => {
      els.dialogFacts.appendChild(element("dt", "", label));
      els.dialogFacts.appendChild(element("dd", "", text(value)));
    });

    const attribution = state.attributions.get(row.citation_key);
    els.dialogCitation.textContent = text(
      row.citation ||
      attribution && attribution.citation ||
      "[" + text(row.citation_key) + "] " + text(row.attribution || "")
    );

    if (typeof els.dialog.showModal === "function") els.dialog.showModal();
    else els.dialog.setAttribute("open", "");
  }

  async function copyText(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1200);
    } catch (_) {
      // Clipboard can be denied on non-secure local origins.
    }
  }

  function bind() {
    els.year.addEventListener("change", () => selectYear(Number(els.year.value), true));

    els.compareYear.addEventListener("change", () => {
      state.compareYear = els.compareYear.value;
      if (state.tab === "compare") loadCompare();
      updateHash(true);
    });

    els.entity.addEventListener("change", () => {
      state.entity = els.entity.value;
      state.visible = 40;
      renderHeader();
      renderText();
      renderMedia();
      if (state.tab === "compare") loadCompare();
      updateHash(true);
    });

    els.category.addEventListener("change", async () => {
      state.category = els.category.value;
      await reloadCategory();
      renderMedia();
    });

    els.visual.addEventListener("change", () => {
      state.visualType = els.visual.value;
      renderMedia();
      updateHash(true);
    });

    let searchTimer = 0;
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = els.search.value.trim();
        state.visible = 40;
        renderText();
        renderMedia();
        if (state.tab === "compare") loadCompare();
        updateHash(true);
      }, 120);
    });

    qa("[data-wfb-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.wfbTab;
        renderTab();
      });
    });

    els.navSources.addEventListener("click", (event) => {
      event.preventDefault();
      state.tab = "sources";
      renderTab();
      q("[data-wfb-panel='sources']").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.loadMore.addEventListener("click", () => {
      state.visible += 40;
      renderText();
    });

    els.refresh.addEventListener("click", async () => {
      API.clearCache();
      await loadEditionData(true);
    });

    els.copyLink.addEventListener("click", () => {
      updateHash(true);
      copyText(location.href, els.copyLink);
    });

    els.copyCitation.addEventListener("click", () => {
      copyText(els.dialogCitation.textContent || "", els.copyCitation);
    });

    window.addEventListener("hashchange", () => {
      const h = parseHash();
      if (h.year && Number(h.year) !== Number(state.year)) {
        state.year = Number(h.year);
        loadEditionData(false);
      }
    });
  }

  async function init() {
    bind();
    const hash = parseHash();

    try {
      const [index, sourceIndex] = await Promise.all([
        API.portalIndex(),
        API.sourceIndex().catch(() => ({ sources: [] }))
      ]);

      state.index = index;
      state.sources = Array.isArray(sourceIndex && sourceIndex.sources) ? sourceIndex.sources : [];

      const editions = Array.isArray(index.editions) ? index.editions : [];
      const available = editions.filter((row) => row.status === "available");

      const hashYear = Number(hash.year);
      state.year = Number.isFinite(hashYear) && editions.some((row) => Number(row.year) === hashYear)
        ? hashYear
        : Number((available[available.length - 1] || editions[editions.length - 1] || {}).year || index.end_year || 2025);

      state.category = hash.category || "";
      state.entity = hash.entity || "";
      state.tab = ["text", "media", "sources", "compare"].includes(hash.tab) ? hash.tab : "text";
      state.compareYear = hash.compare || "";
      state.query = hash.q || "";
      els.search.value = state.query;

      renderStats();
      renderTimeline();
      renderYearSelectors();

      if (index.generated_at) {
        const stamp = new Date(index.generated_at);
        els.generated.textContent = Number.isNaN(stamp.getTime())
          ? "Generated " + index.generated_at
          : "Index generated " + stamp.toLocaleString();
      }

      await loadEditionData(false);
      updateHash(true);
    } catch (error) {
      setStatus("World Factbook archive index unavailable", "error");
      els.viewTitle.textContent = "Archive unavailable";
      els.viewSubtitle.textContent = "Could not load ./api/portal-index.json.";
      console.error(error);
    }
  }

  init();
})();

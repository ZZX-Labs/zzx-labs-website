// BitFig — unified page boot + in-browser bitcoin.conf generator (no deps)
(function () {
  /* --------------- Tiny utils --------------- */
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escAttr = (s) => String(s).replace(/"/g, '&quot;');
  const cap = (s) => (s = String(s || ""), s.charAt(0).toUpperCase() + s.slice(1));
  const isHttp = (u) => /^https?:\/\//i.test(String(u||""));

  /* --------------- Elements --------------- */
  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");

  const descEl    = $("#project-description");
  const metaList  = $("#meta-list");
  const tagList   = $("#tag-list");
  const verList   = $("#version-list");
  const linkList  = $("#link-list");

  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  const formArea  = $("#bitfig-form-area");
  const outCfg    = $("#output-config");
  const btnGen    = $("#btn-generate");
  const btnDl     = $("#btn-download");

  /* --------------- Boot (load manifest.json) --------------- */
  (async function boot () {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();

      // Hero
      if (m.title) titleEl.textContent = m.title;
      if (m.blurb) blurbEl.textContent = m.blurb;
      const logo = m.logo || (Array.isArray(m.images) && m.images[0]);
      if (logo) logoEl.src = logo;

      // CTAs
      addBtn("Open", m.href, "solid");
      addBtn("GitHub", m.github_url, "ghost");
      addBtn("Docs", m.docs_url, "ghost");
      addBtn("Website", m.website_url, "ghost");
      addBtn("Download", m.download_url, "alt");
      (m.downloads || []).forEach(d => addBtn(d.label || "Download", d.url, "alt"));

      // Badges
      addBadge(cap(m.state || "alpha"));
      const latest = normalizeVersions(m.versions || [])[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);

      // Overview + Meta
      if (m.description) descEl.textContent = m.description;
      const meta = [];
      if (m.slug)    meta.push(li("Slug", m.slug));
      if (m.state)   meta.push(li("State", m.state));
      if (m.license) meta.push(li("License", m.license));
      if (m.href)    meta.push(liLink("URL", m.href));
      metaList.innerHTML = meta.join("") || '<li class="muted">No meta yet.</li>';

      // Tags
      tagList.innerHTML = "";
      (m.tags || []).forEach(t => { const li = document.createElement("li"); li.textContent = t; tagList.appendChild(li); });
      if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

      // Versions
      verList.innerHTML = "";
      normalizeVersions(m.versions || []).forEach(v => {
        const li = document.createElement("li");
        li.textContent = v.date ? `${v.version} — ${v.date}${v.notes ? ` — ${v.notes}` : ""}` : v.version;
        verList.appendChild(li);
      });
      if (!verList.children.length) verList.innerHTML = '<li class="muted">No versions yet.</li>';

      // Links block
      linkList.innerHTML = "";
      linkOf("Website", m.website_url);
      linkOf("Docs", m.docs_url);
      linkOf("GitHub", m.github_url);
      linkOf("Hugging Face", m.huggingface_url);
      linkOf("README", m.readme_url);
      linkOf("LICENSE", m.license_url);
      linkOf("Demo", m.demo_url);
      linkOf("Open", m.href);
      (m.resources || []).forEach(r => linkOf(r.label || "Resource", r.url));

      // Media / gallery
      const media = mergeMedia(m.images, m.media);
      if (!media.length) galHintEl.textContent = "No screenshots yet — add paths in manifest.json.";
      else { galHintEl.textContent = ""; media.forEach(addMedia); }

    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
    }

    // Wire mini builder form
    renderBitFigForm();
    btnGen?.addEventListener("click", () => outCfg.value = buildBitcoinConf());
    btnDl?.addEventListener("click", () => downloadText("bitcoin.conf", outCfg.value || "# (empty)\n"));
  })();

  /* --------------- UI helpers --------------- */
  function addBtn(text, href, style = "solid") {
    if (!href) return;
    const a = document.createElement("a");
    a.className = "btn" + (style === "ghost" ? " ghost" : (style === "alt" ? " alt" : ""));
    a.textContent = text; a.href = href;
    if (isHttp(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    ctaRow.appendChild(a);
  }
  function addBadge(label, dot = true) {
    const b = document.createElement("span");
    b.className = "badge";
    b.innerHTML = (dot ? '<span class="dot"></span>' : '') + esc(label);
    badgesEl.appendChild(b);
  }
  function li(label, value) { return `<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`; }
  function liLink(label, url) {
    if (!url) return "";
    const safe = escAttr(url);
    const ext  = isHttp(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<li><strong>${esc(label)}:</strong> <a href="${safe}"${ext}>${safe}</a></li>`;
  }
  function linkOf(label, url) {
    if (!url) return;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = url; a.textContent = label;
    if (isHttp(url)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    li.appendChild(a); linkList.appendChild(li);
  }
  function mergeMedia(images, media) {
    const imgs = Array.isArray(images) ? images.map(src => ({ type: "image", src })) : [];
    const med  = Array.isArray(media) ? media : [];
    return imgs.concat(med);
  }
  function addMedia(item) {
    const wrap = document.createElement("figure"); wrap.className = "image";
    if (item.type === "video") {
      const v = document.createElement("video");
      v.src = item.src; v.controls = true; v.preload = "metadata";
      if (item.poster) v.poster = item.poster;
      wrap.appendChild(v);
    } else if (item.type === "embed") {
      const i = document.createElement("iframe");
      i.src = item.src; i.loading = "lazy";
      i.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      i.allowFullscreen = true; i.style.width = "100%"; i.style.minHeight = "260px";
      wrap.appendChild(i);
    } else {
      const img = document.createElement("img");
      img.src = item.src; img.alt = item.alt || "Project media"; img.loading = "lazy"; img.decoding = "async";
      wrap.appendChild(img);
    }
    galleryEl.appendChild(wrap);
  }
  function normalizeVersions(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(v => (typeof v === "string" ? { version: v } : v)).filter(Boolean);
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => { URL.revokeObjectURL(a.href); a.remove(); });
  }

  /* --------------- BitFig mini builder --------------- */
  function renderBitFigForm() {
    // Build minimal, legible form UI
    formArea.innerHTML = `
      <form id="bitfig-form" class="core-form" autocomplete="off">
        <div class="row">
          <label>Preset
            <select id="bf-preset">
              <option value="fullnode">Full Node (archival)</option>
              <option value="pruned" selected>Pruned Node</option>
              <option value="light">Light (limited peers + smaller caches)</option>
              <option value="dev-testnet">Developer (testnet)</option>
              <option value="dev-regtest">Developer (regtest)</option>
              <option value="tor-only">Tor-only</option>
              <option value="privacy">Privacy-leaning defaults</option>
              <option value="mining">Mining-oriented</option>
            </select>
          </label>
          <label>Network
            <select id="bf-network">
              <option value="mainnet" selected>Mainnet</option>
              <option value="testnet">Testnet</option>
              <option value="signet">Signet</option>
              <option value="regtest">Regtest</option>
            </select>
          </label>
          <label>Target
            <select id="bf-target">
              <option value="core" selected>Bitcoin Core</option>
              <option value="knots">Bitcoin Knots</option>
            </select>
          </label>
          <label>Data Dir
            <input id="bf-datadir" type="text" placeholder="(optional) e.g. /var/lib/bitcoin">
          </label>
        </div>

        <div class="row">
          <label>dbcache (MB)
            <input id="bf-dbcache" type="number" min="0" step="1" placeholder="300">
          </label>
          <label>maxmempool (MB)
            <input id="bf-maxmempool" type="number" min="5" step="5" placeholder="300">
          </label>
          <label>maxconnections
            <input id="bf-maxconnections" type="number" min="8" max="1024" step="1" placeholder="64">
          </label>
          <label>prune (MB, 0=off)
            <input id="bf-prune" type="number" min="0" step="1" placeholder="550">
          </label>
        </div>

        <div class="row">
          <label><input type="checkbox" id="bf-txindex"> txindex</label>
          <label><input type="checkbox" id="bf-rpc-expose"> Expose RPC (bind/allow)</label>
          <label><input type="checkbox" id="bf-listen" checked> listen</label>
          <label><input type="checkbox" id="bf-upnp"> upnp</label>
        </div>

        <div class="row">
          <label><input type="checkbox" id="bf-tor" checked> Use Tor (proxy=127.0.0.1:9050)</label>
          <label><input type="checkbox" id="bf-onlynet-tor"> onlynet=onion</label>
          <label><input type="checkbox" id="bf-discover" checked> discover</label>
          <label><input type="checkbox" id="bf-dnsseed" checked> dnsseed</label>
        </div>

        <div class="row">
          <label>bind (P2P) <input id="bf-bind" type="text" placeholder="0.0.0.0:8333 (optional)"></label>
          <label>rpcbind <input id="bf-rpcbind" type="text" placeholder="127.0.0.1 (default)"></label>
          <label>rpcport <input id="bf-rpcport" type="number" min="1" max="65535" placeholder="8332"></label>
          <label>rpcallowip (one per line)
            <textarea id="bf-rpcallowip" rows="3" placeholder="127.0.0.1/32"></textarea>
          </label>
        </div>

        <div class="row">
          <label>rpcuser <input id="bf-rpcuser" type="text" placeholder="(optional)"></label>
          <label>rpcpassword <input id="bf-rpcpassword" type="text" placeholder="(optional; use rpcauth for production)"></label>
          <label>rpcauth <input id="bf-rpcauth" type="text" placeholder="user:salt$hash (preferred)"></label>
          <label>extra lines
            <textarea id="bf-extra" rows="3" placeholder="# any raw bitcoin.conf lines"></textarea>
          </label>
        </div>

        <p class="muted" style="margin-top:.25rem">
          Note: For production, <strong>use <code>rpcauth</code></strong> instead of <code>rpcuser/rpcpassword</code>.
          Generate with Bitcoin Core’s <code>rpcauth.py</code>.
        </p>
      </form>
    `;

    // Auto-preset populate on change
    $("#bf-preset").addEventListener("change", applyPreset);
    $("#bf-network").addEventListener("change", applyNetDefaults);
    applyPreset();
  }

  function applyPreset() {
    const p = $("#bf-preset").value;
    // sensible defaults
    setVal("#bf-dbcache",       "");
    setVal("#bf-maxmempool",    "");
    setVal("#bf-maxconnections","64");
    setVal("#bf-prune",         "550");
    setCB ("#bf-txindex",       false);
    setCB ("#bf-rpc-expose",    false);
    setCB ("#bf-listen",        true);
    setCB ("#bf-upnp",          false);
    setCB ("#bf-tor",           true);
    setCB ("#bf-onlynet-tor",   false);
    setCB ("#bf-discover",      true);
    setCB ("#bf-dnsseed",       true);
    setVal("#bf-bind",          "");
    setVal("#bf-rpcbind",       "127.0.0.1");
    setVal("#bf-rpcport",       "");

    switch (p) {
      case "fullnode":
        setVal("#bf-dbcache", "1000");
        setVal("#bf-prune", "0");
        setCB ("#bf-txindex", true);
        break;
      case "pruned":
        setVal("#bf-dbcache", "300");
        setVal("#bf-prune", "550");
        setCB ("#bf-txindex", false);
        break;
      case "light":
        setVal("#bf-dbcache", "150");
        setVal("#bf-maxmempool", "150");
        setVal("#bf-prune", "1000");
        setVal("#bf-maxconnections", "32");
        break;
      case "dev-testnet":
        $("#bf-network").value = "testnet";
        setVal("#bf-dbcache", "300");
        setVal("#bf-prune", "0");
        setCB ("#bf-txindex", true);
        break;
      case "dev-regtest":
        $("#bf-network").value = "regtest";
        setVal("#bf-dbcache", "150");
        setVal("#bf-prune", "0");
        setCB ("#bf-txindex", true);
        setCB ("#bf-discover", false);
        setCB ("#bf-dnsseed", false);
        break;
      case "tor-only":
        setCB ("#bf-tor", true);
        setCB ("#bf-onlynet-tor", true);
        setCB ("#bf-dnsseed", true);
        break;
      case "privacy":
        setCB ("#bf-tor", true);
        setCB ("#bf-onlynet-tor", true);
        setCB ("#bf-upnp", false);
        setCB ("#bf-discover", false);
        setCB ("#bf-dnsseed", true);
        setVal("#bf-maxconnections", "48");
        break;
      case "mining":
        setVal("#bf-dbcache", "1200");
        setVal("#bf-maxmempool", "500");
        setVal("#bf-prune", "0");
        setCB ("#bf-txindex", true);
        break;
    }
    applyNetDefaults();
  }

  function applyNetDefaults() {
    const net = $("#bf-network").value;
    // If user hasn't explicitly set rpcport, we nudge it per net
    const rpcPort = $("#bf-rpcport").value.trim();
    if (!rpcPort) {
      setVal("#bf-rpcport",
        net === "testnet" ? "18332" :
        net === "signet"  ? "38332" :
        net === "regtest" ? "18443" : "8332"
      );
    }
  }

  function setVal(sel, v) { const el = $(sel); if (el) el.value = v; }
  function setCB(sel, on) { const el = $(sel); if (el) el.checked = !!on; }

  function readLines(sel) {
    const t = $(sel)?.value || "";
    return t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  function buildBitcoinConf() {
    const tgt = $("#bf-target").value;      // core | knots (kept for future options)
    const net = $("#bf-network").value;     // mainnet/testnet/signet/regtest

    const L = [];
    L.push(`# Generated by BitFig (browser mini) — ${new Date().toISOString()}`);
    L.push(`# Target: Bitcoin ${tgt === "knots" ? "Knots" : "Core"} (${net})`);
    L.push(`# For production, prefer rpcauth over rpcuser/rpcpassword.`);
    L.push("");

    // Network flags
    if (net === "testnet") L.push("testnet=1");
    if (net === "signet")  L.push("signet=1");
    if (net === "regtest") L.push("regtest=1");

    // Simple options
    const datadir = $("#bf-datadir").value.trim();
    const dbcache = $("#bf-dbcache").value.trim();
    const maxmp   = $("#bf-maxmempool").value.trim();
    const maxconn = $("#bf-maxconnections").value.trim();
    const prune   = $("#bf-prune").value.trim();
    const txindex = $("#bf-txindex").checked;

    if (datadir) L.push(`datadir=${datadir}`);
    if (dbcache) L.push(`dbcache=${dbcache}`);
    if (maxmp)   L.push(`maxmempool=${maxmp}`);
    if (maxconn) L.push(`maxconnections=${maxconn}`);
    if (prune)   L.push(`prune=${prune}`);
    if (txindex) L.push("txindex=1");

    // P2P & discovery
    const listen   = $("#bf-listen").checked;
    const upnp     = $("#bf-upnp").checked;
    const discover = $("#bf-discover").checked;
    const dnsseed  = $("#bf-dnsseed").checked;
    const bind     = $("#bf-bind").value.trim();

    L.push(`listen=${listen ? 1 : 0}`);
    L.push(`upnp=${upnp ? 1 : 0}`);
    L.push(`discover=${discover ? 1 : 0}`);
    L.push(`dnsseed=${dnsseed ? 1 : 0}`);
    if (bind) L.push(`bind=${bind}`);

    // Tor & onlynet
    const useTor   = $("#bf-tor").checked;
    const onlyTor  = $("#bf-onlynet-tor").checked;
    if (useTor) {
      L.push("proxy=127.0.0.1:9050");
      L.push("onlynet=onion"); // prefer onion peers by default when proxy set
    }
    if (onlyTor) {
      // Force onion only; if proxy not set, user should add one
      if (!useTor) L.push("# NOTE: onlynet=onion set without proxy — add a Tor proxy if needed");
      if (!L.includes("onlynet=onion")) L.push("onlynet=onion");
    }

    // RPC exposure
    const expose  = $("#bf-rpc-expose").checked;
    const rpcbind = $("#bf-rpcbind").value.trim();
    const rpcport = $("#bf-rpcport").value.trim();
    const allow   = readLines("#bf-rpcallowip");
    const rpcauth = $("#bf-rpcauth").value.trim();
    const rpcuser = $("#bf-rpcuser").value.trim();
    const rpcpass = $("#bf-rpcpassword").value.trim();

    if (expose) {
      if (rpcbind) L.push(`rpcbind=${rpcbind}`);
      if (rpcport) L.push(`rpcport=${rpcport}`);
      if (allow.length) allow.forEach(ip => L.push(`rpcallowip=${ip}`));
    } else {
      // Default safe local RPC
      if (rpcbind) L.push(`# rpcbind=${rpcbind}  # (disabled: Expose RPC unchecked)`);
      L.push("rpcbind=127.0.0.1");
      if (rpcport) L.push(`rpcport=${rpcport}`);
      L.push("rpcallowip=127.0.0.1");
    }

    if (rpcauth) {
      L.push(`rpcauth=${rpcauth}`);
    } else if (rpcuser || rpcpass) {
      L.push("# WARNING: rpcuser/rpcpassword are deprecated for production. Prefer rpcauth.");
      if (rpcuser) L.push(`rpcuser=${rpcuser}`);
      if (rpcpass) L.push(`rpcpassword=${rpcpass}`);
    }

    // Extra raw lines
    const extra = $("#bf-extra").value;
    if (extra.trim()) {
      L.push(""); L.push("# Extra"); 
      extra.split(/\r?\n/).forEach(line => {
        const t = line.trim();
        if (t) L.push(t);
      });
    }

    L.push("");
    return L.join("\n");
  }
})();

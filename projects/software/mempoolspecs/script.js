// mempoolspecs: manifest loader + minimal mempool “goggles” demo
(async function () {
  const $ = (id) => document.getElementById(id);

  // Manifest DOM
  const titleEl   = $('project-title');
  const blurbEl   = $('project-blurb');
  const descEl    = $('project-description');
  const metaList  = $('meta-list');
  const tagList   = $('tag-list');
  const verList   = $('version-list');
  const imgGrid   = $('image-grid');
  const imgNote   = $('image-note');
  const logoEl    = $('project-logo');
  const btnOpen   = $('btn-open');
  const btnGitHub = $('btn-github');

  // Demo DOM
  const apiBaseEl = $('apiBase');
  const autopullEl= $('autopull');
  const btnPing   = $('btn-ping');
  const btnLoad   = $('btn-load');
  const statusEl  = $('status');
  const tipEl     = $('tip-h');
  const sizeEl    = $('mempool-size');
  const bandsEl   = $('bands');

  let autoTimer = null;
  const esc  = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const attr = (s) => String(s ?? '').replace(/"/g, '&quot;');

  /* ---------------- Manifest ---------------- */
  let manifest = {};
  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    if (manifest.description) descEl.textContent = manifest.description;

    const meta = [];
    pushMeta(meta, 'Slug', manifest.slug);
    pushMeta(meta, 'State', manifest.state);
    pushMetaLink(meta, 'URL', manifest.href);
    pushMetaLink(meta, 'GitHub', manifest.github, true);
    pushMetaLink(meta, 'Docs', manifest.docs, true);
    if (Array.isArray(manifest.endpoints) && manifest.endpoints.length) {
      pushMeta(meta, 'Endpoints', '');
      meta.push(`<li class="muted">${manifest.endpoints.map(esc).join(' • ')}</li>`);
      // prefill first endpoint
      if (!apiBaseEl.value) apiBaseEl.value = manifest.endpoints[0];
    }
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    if (manifest.href) { btnOpen.href = manifest.href; if (/^https?:/i.test(manifest.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; } }
    else { btnOpen.style.display = 'none'; }

    if (manifest.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = manifest.github; btnGitHub.target = '_blank'; btnGitHub.rel = 'noopener noreferrer';
    }

    if (manifest.logo) { logoEl.src = manifest.logo; logoEl.style.display = 'block'; }

    tagList.innerHTML = '';
    (manifest.tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li); });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    verList.innerHTML = '';
    (manifest.versions || []).forEach(v => { const li = document.createElement('li'); li.textContent = v; verList.appendChild(li); });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(manifest.title || 'mempoolspecs')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  function pushMeta(list, label, value) { if (value == null || value === '') return; list.push(`<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`); }
  function pushMetaLink(list, label, href, ext=false) {
    if (!href) return;
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    list.push(`<li><strong>${esc(label)}:</strong> ${a}</li>`);
  }

  /* ---------------- Demo logic ---------------- */

  // Build a row in the goggles table
  function row(fee, qPct, eta) {
    const tr = document.createElement('div');
    tr.className = 'band';
    tr.innerHTML = `
      <div class="fee">${fee} <span class="muted">sat/vB</span></div>
      <div class="bar"><span style="width:${Math.max(0, Math.min(100, qPct))}%;"></span></div>
      <div class="eta">${eta}</div>
    `;
    return tr;
  }

  function setStatus(s) { statusEl.textContent = s; }

  function renderSnapshot(snapshot) {
    // snapshot shape:
    // { tip: number, mempoolSize: number, bands: [{fee, pct, eta}] }
    tipEl.textContent = snapshot.tip || '';
    sizeEl.textContent = (snapshot.mempoolSize ?? '') + '';
    bandsEl.innerHTML = '';
    (snapshot.bands || []).forEach(b => bandsEl.appendChild(row(b.fee, b.pct, b.eta)));
  }

  // Local sample (no network)
  function localSample() {
    return {
      tip: 845000,
      mempoolSize: 198_000,
      bands: [
        { fee: 1,  pct: 5,  eta: '~days' },
        { fee: 3,  pct: 12, eta: '24h+' },
        { fee: 5,  pct: 16, eta: '12–24h' },
        { fee: 8,  pct: 22, eta: '6–12h' },
        { fee: 10, pct: 28, eta: '3–6h' },
        { fee: 15, pct: 40, eta: '1–3h' },
        { fee: 20, pct: 55, eta: '~1h' },
        { fee: 30, pct: 70, eta: '~30m' },
        { fee: 40, pct: 85, eta: '~15m' },
        { fee: 60, pct: 100, eta: 'ASAP' }
      ]
    };
  }

  // Convert mempool.space endpoints → snapshot
  async function loadFromAPI(base) {
    // endpoints used:
    // - /api/blocks/tip/height
    // - /api/mempool (we’ll take .count or .vsize)
    // - /api/v1/fees/recommended (fastestFee, halfHourFee, hourFee, economyFee, minimumFee)
    const clean = String(base || '').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(clean)) throw new Error('Provide a valid https? API base');

    const [tipR, mpR, feeR] = await Promise.all([
      fetch(`${clean}/blocks/tip/height`, { cache: 'no-cache', mode: 'cors' }),
      fetch(`${clean}/mempool`,           { cache: 'no-cache', mode: 'cors' }),
      fetch(`${clean}/v1/fees/recommended`, { cache: 'no-cache', mode: 'cors' })
    ]);
    if (!tipR.ok) throw new Error(`/blocks/tip/height: HTTP ${tipR.status}`);
    if (!mpR.ok)  throw new Error(`/mempool: HTTP ${mpR.status}`);
    if (!feeR.ok) throw new Error(`/v1/fees/recommended: HTTP ${feeR.status}`);

    const tip = await tipR.json();
    const mp  = await mpR.json();          // shape: {count, vsize} or similar
    const fee = await feeR.json();         // shape: {fastestFee, halfHourFee, hourFee, economyFee, minimumFee}

    // Construct rough bands from fee recs; pct is just visual fill proxy
    const fees = cleanFees(fee);
    const bands = [
      { label: fees.minimumFee, eta: '~days',   pct: 8 },
      { label: fees.economyFee, eta: '12–24h',  pct: 22 },
      { label: fees.hourFee,    eta: '1–3h',    pct: 45 },
      { label: fees.halfHourFee,eta: '~30–60m', pct: 70 },
      { label: fees.fastestFee, eta: 'ASAP',    pct: 100 }
    ];
    return {
      tip: Number(tip || 0),
      mempoolSize: Number(mp?.count ?? mp?.size ?? 0),
      bands: bands.map(b => ({ fee: b.label, pct: b.pct, eta: b.eta }))
    };
  }

  function cleanFees(f) {
    const n = (x, d=0) => Math.max(0, Math.round(Number(x || 0)));
    return {
      fastestFee: n(f?.fastestFee),
      halfHourFee: n(f?.halfHourFee),
      hourFee: n(f?.hourFee),
      economyFee: n(f?.economyFee),
      minimumFee: n(f?.minimumFee ?? f?.economyFee ?? f?.hourFee ?? f?.halfHourFee ?? f?.fastestFee)
    };
  }

  async function ping() {
    try {
      setStatus('ping…');
      const base = apiBaseEl.value.trim();
      if (!base) throw new Error('Set API base or use Load Snapshot');
      const snap = await loadFromAPI(base);
      renderSnapshot(snap);
      setStatus('ok');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  btnPing.addEventListener('click', ping);
  btnLoad.addEventListener('click', () => {
    renderSnapshot(localSample());
    setStatus('sample');
  });

  autopullEl.addEventListener('change', () => {
    if (autopullEl.checked) {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = setInterval(ping, 10000);
      ping();
    } else if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  });

})();

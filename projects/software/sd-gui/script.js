// SD-GUI: load manifest, wire quick-test UI, light drag-drop for model cards,
// and safe client-side calls to your inference API.

(function () {
  const $ = (sel, root=document) => root.querySelector(sel);

  /* ---------------- Manifest ---------------- */
  async function loadManifest() {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function setHrefOrHide(el, href) {
    if (!el) return;
    if (href && String(href).trim()) {
      el.href = href;
    } else {
      el.style.display = 'none';
    }
  }

  function mountTags(tags) {
    const ul = $('#tag-list');
    if (!ul) return;
    ul.innerHTML = '';
    (tags || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function mountVersions(versions) {
    const wrap = $('#version-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    (versions || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'version';
      card.innerHTML = `
        <h4>${v.version} · <span class="muted">${v.state || 'unknown'}</span></h4>
        <p class="muted small">${v.date ? `Released: ${v.date}` : ''}</p>
        ${v.notes ? `<p>${v.notes}</p>` : ''}
      `;
      wrap.appendChild(card);
    });
  }

  function mountGallery(images) {
    const grid = $('#gallery');
    if (!grid) return;
    grid.innerHTML = '';
    if (!images || !images.length) {
      grid.innerHTML = '<div class="placeholder">Results will appear here…</div>';
      return;
    }
    (images || []).forEach(src => pushImage(src, { meta: 'sample' }));
  }

  function mountModelCards(models) {
    const grid = $('#model-cards');
    if (!grid) return;
    grid.innerHTML = '';
    (models || []).forEach(m => {
      const card = document.createElement('div');
      card.className = 'model-card';
      card.draggable = true;
      card.dataset.modelId = m.id || m.repo || '';
      card.innerHTML = `
        <h4>${m.name || m.id || m.repo}</h4>
        <p class="muted">${m.repo || ''}</p>
        <div class="act">
          <button class="btn sm" data-act="activate">Set Active</button>
          <a class="btn sm alt" target="_blank" rel="noopener" href="${m.repo_url || m.hf || '#'}">Repo</a>
        </div>
      `;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/model-id', card.dataset.modelId);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      grid.appendChild(card);
    });

    // simple reordering
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = grid.querySelector('.dragging');
      if (!dragging) return;
      const after = getDragAfterElement(grid, e.clientY);
      if (after == null) grid.appendChild(dragging);
      else grid.insertBefore(dragging, after);
    });

    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act="activate"]');
      if (!btn) return;
      const card = btn.closest('.model-card');
      if (!card) return;
      const id = card.dataset.modelId;
      await setActiveModel(id);
    });
  }

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.model-card:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return (offset < 0 && offset > (closest.offset || Number.NEGATIVE_INFINITY))
        ? { offset, element: child }
        : closest;
    }, {}).element;
  }

  function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sel = btn.getAttribute('data-copy');
        const el = $(sel);
        if (!el) return;
        const text = el.textContent || el.value || '';
        navigator.clipboard?.writeText(text).catch(()=>{});
      });
    });
  }

  /* ---------------- API Helpers ---------------- */
  function logLine(s) {
    const logs = $('#logs');
    if (!logs) return;
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${s}`;
    logs.prepend(div);
  }

  function setState(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function endpoint() {
    return $('#endpoint')?.value?.trim() || '';
  }

  function parseSize(sz) {
    const m = String(sz || '').match(/^(\d+)x(\d+)$/i);
    if (!m) return { width: 512, height: 512 };
    return { width: Number(m[1]), height: Number(m[2]) };
  }

  async function setActiveModel(id) {
    if (!id) return;
    const ep = endpoint();
    if (!ep) { logLine('Set an endpoint to activate a model.'); return; }
    try {
      // Convention: POST /api/model with { id }
      const res = await fetch(ep.replace(/\/api\/.*$/,'/api/model'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const js = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
      setState('#model-state', `Model: ${id}`);
      logLine(`Active model set to ${id}`);
    } catch (e) {
      logLine(`Activate model failed: ${e.message}`);
    }
  }

  function pushImage(src, { meta='' }={}) {
    const grid = $('#gallery');
    if (!grid) return;
    const wasEmpty = grid.querySelector('.placeholder');
    if (wasEmpty) grid.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'gen';
    card.innerHTML = `<img src="${src}" alt="" loading="lazy" decoding="async" />
      <div class="meta">${meta}</div>`;
    grid.prepend(card);
  }

  async function callHealth() {
    const ep = endpoint();
    if (!ep) { logLine('Set an endpoint for health check.'); return; }
    try {
      // Convention: GET /api/health
      const url = ep.replace(/\/api\/.*$/,'/api/health');
      const res = await fetch(url, { cache: 'no-cache' });
      const js = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
      setState('#server-state', `Server: ${js?.status || 'ok'}`);
      setState('#queue-state', `Queue: ${js?.queue_length ?? '–'}`);
      setState('#model-state', `Model: ${js?.model || '–'}`);
      logLine('Health OK');
    } catch (e) {
      logLine(`Health failed: ${e.message}`);
      setState('#server-state', 'Server: unreachable');
    }
  }

  async function callGenerate() {
    const ep = endpoint();
    if (!ep) { logLine('Set an endpoint to generate.'); return; }

    const { width, height } = parseSize($('#size').value);
    const payload = {
      prompt: $('#prompt').value || '',
      negative: $('#negative').value || '',
      steps: Number($('#steps').value || 20),
      cfg: Number($('#cfg').value || 7.5),
      seed: Number($('#seed').value || 0),
      scheduler: $('#scheduler').value || 'euler_a',
      width, height
    };
    const chosenModel = $('#model').value || '';
    if (chosenModel) payload.model = chosenModel;

    // Update example curl
    const curl = `curl -X POST "${ep}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`;
    const curlEl = $('#curl-snippet');
    if (curlEl) curlEl.textContent = curl;

    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const js = await res.json().catch(()=> ({}));

      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);

      // Convention: responds with { images: ["data:image/png;base64,...", ...], meta: {...} }
      const imgs = js?.images || [];
      if (!imgs.length) throw new Error('No images in response');

      imgs.forEach((src, i) => pushImage(src.startsWith('data:') ? src : `data:image/png;base64,${src}`, {
        meta: `${payload.width}×${payload.height}, steps ${payload.steps}, cfg ${payload.cfg}${payload.model ? `, ${payload.model}` : ''}`
      }));
      logLine(`Generated ${imgs.length} image(s).`);
    } catch (e) {
      logLine(`Generate failed: ${e.message}`);
    }
  }

  /* ---------------- Boot ---------------- */
  (async function init() {
    // Wire buttons
    $('#btn-health')?.addEventListener('click', callHealth);
    $('#btn-generate')?.addEventListener('click', callGenerate);
    wireCopyButtons();

    try {
      const data = await loadManifest();
      const p = data?.project || {};

      // Title / blurb / description
      $('#project-title').textContent = p.title || 'SD-GUI';
      $('#project-blurb').textContent = p.blurb || '';
      $('#project-description').textContent = p.description || '';

      // Links
      setHrefOrHide($('#project-primary-link'), p.href || p.github || p.homepage || '#');
      setHrefOrHide($('#project-github'), p.github);
      setHrefOrHide($('#project-hf'), p.huggingface);

      // Status badge
      $('#project-status').textContent = p.state ? `State: ${p.state}` : '';

      // Logo
      const logo = $('#project-logo');
      if (logo) {
        const src = p.logo || (p.images && p.images[0]) || '/static/images/placeholder.jpg';
        logo.src = src;
      }

      // Meta
      mountTags(p.tags);
      mountVersions(p.versions);

      // Gallery samples & model cards
      mountGallery(p.images);
      mountModelCards(p.models);

      // Set default endpoint if provided
      if (p.endpoint) $('#endpoint').value = p.endpoint;
    } catch (e) {
      console.error(e);
      const hero = document.querySelector('.hero');
      if (hero) {
        const div = document.createElement('div');
        div.className = 'notice';
        div.textContent = `Failed to load manifest.json: ${e.message}`;
        hero.appendChild(div);
      }
    }
  })();
})();

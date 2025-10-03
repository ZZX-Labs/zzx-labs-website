// Load manifest.json, wire links, tags, versions, gallery,
// and provide an in-page filename sanitizer demo.

(function () {
  const $ = (sel, root=document) => root.querySelector(sel);

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
    (images || []).forEach(src => {
      const fig = document.createElement('figure');
      fig.className = 'image image-shadow rounded';
      fig.innerHTML = `<img src="${src}" alt="" loading="lazy" decoding="async" />`;
      grid.appendChild(fig);
    });
  }

  function copyFrom(selector) {
    const el = $(selector);
    if (!el) return;
    const text = el.value || el.textContent || '';
    navigator.clipboard?.writeText(text).catch(()=>{});
  }

  function wireCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyFrom(btn.getAttribute('data-copy')));
    });
  }

  // --- Filename sanitizer (client-side demo) ---
  const WINDOWS_FORBIDDEN = /[\\/:*?"<>|]/g;
  const URL_FORBIDDEN = /[^A-Za-z0-9._~\-]+/g; // keep RFC3986-ish safe set
  const WHITESPACE = /\s+/g;
  const DIACRITICS_MAP = (() => {
    // rely on Unicode NFKD decomposition & strip combining marks
    // additional quick map for common symbols
    return {
      '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '•': '-', '…': '...',
      '·': '-', '•': '-', '«': '"', '»': '"', '©': 'c', '®': 'r', '™': 'tm'
    };
  })();

  function stripDiacritics(str) {
    const base = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return base.replace(/./g, ch => DIACRITICS_MAP[ch] || ch);
  }

  function keepExtension(name) {
    // Return { stem, ext } preserving last .ext, ignoring dotfiles when avoid-leading-dot is set
    const i = name.lastIndexOf('.');
    if (i > 0 && i < name.length - 1) {
      return { stem: name.slice(0, i), ext: name.slice(i) };
    }
    return { stem: name, ext: '' };
  }

  function truncateWithExtension(name, maxLen) {
    if (name.length <= maxLen) return name;
    const { stem, ext } = keepExtension(name);
    const room = Math.max(0, maxLen - ext.length);
    const trimmedStem = stem.slice(0, room);
    return (trimmedStem || 'untitled') + ext.slice(0, Math.max(0, maxLen - trimmedStem.length));
  }

  function sanitizeOne(raw, opts) {
    let s = String(raw ?? '');

    if (opts.trim) s = s.trim();
    if (opts.collapseWs) s = s.replace(WHITESPACE, ' ');
    if (opts.diacritics) s = stripDiacritics(s);
    if (opts.replaceSpaces) s = s.replace(/\s+/g, '_');

    // Strip forbidden chars per selected modes
    if (opts.windowsSafe) s = s.replace(WINDOWS_FORBIDDEN, '_');
    if (opts.urlSafe) s = s.replace(URL_FORBIDDEN, '_');

    // Collapse duplicate underscores / dots
    s = s.replace(/_+/g, '_').replace(/\.+/g, '.');

    // Avoid leading dot (hidden files) if requested
    if (opts.avoidLeadingDot && s.startsWith('.')) s = s.replace(/^\.+/, '');

    // Lowercase if requested
    if (opts.lowercase) s = s.toLowerCase();

    // Enforce max length while keeping last extension
    s = truncateWithExtension(s, opts.maxLen);

    // Empty fallback
    if (!s) s = 'untitled';

    return s;
  }

  function sanitizeMany(multiline, opts) {
    const lines = String(multiline || '').split(/\r?\n/);
    return lines.map(line => sanitizeOne(line, opts)).join('\n');
  }

  function readOpts() {
    return {
      trim: $('#opt-trim')?.checked ?? true,
      collapseWs: $('#opt-collapse-ws')?.checked ?? true,
      replaceSpaces: $('#opt-replace-spaces')?.checked ?? true,
      diacritics: $('#opt-diacritics')?.checked ?? true,
      urlSafe: $('#opt-urlsafe')?.checked ?? true,
      windowsSafe: $('#opt-windows')?.checked ?? true,
      avoidLeadingDot: $('#opt-leading-dot')?.checked ?? false,
      lowercase: $('#opt-lowercase')?.checked ?? false,
      maxLen: Math.min(255, Math.max(8, parseInt($('#opt-maxlen')?.value || '128', 10) || 128)),
    };
  }

  function wireDemo() {
    const input = $('#input-name');
    const output = $('#output-name');
    const btnClean = $('#btn-clean');
    const btnCopy = $('#btn-copy');

    function run() {
      const opts = readOpts();
      const cleaned = sanitizeMany(input.value, opts);
      output.value = cleaned;
    }

    btnClean?.addEventListener('click', run);
    btnCopy?.addEventListener('click', () => {
      output.select();
      document.execCommand?.('copy');
      navigator.clipboard?.writeText(output.value).catch(()=>{});
    });

    // live-ish
    input?.addEventListener('input', () => {
      // debounce a little
      clearTimeout(run._t);
      run._t = setTimeout(run, 120);
    });
  }

  // Boot
  (async function init() {
    try {
      const data = await loadManifest();
      const p = data?.project || {};

      // Title / blurb / description
      $('#project-title').textContent = p.title || 'Safai Karta';
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

      // Gallery
      mountGallery(p.images);

      // Wire copy buttons and demo
      wireCopyButtons();
      wireDemo();
    } catch (e) {
      console.error(e);
      const hero = document.querySelector('.hero');
      if (hero) {
        const div = document.createElement('div');
        div.className = 'notice';
        div.textContent = `Failed to load manifest.json: ${e.message}`;
        hero.appendChild(div);
      }
      wireDemo(); // still allow demo even without manifest
    }
  })();
})();

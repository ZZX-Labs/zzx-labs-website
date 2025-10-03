// Lexiphor: manifest loader + minimal in-browser formatter (indent/whitespace)

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
  const langEl    = $('lang');
  const styleEl   = $('style');
  const sizeEl    = $('size');
  const trimEl    = $('trim');
  const finaleolEl= $('finaleol');
  const srcEl     = $('src');
  const outEl     = $('out');
  const btnFmt    = $('btn-format');
  const btnCopy   = $('btn-copy');

  // Helpers
  const esc  = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const attr = (s) => String(s ?? '').replace(/"/g, '&quot;');

  /* ---------------- Manifest ---------------- */
  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description;

    const meta = [];
    pushMeta(meta, 'Slug', m.slug);
    pushMeta(meta, 'State', m.state);
    pushMetaLink(meta, 'URL', m.href);
    pushMetaLink(meta, 'GitHub', m.github, true);
    pushMetaLink(meta, 'Docs', m.docs, true);
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    if (m.href) { btnOpen.href = m.href; if (/^https?:/i.test(m.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; } }
    else { btnOpen.style.display = 'none'; }

    if (m.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = m.github; btnGitHub.target = '_blank'; btnGitHub.rel = 'noopener noreferrer';
    }

    if (m.logo) { logoEl.src = m.logo; logoEl.style.display = 'block'; }

    tagList.innerHTML = '';
    (m.tags || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li); });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    verList.innerHTML = '';
    (m.versions || []).forEach(v => { const li = document.createElement('li'); li.textContent = v; verList.appendChild(li); });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'Lexiphor')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  function pushMeta(list, label, value) { if (!value) return; list.push(`<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`); }
  function pushMetaLink(list, label, href, ext=false) {
    if (!href) return;
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    list.push(`<li><strong>${esc(label)}:</strong> ${a}</li>`);
  }

  /* ---------------- Minimal Formatter ---------------- */
  btnFmt.addEventListener('click', () => {
    const language = (langEl.value || 'auto').toLowerCase();
    const useTabs  = styleEl.value === 'tabs';
    const size     = Math.min(Math.max(parseInt(sizeEl.value || '2', 10), 1), 8);
    const trim     = !!trimEl.checked;
    const finaleol = !!finaleolEl.checked;

    const codeIn   = srcEl.value;
    let codeOut    = normalizeNewlines(codeIn);

    const detected = language === 'auto' ? detectLanguage(codeOut) : language;

    // 1) Trim trailing whitespace
    if (trim) codeOut = codeOut.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n');

    // 2) Normalize indentation: tabs <-> spaces
    codeOut = remapIndentation(codeOut, useTabs, size);

    // 3) Lightweight block indentation for brace languages or simple rules
    codeOut = formatByLanguage(codeOut, detected, useTabs, size);

    // 4) Final newline
    if (finaleol && !codeOut.endsWith('\n')) codeOut += '\n';

    outEl.value = codeOut;
  });

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(outEl.value);
      btnCopy.textContent = 'Copied';
      setTimeout(() => (btnCopy.textContent = 'Copy'), 1200);
    } catch {}
  });

  /* ---------- Format helpers ---------- */

  function normalizeNewlines(s) {
    return String(s || '').replace(/\r\n?/g, '\n');
  }

  function detectLanguage(s) {
    const src = s.slice(0, 2000);
    if (/{\s*$/.test(src) || /[{};]/.test(src)) return 'javascript';
    if (/^\s*</m.test(src) && /<\/?[a-z]/i.test(src)) return 'html';
    if (/^\s*[{[]/.test(src) && /"[^"]+"\s*:/.test(src)) return 'json';
    if (/^\s*#\!.*python/.test(src) || /:\s*$/m.test(src)) return 'python';
    if (/^\s*@?media|^\s*[:.#\w-]+\s*\{/.test(src)) return 'css';
    return 'auto';
    // Note: only used to choose a rule family; not authoritative.
  }

  // Convert leading sequences of tabs/spaces to the chosen style/size,
  // preserve relative indent depth using a heuristic 1 tab = size spaces.
  function remapIndentation(s, useTabs, size) {
    const lines = s.split('\n');
    return lines.map(line => {
      const m = line.match(/^[ \t]+/);
      if (!m) return line;
      const lead = m[0];
      let width = 0;
      for (const ch of lead) width += (ch === '\t') ? size : 1;
      const newLead = useTabs ? '\t'.repeat(Math.floor(width / size)) + ' '.repeat(width % size)
                              : ' '.repeat(width);
      return newLead + line.slice(lead.length);
    }).join('\n');
  }

  function formatByLanguage(s, language, useTabs, size) {
    const bracey = ['c','c++','java','javascript','typescript','go','rust','lua'];
    if (bracey.includes(language)) return braceFormatter(s, size);

    switch (language) {
      case 'python': return pyWhitespace(s);
      case 'html':   return htmlWhitespace(s);
      case 'css':    return cssWhitespace(s);
      case 'json':   return jsonPretty(s, size);
      case 'ruby':
      case 'perl':
      case 'r':      return softTrim(s);
      default:       return softTrim(s);
    }
  }

  // Very light brace formatter: adjusts indent based on { } and some keywords
  function braceFormatter(s, size) {
    const IND = ' '.repeat(size);
    const lines = s.split('\n');
    let depth = 0;
    return lines.map(raw => {
      let line = raw.replace(/[ \t]+$/g, ''); // trailing trim
      const closeFirst = /^[ \t]*[}\])]/.test(line);
      if (closeFirst) depth = Math.max(depth - 1, 0);

      const out = (IND.repeat(depth)) + line.replace(/^[ \t]*/, '');

      // Adjust depth for next line
      const opens  = (line.match(/[({[]/g) || []).length;
      const closes = (line.match(/[)}\]]/g) || []).length;
      depth = Math.max(depth + opens - closes, 0);

      // Language-ish keywords that imply block open
      if (/[{]$/.test(line) || /\b(else|do|then|try|catch)\b\s*$/i.test(line)) {
        // already accounted by {, but for languages without braces this helps slightly
      }
      return out;
    }).join('\n');
  }

  function pyWhitespace(s) {
    // Just enforce trimming + consistent indent mapping already done
    return s.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n');
  }
  function htmlWhitespace(s) {
    // Collapse excessive blank lines (keep max one)
    return s.replace(/\n{3,}/g, '\n\n');
  }
  function cssWhitespace(s) {
    return s.replace(/\n{3,}/g, '\n\n');
  }
  function jsonPretty(s, size) {
    try { return JSON.stringify(JSON.parse(s), null, size); } catch { return s; }
  }
  function softTrim(s) {
    return s.split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n');
  }
})();

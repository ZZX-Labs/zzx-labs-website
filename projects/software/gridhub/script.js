// Project page loader — hydrates from ./manifest.json and wires a demo link
(async function () {
  const $ = (id) => document.getElementById(id);

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
  const demoA     = $('demo-link');

  try {
    const res = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();

    // Title & text
    if (m.title) titleEl.textContent = m.title;
    if (m.blurb) blurbEl.textContent = m.blurb;
    if (m.description) descEl.textContent = m.description || m.blurb || '';

    // Meta
    const meta = [];
    if (m.slug)         meta.push(li(`Slug:`, esc(m.slug)));
    if (m.state)        meta.push(li(`State:`, esc(m.state)));
    if (m.href)         meta.push(liLink(`URL:`, m.href));
    if (m.github)       meta.push(liLink(`GitHub:`, m.github, true));
    if (m.docs)         meta.push(liLink(`Docs:`, m.docs, true));
    metaList.innerHTML = meta.join('') || '<li class="muted">No meta yet.</li>';

    // Buttons
    if (m.href) {
      btnOpen.href = m.href;
      if (/^https?:/i.test(m.href)) { btnOpen.target = '_blank'; btnOpen.rel = 'noopener noreferrer'; }
    } else {
      btnOpen.style.display = 'none';
    }
    if (m.github) {
      btnGitHub.style.display = '';
      btnGitHub.href = m.github;
      btnGitHub.target = '_blank';
      btnGitHub.rel = 'noopener noreferrer';
    }

    // Logo
    if (m.logo) {
      logoEl.src = m.logo;
      logoEl.style.display = 'block';
    }

    // Tags
    tagList.innerHTML = '';
    (m.tags || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      tagList.appendChild(li);
    });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    // Versions
    verList.innerHTML = '';
    (m.versions || []).forEach(v => {
      const li = document.createElement('li');
      li.textContent = v;
      verList.appendChild(li);
    });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'GridHub')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

    // Demo link: build a sample layout if manifest includes one; else a generic one
    const demo = m.demo || {
      layout: "2x2",
      panes: [
        { title: "Docs", url: "https://developer.mozilla.org/" },
        { title: "News", url: "https://news.ycombinator.com/" },
        { title: "Maps", url: "https://www.openstreetmap.org/" },
        { title: "Video", url: "https://www.youtube.com/embed/dQw4w9WgXcQ" }
      ]
    };
    // Encode as hash for a hypothetical GridHub runtime page (your app can decode this)
    const encoded = encodeURIComponent(JSON.stringify(demo));
    demoA.href = (m.href || "#") + (m.href?.includes('#') ? '' : '#') + `layout=${encoded}`;

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  function esc(s)  { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function attr(s) { return String(s).replace(/"/g, '&quot;'); }
  function li(label, value) { return `<li><strong>${esc(label)}</strong> ${value}</li>`; }
  function liLink(label, href, ext=false) {
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    return `<li><strong>${esc(label)}</strong> ${a}</li>`;
  }
})();

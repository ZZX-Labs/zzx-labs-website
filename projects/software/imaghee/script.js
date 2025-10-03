// ImaGhee project: manifest loader + browser-based converter (canvas)
(async function () {
  const $ = (id) => document.getElementById(id);

  // Manifest-driven bits
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
    if (m.slug)   meta.push(li(`Slug:`, esc(m.slug)));
    if (m.state)  meta.push(li(`State:`, esc(m.state)));
    if (m.href)   meta.push(liLink(`URL:`, m.href));
    if (m.github) meta.push(liLink(`GitHub:`, m.github, true));
    if (m.docs)   meta.push(liLink(`Docs:`, m.docs, true));
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
      const li = document.createElement('li'); li.textContent = t; tagList.appendChild(li);
    });
    if (!tagList.children.length) tagList.innerHTML = '<li class="muted">No tags yet.</li>';

    // Versions
    verList.innerHTML = '';
    (m.versions || []).forEach(v => {
      const li = document.createElement('li'); li.textContent = v; verList.appendChild(li);
    });
    if (!verList.children.length) verList.innerHTML = '<li class="muted">No releases yet.</li>';

    // Images
    imgGrid.innerHTML = '';
    const imgs = Array.isArray(m.images) ? m.images : [];
    imgs.forEach(src => {
      const f = document.createElement('figure');
      f.className = 'image';
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'ImaGhee')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  /* ================= Converter ================= */
  const drop = $('drop');
  const queueEl = $('queue');
  const outEl = $('out');

  const filePicker = $('filePicker');
  const btnClear = $('btn-clear');
  const btnConvert = $('btn-convert');

  const fmtSel = $('fmt');
  const qualityEl = $('quality');
  const qualityLabel = $('qualityLabel');
  const maxWEl = $('maxW');
  const maxHEl = $('maxH');
  const keepAlphaEl = $('keepAlpha');
  const bgColorEl = $('bgColor');

  const support = {
    webp: testSupport('image/webp'),
    avif: testSupport('image/avif')
  };
  // Hide unsupported formats
  if (!support.webp)  hideOption('image/webp');
  if (!support.avif)  hideOption('image/avif');

  qualityEl.addEventListener('input', () => {
    qualityLabel.textContent = String(Number(qualityEl.value).toFixed(2));
  });

  // Drag & drop
  ;['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); }));
  ;['dragleave','drop'].forEach(ev => drop.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer?.files || []));

  // File picker
  filePicker.addEventListener('change', (e) => handleFiles(e.target.files || []));

  btnClear.addEventListener('click', () => {
    queue = [];
    queueEl.innerHTML = '';
    outEl.innerHTML = '';
    filePicker.value = '';
  });

  let queue = [];

  function handleFiles(fileList) {
    const arr = Array.from(fileList || []).filter(f => /^image\//i.test(f.type || ''));
    arr.forEach(file => {
      const id = `q-${Math.random().toString(36).slice(2,9)}`;
      queue.push({ id, file });
      queueEl.appendChild(renderQueueItem(id, file));
    });
  }

  function renderQueueItem(id, file) {
    const div = document.createElement('div');
    div.className = 'q-item';
    div.id = id;

    const url = URL.createObjectURL(file);
    const kb = Math.round(file.size / 1024);

    div.innerHTML = `
      <div class="q-thumb"><img src="${url}" alt=""></div>
      <div>
        <div class="q-name">${esc(file.name)}</div>
        <div class="q-meta">${esc(file.type || 'unknown')} · ${kb} KB</div>
        <div class="q-actions">
          <button class="btn" data-act="remove">Remove</button>
        </div>
      </div>
    `;

    div.querySelector('[data-act="remove"]').addEventListener('click', () => {
      queue = queue.filter(q => q.id !== id);
      div.remove();
      URL.revokeObjectURL(url);
    });

    return div;
  }

  btnConvert.addEventListener('click', async () => {
    if (!queue.length) return;

    outEl.innerHTML = '';
    const targetFmt = fmtSel.value;                 // image/png, image/jpeg, image/webp, image/avif
    const quality = Number(qualityEl.value || 0.92);
    const maxW = Number(maxWEl.value || 0);
    const maxH = Number(maxHEl.value || 0);
    const keepAlpha = !!keepAlphaEl.checked;
    const bg = bgColorEl.value || '#000000';

    for (const item of queue) {
      try {
        const { blob, width, height } = await convertImage(item.file, {
          targetFmt, quality, maxW, maxH, keepAlpha, bg
        });

        const outURL = URL.createObjectURL(blob);
        const name = outName(item.file.name, targetFmt);
        const kb = Math.round(blob.size / 1024);

        const card = document.createElement('div');
        card.className = 'out-item';
        card.innerHTML = `
          <div class="thumb"><img src="${outURL}" alt=""></div>
          <div class="meta">${esc(name)} · ${kb} KB · ${width}×${height}</div>
          <a class="btn" href="${outURL}" download="${attr(name)}">Download</a>
        `;
        outEl.appendChild(card);

      } catch (err) {
        console.error('convert failed', err);
        const card = document.createElement('div');
        card.className = 'out-item';
        card.innerHTML = `<div class="meta" style="color:#e88">Failed to convert ${esc(item.file.name)}: ${esc(err.message || err)}</div>`;
        outEl.appendChild(card);
      }
    }
  });

  async function convertImage(file, opts) {
    const img = await loadImage(file);
    const { targetFmt, quality, maxW, maxH, keepAlpha, bg } = opts;

    // Calculate output dimensions
    let w = img.naturalWidth || img.videoWidth || img.width;
    let h = img.naturalHeight || img.videoHeight || img.height;

    if (maxW > 0 || maxH > 0) {
      const rW = maxW > 0 ? maxW / w : Infinity;
      const rH = maxH > 0 ? maxH / h : Infinity;
      const r = Math.min(rW, rH);
      if (isFinite(r) && r > 0 && r < 1) {
        w = Math.max(1, Math.floor(w * r));
        h = Math.max(1, Math.floor(h * r));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: keepAlpha });

    // Fill background for opaque formats or when user forces background
    const wantsOpaque = targetFmt === 'image/jpeg' || !keepAlpha;
    if (wantsOpaque) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.drawImage(img, 0, 0, w, h);

    const blob = await toBlob(canvas, targetFmt, quality);
    if (!blob) throw new Error('Export failed — format may not be supported by this browser.');

    return { blob, width: w, height: h };
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = URL.createObjectURL(file);
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      // Prefer toBlob if available (avoids base64)
      if (canvas.toBlob) {
        canvas.toBlob((b) => resolve(b), type, quality);
      } else {
        const dataURL = canvas.toDataURL(type, quality);
        const b = dataURLtoBlob(dataURL);
        resolve(b);
      }
    });
  }

  function dataURLtoBlob(dataURL) {
    const [head, data] = dataURL.split(',');
    const mime = /data:(.*?);base64/.exec(head)?.[1] || 'application/octet-stream';
    const bin = atob(data);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function outName(name, mime) {
    const ext = mimeToExt(mime);
    return name.replace(/\.[^.]+$/, '') + '.' + ext;
  }
  function mimeToExt(mime) {
    switch (mime) {
      case 'image/png':  return 'png';
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/avif': return 'avif';
      default: return 'img';
    }
  }

  function testSupport(mime) {
    const c = document.createElement('canvas');
    // A non-empty string indicates success
    return c.toDataURL(mime).startsWith(`data:${mime}`);
  }
  function hideOption(value) {
    const opt = Array.from(document.querySelectorAll('#fmt option')).find(o => o.value === value);
    if (opt) opt.disabled = true;
  }

  /* ---------- helpers ---------- */
  function esc(s)  { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function attr(s) { return String(s).replace(/"/g, '&quot;'); }
  function li(label, value) { return `<li><strong>${esc(label)}</strong> ${value}</li>`; }
  function liLink(label, href, ext=false) {
    const a = `<a href="${attr(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(href)}</a>`;
    return `<li><strong>${esc(label)}</strong> ${a}</li>`;
  }
})();

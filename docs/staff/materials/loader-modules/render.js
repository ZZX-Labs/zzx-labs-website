// DOM rendering, TOC, collapsibles, sanitize, UX helpers

import { HEADERS_TO_INCLUDE } from './config.js';
import { slugify, displayTitleString, isCollapsibleHeading } from './utils.js';

export function sanitizeAndRewrite(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  ['script','style','meta','link'].forEach(sel =>
    doc.querySelectorAll(sel).forEach(n => n.remove())
  );

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
      // keep in-page anchor
    } else if (href.startsWith('/')) {
      a.setAttribute('href', `https://en.wikipedia.org${href}`);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  doc.querySelectorAll('.mw-editsection, .toc, .navbox, .metadata')
     .forEach(n => n.remove());
  doc.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));

  return doc.body.innerHTML;
}

// Heuristic: does this section *look* like references/citations?
export function isReferenceLikeHTML(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');

    if (doc.querySelector('ol.references, .reflist, .mw-references-wrap')) return true;
    if (doc.querySelector('sup.reference, a[href^="#cite_note"], a[href^="#cite_ref"]')) return true;

    const sups = Array.from(doc.querySelectorAll('sup'));
    let refy = 0;
    for (const s of sups) {
      const t = (s.textContent || '').trim();
      if (/^\[\d+\]$/.test(t) || /^\d{1,3}$/.test(t) || t === '^' || t === '†') refy++;
      const a = s.querySelector('a[href^="#cite_"]');
      if (a) refy++;
    }
    return refy >= 4;
  } catch { return false; }
}

// Problems panel (stateless; pass in the array)
export function mountProblemsPanel(PROBLEMS) {
  const container = document.querySelector('.page-container') || document.body;
  let panel = document.getElementById('problems-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'problems-panel';
    panel.className = 'notice';
    panel.style.display = 'none';
    const bc = container.querySelector('.breadcrumbs');
    if (bc && bc.parentNode === container) {
      container.insertBefore(panel, bc.nextSibling);
    } else {
      container.insertBefore(panel, container.firstChild);
    }
  }
  if (PROBLEMS.length) {
    panel.style.display = '';
    const items = PROBLEMS.map(p => `<li>${p}</li>`).join('');
    panel.innerHTML = `<strong>Problems detected:</strong><ul style="margin:.5rem 0 0 1rem">${items}</ul>`;
  } else {
    panel.style.display = 'none';
  }
}

export function addTOCSourceBlock(TOC_EL, srcId, title, sections) {
  const wrap = document.createElement('div');
  wrap.className = 'toc-source';
  wrap.setAttribute('data-source', title);

  const h = document.createElement('div');
  h.className = 'source';
  const link = document.createElement('a');
  link.href = `#${srcId}`;
  link.textContent = displayTitleString(title);
  h.appendChild(link);
  wrap.appendChild(h);

  const list = document.createElement('ul');
  (sections || []).forEach(s => {
    if (s.toclevel === 0) return;
    const li = document.createElement('li');
    li.setAttribute('data-section', (s.line || '').toLowerCase());
    const a = document.createElement('a');
    a.href = `#${srcId}--sec-${s.index}`;
    a.textContent = s.line;
    li.appendChild(a);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  TOC_EL.appendChild(wrap);
}

export function renderSourceHeader(TARGET_EL, srcId, title, pageUrl, updated) {
  const section = document.createElement('section');
  section.id = srcId;

  const head = document.createElement('div');
  head.className = 'source-header';

  const h2 = document.createElement('h2');
  const a = document.createElement('a');
  a.href = pageUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  a.textContent = displayTitleString(title);
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  h2.appendChild(a);

  const badge = document.createElement('span');
  badge.className = 'pill';
  badge.textContent = 'Wikipedia';

  const updatedSpan = document.createElement('span');
  updatedSpan.className = 'updated-time';
  updatedSpan.textContent = updated ? `Last updated: ${updated.toLocaleString()}` : '';

  head.appendChild(h2);
  head.appendChild(badge);
  head.appendChild(updatedSpan);
  section.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'source-meta';
  meta.textContent = a.href;
  section.appendChild(meta);

  const content = document.createElement('div');
  content.className = 'source-content';
  section.appendChild(content);

  TARGET_EL.appendChild(section);
  return content;
}

export function renderSubsection(contentEl, srcId, s, html) {
  const id = `${srcId}--sec-${s.index}`;
  const title = s.line;

  const shouldCollapse = isCollapsibleHeading(title) || s.refLike === true || isReferenceLikeHTML(html);

  if (shouldCollapse) {
    const details = document.createElement('details');
    details.className = 'subsection collapsible';
    details.id = id;
    details.open = false;

    const summary = document.createElement('summary');
    summary.textContent = title || 'References';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'collapsible-body';
    body.innerHTML = html;
    details.appendChild(body);

    contentEl.appendChild(details);
    if (location.hash.replace('#', '') === id) details.open = true;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'subsection';
  wrap.id = id;

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const body = document.createElement('div');
  body.innerHTML = html;

  wrap.appendChild(h3);
  wrap.appendChild(body);
  contentEl.appendChild(wrap);
}

export function setupTocFilter(INPUT_EL, TOC_EL) {
  if (!INPUT_EL) return;
  INPUT_EL.addEventListener('input', () => {
    const q = INPUT_EL.value.trim().toLowerCase();
    const blocks = TOC_EL.querySelectorAll('.toc-source');
    blocks.forEach(block => {
      let anyVisible = false;
      block.querySelectorAll('li').forEach(li => {
        const match = !q || li.getAttribute('data-section')?.includes(q);
        li.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });
      block.style.display = anyVisible || !q ? '' : 'none';
    });
  });
}

export function openIfCollapsibleTarget(id) {
  const el = document.getElementById(id);
  if (el && el.tagName.toLowerCase() === 'details' && el.classList.contains('collapsible')) {
    el.open = true;
  }
}

export function attachNavCollapsibleHandlers() {
  const toc = document.getElementById('toc');
  if (toc) {
    toc.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      requestAnimationFrame(() => openIfCollapsibleTarget(id));
    });
  }
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id) openIfCollapsibleTarget(id);
  });
}

// Render from cached record
export function renderFromCache(rec) {
  const TOC_EL = document.getElementById('toc-content');
  const TARGET_EL = document.getElementById('sources');

  const srcId = `src-${slugify(rec.title)}`;
  addTOCSourceBlock(TOC_EL, srcId, rec.title, rec.sections);
  const contentEl = renderSourceHeader(TARGET_EL, srcId, rec.title, rec.url, rec.updated ? new Date(rec.updated) : null);
  for (const s of rec.sections) {
    renderSubsection(contentEl, srcId, s, s.html || '');
  }
}

export function filterSectionsByPolicy(allSections, fragment) {
  if (fragment) {
    const fragLower = fragment.toLowerCase().replace(/_/g,' ');
    const byAnchor = allSections.find(s => (s.anchor || '').toLowerCase() === fragment.toLowerCase());
    const byLine   = allSections.find(s => (s.line   || '').toLowerCase() === fragLower);
    return (byAnchor || byLine) ? [byAnchor || byLine] : allSections;
  }
  if (HEADERS_TO_INCLUDE) {
    return allSections.filter(s => HEADERS_TO_INCLUDE.includes(s.index));
  }
  return allSections;
    }

// I-Ching project page loader + calculator
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
      f.innerHTML = `<img src="${attr(src)}" alt="${esc(m.title || 'IChing')}" loading="lazy" decoding="async" />`;
      imgGrid.appendChild(f);
    });
    imgNote.style.display = imgs.length ? 'none' : '';

  } catch (e) {
    console.error(e);
    descEl.textContent = `Failed to load project manifest: ${e.message}`;
  }

  /* ================= Calculator ================= */
  const form = document.getElementById('iching-form');
  const modeInputs = form.querySelectorAll('input[name="mode"]');
  const whenBTC = form.querySelector('.when-btc');
  const whenFiat = form.querySelector('.when-fiat');

  const tStart = $('tStart');
  const tEnd = $('tEnd');
  const daysBetween = $('daysBetween');

  const btcAmt = $('btcAmt');
  const pStart = $('pStart');
  const pEnd = $('pEnd');

  const fiatAmt = $('fiatAmt');
  const pStartFiat = $('pStartFiat');
  const pEndFiat = $('pEndFiat');

  const feesPct = $('feesPct');
  const note = $('note');

  const outWrap = $('results');
  const outUSD = $('out-usd');
  const outBTC = $('out-btc');
  const outAPR = $('out-apr');
  const outBreak = $('out-breakdown');

  const btnCalc = $('btn-calc');
  const btnExport = $('btn-export');

  function fmtUSD(n){ return isFinite(n) ? `$${n.toLocaleString(undefined,{maximumFractionDigits:2})}` : '—'; }
  function fmtBTC(n){ return isFinite(n) ? n.toFixed(8) : '—'; }
  function diffDays(a,b){ const ms = Math.max(0, (b - a)); return ms / 86400000; }
  function aprFrom(startVal, endVal, days){
    if (!isFinite(startVal) || startVal <= 0 || !isFinite(endVal) || endVal <= 0 || !isFinite(days) || days<=0) return NaN;
    const years = days / 365.2422;
    return (Math.pow(endVal/startVal, 1/years) - 1) * 100;
  }

  function updateMode() {
    const mode = form.querySelector('input[name="mode"]:checked')?.value || 'btc';
    whenBTC.style.display = mode === 'btc' ? '' : 'none';
    whenFiat.style.display = mode === 'fiat' ? '' : 'none';
  }
  modeInputs.forEach(i => i.addEventListener('change', updateMode));
  updateMode();

  function updateDays() {
    const ts = tStart.value ? new Date(tStart.value) : null;
    const te = tEnd.value ? new Date(tEnd.value) : null;
    daysBetween.value = (ts && te) ? diffDays(ts, te).toFixed(2) : '';
  }
  [tStart, tEnd].forEach(el => el.addEventListener('input', updateDays));
  updateDays();

  btnCalc.addEventListener('click', () => {
    const mode = form.querySelector('input[name="mode"]:checked')?.value || 'btc';

    const ts = tStart.value ? new Date(tStart.value) : null;
    const te = tEnd.value ? new Date(tEnd.value) : null;
    const days = (ts && te) ? diffDays(ts, te) : NaN;

    const fee = Math.max(0, Number(feesPct.value || 0)) / 100;

    let oppUSD = NaN, foregoneBTC = NaN, apr = NaN, breakdown = '';

    if (mode === 'btc') {
      const B = Number(btcAmt.value || 0);
      const P0 = Number(pStart.value || 0);
      const P1 = Number(pEnd.value || 0);
      const Bnet = B * (1 - fee); // net BTC after spend/sell fees at start

      // Value you got at start (USD)
      const usdStart = Bnet * P0;

      // Value that BTC would have at end (USD)
      const usdEnd = Bnet * P1;

      // Opportunity cost in USD: difference
      oppUSD = usdEnd - usdStart;

      // BTC foregone is simply the BTC you no longer hold (net of fees)
      foregoneBTC = Bnet;

      // Effective APR based on price change
      apr = aprFrom(P0, P1, days);

      breakdown =
        `Mode: BTC spent/sold at start\n` +
        `BTC amount (gross): ${fmtBTC(B)}\n` +
        `Fees: ${(fee*100).toFixed(2)}%\n` +
        `BTC net considered: ${fmtBTC(Bnet)}\n\n` +
        `Start price: ${fmtUSD(P0)} / BTC\n` +
        `End price:   ${fmtUSD(P1)} / BTC\n` +
        (isFinite(days) ? `Days between: ${days.toFixed(2)}\n` : '') +
        `Value at start: ${fmtUSD(usdStart)}\n` +
        `Value at end:   ${fmtUSD(usdEnd)}\n` +
        `Opportunity cost: ${fmtUSD(oppUSD)}\n` +
        (isFinite(apr) ? `Effective APR over period: ${apr.toFixed(2)}%\n` : '');
    } else {
      // fiat mode: user spent fiat (converted from BTC at start)
      const F = Number(fiatAmt.value || 0);
      const P0 = Number(pStartFiat.value || 0);
      const P1 = Number(pEndFiat.value || 0);
      const Fnet = F * (1 - fee); // net fiat value considered

      // BTC implied by the fiat you spent at start
      const B0 = (P0 > 0) ? (Fnet / P0) : NaN;

      // Value at end if you had instead held that BTC
      const usdEnd = B0 * P1;

      oppUSD = usdEnd - Fnet;      // what you could have had vs what you spent
      foregoneBTC = B0;            // BTC you could have held
      apr = aprFrom(P0, P1, days); // APR from price change

      breakdown =
        `Mode: Fiat spent at start (converted from BTC)\n` +
        `Fiat amount (gross): ${fmtUSD(F)}\n` +
        `Fees: ${(fee*100).toFixed(2)}%\n` +
        `Fiat net considered: ${fmtUSD(Fnet)}\n\n` +
        `Start price: ${fmtUSD(P0)} / BTC\n` +
        `End price:   ${fmtUSD(P1)} / BTC\n` +
        (isFinite(days) ? `Days between: ${days.toFixed(2)}\n` : '') +
        `BTC you could have bought then: ${isFinite(B0)?fmtBTC(B0):'—'}\n` +
        `Value at end if held: ${fmtUSD(usdEnd)}\n` +
        `Opportunity cost: ${fmtUSD(oppUSD)}\n` +
        (isFinite(apr) ? `Effective APR over period: ${apr.toFixed(2)}%\n` : '');
    }

    outUSD.textContent = fmtUSD(oppUSD);
    outBTC.textContent = isFinite(foregoneBTC) ? `${fmtBTC(foregoneBTC)} BTC` : '—';
    outAPR.textContent = isFinite(apr) ? `${apr.toFixed(2)}%` : '—';
    outBreak.textContent = breakdown + (note.value ? `\nNote: ${note.value}` : '');

    outWrap.hidden = false;
  });

  btnExport.addEventListener('click', () => {
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'btc';
    const row = {
      mode,
      tStart: tStart.value || '',
      tEnd: tEnd.value || '',
      days: daysBetween.value || '',
      btcAmt: btcAmt.value || '',
      pStart: pStart.value || pStartFiat.value || '',
      pEnd:   pEnd.value || pEndFiat.value || '',
      fiatAmt: fiatAmt.value || '',
      feesPct: feesPct.value || '0',
      note: note.value || ''
    };
    const csv = toCSV([row]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `iching-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function toCSV(rows) {
    const cols = Object.keys(rows[0] || {});
    const head = cols.join(',');
    const body = rows.map(r => cols.map(c => csvEsc(r[c] ?? '')).join(',')).join('\n');
    return head + '\n' + body + '\n';
  }
  function csvEsc(v) {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

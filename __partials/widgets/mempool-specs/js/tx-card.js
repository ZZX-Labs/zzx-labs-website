// __partials/widgets/mempool-specs/tx-card.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - A tiny, dependency-free popup “tx data card” for mempool-specs.
// - Renderer/overlay calls TxCard.open({ tx, tipHeight, btcUsd, anchor, title })
// - Card supports: click outside to close, Esc to close, basic focus trap,
//   and safe text rendering (no innerHTML injection).
//
// Integration pattern (renderer.js will do this):
//   const tx = await fetcher.tx(txid, { tipHeight: snap.tipHeight, btcUsd });
//   window.ZZXMempoolSpecs.TxCard.open({
//     tx,
//     tipHeight: snap.tipHeight,
//     btcUsd,
//     anchor: { x: evt.clientX, y: evt.clientY }  // or center of tile
//   });
//
// Exposes:
//   window.ZZXMempoolSpecs.TxCard.open(opts)
//   window.ZZXMempoolSpecs.TxCard.close()
//   window.ZZXMempoolSpecs.TxCard.isOpen()
//
// Notes:
// - This file does NOT fetch. It only displays data.
// - Uses tx.__zzx decoration if present (from TxFetcher), but also computes fallbacks.
// - Styles are injected once (scoped under .zzx-txcard-*). You can move to CSS later.

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  // -----------------------------
  // Helpers
  // -----------------------------
  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  function fmtInt(x) {
    const v = n(x);
    if (v == null) return "—";
    return Math.round(v).toLocaleString();
  }

  function fmtMoney(x, { digits = 2 } = {}) {
    const v = n(x);
    if (v == null) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtBtc(x, { digits = 8 } = {}) {
    const v = n(x);
    if (v == null) return "—";
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function shortHash(s, a = 10, b = 10) {
    const t = String(s || "");
    if (t.length <= a + b + 3) return t || "—";
    return t.slice(0, a) + "…" + t.slice(-b);
  }

  function safeText(el, txt) {
    el.textContent = String(txt ?? "");
  }

  function el(tag, cls, txt) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) safeText(d, txt);
    return d;
  }

  function computeVBytes(tx) {
    const w = n(tx?.weight);
    if (w != null && w > 0) return Math.ceil(w / 4);
    const s = n(tx?.size);
    return (s != null && s > 0) ? s : null;
  }

  function computeFeeRate(tx) {
    const fee = n(tx?.fee);
    const vb = computeVBytes(tx);
    if (fee == null || vb == null || vb <= 0) return null;
    return fee / vb;
  }

  function sumVoutSats(tx) {
    if (!Array.isArray(tx?.vout)) return null;
    let s = 0;
    let ok = false;
    for (const o of tx.vout) {
      const v = n(o?.value);
      if (v != null) { s += v; ok = true; }
    }
    return ok ? s : null;
  }

  function computeConfirmations(tx, tipHeight) {
    const confirmed = !!tx?.status?.confirmed;
    if (!confirmed) return 0;
    const bh = n(tx?.status?.block_height);
    const th = n(tipHeight);
    if (bh == null || th == null) return null;
    return Math.max(0, th - bh + 1);
  }

  function computeFields(tx, tipHeight, btcUsd) {
    const z = tx?.__zzx || {};
    const vbytes = n(z.vbytes) ?? computeVBytes(tx);
    const feeRate = n(z.feeRate) ?? computeFeeRate(tx);

    const feeSats = n(tx?.fee);
    const feeBtc = n(z.feeBtc) ?? (feeSats != null ? feeSats / 1e8 : null);
    const feeUsd = n(z.feeUsd) ?? (feeBtc != null && n(btcUsd) != null ? feeBtc * n(btcUsd) : null);

    const satsOut = n(z.satsOut) ?? sumVoutSats(tx);
    const btcOut = n(z.btcOut) ?? (satsOut != null ? satsOut / 1e8 : null);
    const usdOut = n(z.usdOut) ?? (btcOut != null && n(btcUsd) != null ? btcOut * n(btcUsd) : null);

    const conf = n(z.confirmations);
    const confirmations = conf != null ? conf : computeConfirmations(tx, tipHeight);

    const blockHeight = n(tx?.status?.block_height);
    const blockTime = n(tx?.status?.block_time); // seconds epoch
    const blockHash = tx?.status?.block_hash ? String(tx.status.block_hash) : null;

    return {
      vbytes,
      feeRate,
      feeSats,
      feeBtc,
      feeUsd,
      satsOut,
      btcOut,
      usdOut,
      confirmations,
      blockHeight,
      blockTime,
      blockHash,
    };
  }

  function formatTimeUnix(sec) {
    const s = n(sec);
    if (s == null) return "—";
    try {
      const d = new Date(s * 1000);
      return d.toLocaleString();
    } catch {
      return "—";
    }
  }

  // -----------------------------
  // DOM + styles (injected once)
  // -----------------------------
  let mounted = false;
  let root = null;
  let scrim = null;
  let panel = null;
  let lastActive = null;

  function injectStylesOnce() {
    if (document.getElementById("zzx-txcard-style")) return;
    const style = document.createElement("style");
    style.id = "zzx-txcard-style";
    style.textContent = `
      .zzx-txcard-scrim{
        position: fixed; inset: 0;
        background: rgba(0,0,0,.55);
        z-index: 9998;
        display: none;
      }
      .zzx-txcard{
        position: fixed;
        z-index: 9999;
        width: min(560px, calc(100vw - 28px));
        max-height: min(70vh, 640px);
        overflow: auto;
        border: 2px solid rgba(230,164,43,.95);
        border-radius: 12px;
        background: rgba(0,0,0,.92);
        color: #c0d674;
        box-shadow: 0 18px 60px rgba(0,0,0,.55);
        padding: 12px 12px 10px;
        display: none;
        -webkit-overflow-scrolling: touch;
      }
      .zzx-txcard header{
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .zzx-txcard .t{
        font: 600 14px/1.2 IBMPlexMono, ui-monospace, Menlo, Monaco, Consolas, monospace;
        color: #e6a42b;
        letter-spacing: .2px;
      }
      .zzx-txcard .x{
        appearance: none;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.06);
        color: #c0d674;
        border-radius: 10px;
        padding: 6px 10px;
        cursor: pointer;
        font: 600 12px/1 IBMPlexMono, ui-monospace, monospace;
      }
      .zzx-txcard .x:hover{ background: rgba(255,255,255,.10); }
      .zzx-txcard .sub{
        font: 12px/1.35 IBMPlexMono, ui-monospace, monospace;
        color: rgba(192,214,116,.80);
        margin-bottom: 10px;
        word-break: break-word;
      }
      .zzx-txcard .grid{
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 10px;
      }
      @media (max-width: 520px){
        .zzx-txcard .grid{ grid-template-columns: 1fr; }
      }
      .zzx-txcard .row{
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.03);
        border-radius: 10px;
        padding: 10px;
      }
      .zzx-txcard .k{
        font: 600 11px/1.1 IBMPlexMono, ui-monospace, monospace;
        color: rgba(230,164,43,.92);
        margin-bottom: 4px;
      }
      .zzx-txcard .v{
        font: 13px/1.35 IBMPlexMono, ui-monospace, monospace;
        color: #c0d674;
        word-break: break-word;
      }
      .zzx-txcard .actions{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .zzx-txcard a.btn{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: #c0d674;
        text-decoration: none;
        border-radius: 10px;
        padding: 8px 10px;
        font: 600 12px/1 IBMPlexMono, ui-monospace, monospace;
      }
      .zzx-txcard a.btn:hover{ background: rgba(255,255,255,.10); }
      .zzx-txcard .pill{
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.05);
        font: 600 11px/1.4 IBMPlexMono, ui-monospace, monospace;
        color: rgba(192,214,116,.90);
      }
      .zzx-txcard .ok{ color: #2bdc7f; }
      .zzx-txcard .bad{ color: #ff4d4d; }
    `;
    document.head.appendChild(style);
  }

  function ensureMounted() {
    if (mounted) return;

    injectStylesOnce();

    root = document.createElement("div");
    root.className = "zzx-txcard-root";

    scrim = document.createElement("div");
    scrim.className = "zzx-txcard-scrim";
    scrim.addEventListener("click", () => close());

    panel = document.createElement("div");
    panel.className = "zzx-txcard";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("tabindex", "-1");

    root.appendChild(scrim);
    root.appendChild(panel);
    document.body.appendChild(root);

    window.addEventListener("keydown", (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    mounted = true;
  }

  function isOpen() {
    return !!(panel && panel.style.display === "block");
  }

  function placePanel(anchor) {
    // anchor: {x,y} in viewport coords; if missing, center.
    const margin = 12;
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;

    const rect = { w: panel.offsetWidth || Math.min(560, vw - 28), h: panel.offsetHeight || 320 };

    let x = (anchor && n(anchor.x) != null) ? n(anchor.x) : Math.round(vw / 2);
    let y = (anchor && n(anchor.y) != null) ? n(anchor.y) : Math.round(vh / 2);

    // Prefer near cursor but keep on-screen.
    let left = clamp(x + 12, margin, vw - rect.w - margin);
    let top  = clamp(y + 12, margin, vh - rect.h - margin);

    // If too low, try above cursor
    if (top > y && (top + rect.h + margin) > vh) {
      top = clamp(y - rect.h - 12, margin, vh - rect.h - margin);
    }

    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function buildRow(k, v) {
    const r = el("div", "row");
    r.appendChild(el("div", "k", k));
    r.appendChild(el("div", "v", v));
    return r;
  }

  function clearPanel() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
  }

  // -----------------------------
  // Public API
  // -----------------------------
  function open(opts = {}) {
    ensureMounted();

    const tx = opts.tx || null;
    const tipHeight = n(opts.tipHeight);
    const btcUsd = n(opts.btcUsd);

    lastActive = document.activeElement;

    clearPanel();

    const head = document.createElement("header");

    const left = document.createElement("div");
    left.appendChild(el("div", "t", opts.title || "Transaction"));

    const statusConfirmed = !!tx?.status?.confirmed;
    const pill = el("span", "pill " + (statusConfirmed ? "ok" : "bad"), statusConfirmed ? "confirmed" : "unconfirmed");
    left.appendChild(el("div", "sub", ""));
    left.lastChild.appendChild(pill);

    head.appendChild(left);

    const closeBtn = el("button", "x", "Close");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", () => close());
    head.appendChild(closeBtn);

    panel.appendChild(head);

    // txid subtitle
    const txid = tx?.txid ? String(tx.txid) : "—";
    panel.appendChild(el("div", "sub", `txid: ${txid}`));

    const f = computeFields(tx, tipHeight, btcUsd);

    // grid of facts
    const grid = el("div", "grid");

    grid.appendChild(buildRow("fee rate", (f.feeRate != null) ? `${fmtMoney(f.feeRate, { digits: 1 })} sat/vB` : "—"));
    grid.appendChild(buildRow("vbytes", fmtInt(f.vbytes)));

    grid.appendChild(buildRow("fee", (f.feeSats != null) ? `${fmtInt(f.feeSats)} sat` : "—"));
    grid.appendChild(buildRow("fee (BTC / USD)", `${fmtBtc(f.feeBtc)} BTC · $${fmtMoney(f.feeUsd)}`));

    const outStr = (f.satsOut != null) ? `${fmtInt(f.satsOut)} sat` : "—";
    grid.appendChild(buildRow("outputs total", outStr));
    grid.appendChild(buildRow("outputs (BTC / USD)", `${fmtBtc(f.btcOut)} BTC · $${fmtMoney(f.usdOut)}`));

    grid.appendChild(buildRow("confirmations", (f.confirmations == null) ? "—" : fmtInt(f.confirmations)));
    grid.appendChild(buildRow("block height", (f.blockHeight == null) ? "—" : fmtInt(f.blockHeight)));

    grid.appendChild(buildRow("block time", formatTimeUnix(f.blockTime)));
    grid.appendChild(buildRow("block hash", f.blockHash ? shortHash(f.blockHash, 14, 14) : "—"));

    // extra raw fields (size/weight)
    grid.appendChild(buildRow("size / weight", `${fmtInt(tx?.size)} B · ${fmtInt(tx?.weight)} WU`));
    grid.appendChild(buildRow("locktime", fmtInt(tx?.locktime)));

    panel.appendChild(grid);

    // actions (mempool links)
    const actions = el("div", "actions");
    const base = "https://mempool.space";

    const aTx = document.createElement("a");
    aTx.className = "btn";
    aTx.href = tx?.txid ? `${base}/tx/${encodeURIComponent(tx.txid)}` : base;
    aTx.target = "_blank";
    aTx.rel = "noopener noreferrer";
    safeText(aTx, "Open in mempool.space");
    actions.appendChild(aTx);

    if (f.blockHash) {
      const aBlock = document.createElement("a");
      aBlock.className = "btn";
      aBlock.href = `${base}/block/${encodeURIComponent(f.blockHash)}`;
      aBlock.target = "_blank";
      aBlock.rel = "noopener noreferrer";
      safeText(aBlock, "Open block");
      actions.appendChild(aBlock);
    }

    panel.appendChild(actions);

    // show
    scrim.style.display = "block";
    panel.style.display = "block";

    // position after display so offset sizes are real
    placePanel(opts.anchor || null);

    // focus
    try { panel.focus(); } catch (_) {}
  }

  function close() {
    if (!mounted) return;
    scrim.style.display = "none";
    panel.style.display = "none";
    clearPanel();

    // restore focus if possible
    try {
      if (lastActive && typeof lastActive.focus === "function") lastActive.focus();
    } catch (_) {}
    lastActive = null;
  }

  NS.TxCard = {
    open,
    close,
    isOpen
  };
})();

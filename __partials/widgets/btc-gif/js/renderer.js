// __partials/widgets/btc-gif/js/renderer.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBTCGifRenderer?.__version >= 1) return;

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function size(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, finite(W.devicePixelRatio) || 1);
    const width = Math.max(1, Math.round((rect.width || 320) * dpr));
    const height = Math.max(1, Math.round((rect.height || 180) * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    return { width, height, dpr };
  }

  function fitImage(ctx, img, width, height) {
    if (!img?.naturalWidth || !img?.naturalHeight) return false;

    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (width - w) / 2;
    const y = (height - h) / 2;

    ctx.drawImage(img, x, y, w, h);
    return true;
  }

  function draw(canvas, img, market) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = size(canvas);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    try { fitImage(ctx, img, width, height); } catch (_) {}

    const panelH = Math.max(48 * dpr, height * .27);
    const y = height - panelH;

    const gradient = ctx.createLinearGradient(0, y, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,.20)");
    gradient.addColorStop(.22, "rgba(0,0,0,.76)");
    gradient.addColorStop(1, "rgba(0,0,0,.94)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, width, panelH);

    const pad = 10 * dpr;
    const price = market?.priceText || "BTC —";
    const delta = market?.deltaText || "24h —";
    const detail = market?.detailText || "ZZX Global BPI";

    ctx.textBaseline = "alphabetic";
    ctx.font = `${Math.max(16, 20 * dpr)}px ui-monospace,monospace`;
    ctx.fillStyle = "#c0d674";
    ctx.fillText(price, pad, height - 24 * dpr);

    ctx.font = `${Math.max(10, 11 * dpr)}px ui-monospace,monospace`;
    ctx.fillStyle =
      market?.deltaTone === "down"
        ? "#d67474"
        : market?.deltaTone === "up"
          ? "#c0d674"
          : "#e6a42b";

    const deltaWidth = ctx.measureText(delta).width;
    ctx.fillText(delta, Math.max(pad, width - pad - deltaWidth), height - 24 * dpr);

    ctx.fillStyle = "#e6a42b";
    ctx.fillText(detail, pad, height - 8 * dpr);
  }

  W.ZZXBTCGifRenderer = Object.freeze({
    __version: 1,
    draw,
    size
  });
})();

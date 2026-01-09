// __partials/widgets/mempool-specs/widget.js
// DROP-IN COMPLETE REPLACEMENT
//
// Coordinates rendering pipeline for mempool-specs
// Uses:
//   TxFetcher → snapshot
//   Grid → canvas sizing
//   Scaler → tx square sizing
//   Sorter → packing
//   Plotter → drawing
//   Anim → transitions
//
// No networking logic lives here beyond calling TxFetcher.

(function () {
  "use strict";

  const W = window;
  const ID = "mempool-specs";
  const NS = (W.ZZXMempoolSpecs = W.ZZXMempoolSpecs || {});

  const {
    TxFetcher,
    Grid,
    Scaler,
    Sorter,
    Plotter,
    Theme,
    Anim
  } = NS;

  if (!TxFetcher || !Grid || !Scaler || !Sorter || !Plotter || !Anim) {
    console.warn("[mempool-specs] missing modules");
    return;
  }

  function qs(root, sel) {
    return root.querySelector(sel);
  }

  function ensureCanvas(root) {
    const host = qs(root, "[data-ms-block]");
    if (!host) return null;

    let c = host.querySelector("canvas");
    if (!c) {
      c = document.createElement("canvas");
      host.appendChild(c);
    }
    return c;
  }

  function setText(root, sel, txt) {
    const el = qs(root, sel);
    if (el) el.textContent = txt;
  }

  function computeBands(hist) {
    return hist
      .map(([fee, vb]) => ({
        feeRate: Number(fee),
        vbytes: Number(vb)
      }))
      .filter(x => x.vbytes > 0 && x.feeRate >= 0)
      .sort((a, b) => b.feeRate - a.feeRate);
  }

  function bandsToSquares(bands, scaler) {
    const squares = [];
    const MAX = 400;

    for (const b of bands) {
      let chunks = Math.max(1, Math.min(16, Math.floor(b.vbytes / 12000)));
      const vbPer = Math.floor(b.vbytes / chunks);

      for (let i = 0; i < chunks && squares.length < MAX; i++) {
        squares.push({
          txid: `band:${b.feeRate}:${i}`,
          feeRate: b.feeRate,
          side: scaler.sideCellsFromVBytes(vbPer)
        });
      }
      if (squares.length >= MAX) break;
    }
    return squares;
  }

  function paint(root, st) {
    const canvas = ensureCanvas(root);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const grid = Grid.makeGrid(canvas);

    const sig = `${grid.cols}x${grid.rows}`;
    const gridChanged = sig !== st.gridSig;
    st.gridSig = sig;

    if (!st.histogram) {
      Plotter.draw(ctx, canvas, grid, { placed: [] }, "no data");
      return;
    }

    const bands = computeBands(st.histogram);
    const squares = bandsToSquares(bands, st.scaler);
    const layout = Sorter.packSquares(squares, grid, { seed: st.tipHeight });

    const meta =
      `block/0 fill · ${layout.placed.length} tx tiles`;

    setText(root, "[data-ms-summary]", meta);
    setText(
      root,
      "[data-ms-sub]",
      `tip ${st.tipHeight ?? "—"} · mempool.space`
    );

    if (!st.lastLayout || gridChanged) {
      Plotter.draw(ctx, canvas, grid, layout, meta);
      st.lastLayout = layout;
      return;
    }

    st.anim.play(st.lastLayout, layout, (l) => {
      Plotter.draw(ctx, canvas, grid, l, meta);
    });

    st.lastLayout = layout;
  }

  async function tick(root, st) {
    try {
      const snap = await st.fetcher.snapshot();
      st.tipHeight = snap.tipHeight;
      st.histogram = snap.feeHistogram;
      paint(root, st);
    } catch (e) {
      setText(root, "[data-ms-sub]", "error loading mempool");
    }
  }

  function boot(root) {
    if (root.__zzxMS) return;

    const st = {
      fetcher: new TxFetcher(),
      scaler: new Scaler(),
      anim: new Anim.Anim({ ms: 600 }),
      histogram: null,
      lastLayout: null,
      gridSig: ""
    };

    root.__zzxMS = st;
    ensureCanvas(root);

    tick(root, st);
    st.timer = setInterval(() => tick(root, st), 15_000);

    window.addEventListener("resize", () => paint(root, st));
  }

  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, boot);
  } else if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, boot);
  }
})();

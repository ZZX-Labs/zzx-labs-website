// __partials/widgets/tip-drift/widget.js
// Block Height Clock + Visual Drift
//
// This replaces the legacy ctx.util.* implementation you pasted :contentReference[oaicite:0]{index=0}
// while keeping the SAME HTML :contentReference[oaicite:1]{index=1} and CSS :contentReference[oaicite:2]{index=2}.
//
// What it does (no layout changes):
// - Main value: chain tip height
// - Subline: local time zone label + UTC label (derived from user locale via Intl)
// - "since": time since tip block in minutes + exact UTC + local timestamps
// - "avg": avg interval over last N blocks + Δ10m drift + "last" interval drift
// - Visual drift: colorize the avg line green (<10m), red (>10m), neutral (~10m)
// - Updates every 15s
//
// NOTE on “EST”: true EST/EDT depends on locale/time zone.
// We will render BOTH:
//   - UTC (always)
//   - Local TZ (auto from user’s browser; could be EST/EDT in America/New_York)
// This is the correct, non-lying behavior without IP geolocation.

(function () {
  const ID = "tip-drift";

  function fmt2(n) { return String(n).padStart(2, "0"); }

  function tzLabel() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"; }
    catch { return "Local"; }
  }

  function fmtLocal(tsSec) {
    try {
      const d = new Date(tsSec * 1000);
      // Use locale default tz
      return d.toLocaleString(undefined, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    } catch {
      return "—";
    }
  }

  function fmtUTC(tsSec) {
    const d = new Date(tsSec * 1000);
    if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
    return `${d.getUTCFullYear()}-${fmt2(d.getUTCMonth() + 1)}-${fmt2(d.getUTCDate())} ` +
           `${fmt2(d.getUTCHours())}:${fmt2(d.getUTCMinutes())}:${fmt2(d.getUTCSeconds())} UTC`;
  }

  function setVal(card, valText, subText) {
    const v = card?.querySelector("[data-val]");
    const s = card?.querySelector("[data-sub]");
    if (v) v.textContent = valText;
    if (s) s.textContent = subText;
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="tip-drift"]');
      this.sinceEl = this.card?.querySelector("[data-since]");
      this.avgEl = this.card?.querySelector("[data-avg]");
      this._t = null;
    },

    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const N = 8; // sample size for avg; 6–12 is reasonable and stable

      const run = async () => {
        const card = this.card;
        if (!card) return;

        try {
          // Tip height (text endpoint)
          const heightUrl = `${MEMPOOL}/blocks/tip/height`;
          const heightText = await (ctx.fetchText
            ? ctx.fetchText(heightUrl)
            : fetch(heightUrl, { cache: "no-store" }).then(r => r.text())
          );
          const h = parseInt(String(heightText).trim(), 10);

          // Blocks list for timestamps
          const blocks = await ctx.fetchJSON(`${MEMPOOL}/blocks`);
          const arr = Array.isArray(blocks) ? blocks : [];
          const tip = arr[0];

          const tsTip = Number(tip?.timestamp);
          const tz = tzLabel();

          setVal(
            card,
            Number.isFinite(h) ? String(h) : "—",
            `UTC + ${tz}`
          );

          // "since" line: minutes since tip + UTC/local stamp of tip time
          if (Number.isFinite(tsTip) && this.sinceEl) {
            const sinceSec = Math.max(0, Math.round(Date.now() / 1000 - tsTip));
            const sinceMin = sinceSec / 60;

            const utc = fmtUTC(tsTip);
            const loc = fmtLocal(tsTip);

            this.sinceEl.textContent =
              `+${sinceMin.toFixed(1)}m · ${utc} · ${tz}: ${loc}`;
          } else if (this.sinceEl) {
            this.sinceEl.textContent = "—";
          }

          // Average interval + drift (avg vs 10m) + last interval drift
          const ts = arr.slice(0, N).map(b => Number(b?.timestamp)).filter(Number.isFinite);

          if (ts.length >= 3 && this.avgEl) {
            // diffs are in seconds between successive blocks
            const diffs = [];
            for (let i = 0; i < ts.length - 1; i++) {
              diffs.push(ts[i] - ts[i + 1]);
            }

            const avgSec = diffs.reduce((a, x) => a + x, 0) / diffs.length;
            const avgMin = avgSec / 60;

            const lastSec = diffs[0];          // tip - prev
            const lastMin = lastSec / 60;

            const delta10 = avgMin - 10;
            const deltaLast = lastMin - 10;

            // Visual drift: slight color coding without CSS changes (inline only)
            this.avgEl.style.fontWeight = "700";
            if (avgMin > 10.25) this.avgEl.style.color = "#ff4d4d";       // red (slow)
            else if (avgMin < 9.75) this.avgEl.style.color = "#c0d674";   // green (fast)
            else this.avgEl.style.color = "";                             // neutral

            this.avgEl.textContent =
              `avg ${avgMin.toFixed(2)}m (Δ10 ${delta10 >= 0 ? "+" : ""}${delta10.toFixed(2)}m) · ` +
              `last ${lastMin.toFixed(2)}m (Δ10 ${deltaLast >= 0 ? "+" : ""}${deltaLast.toFixed(2)}m)`;
          } else if (this.avgEl) {
            this.avgEl.style.color = "";
            this.avgEl.style.fontWeight = "";
            this.avgEl.textContent = "—";
          }
        } catch {
          // fail-soft, never break page
          if (this.card) setVal(this.card, "—", "height");
          if (this.sinceEl) this.sinceEl.textContent = "—";
          if (this.avgEl) {
            this.avgEl.style.color = "";
            this.avgEl.style.fontWeight = "";
            this.avgEl.textContent = "—";
          }
        }
      };

      run();
      this._t = setInterval(run, 15_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();

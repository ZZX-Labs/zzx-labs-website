// __partials/widgets/btc-burned/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBurnedModel?.__version >= 1) return;

  const VERIFIED = new Set(["verified"]);
  const CLAIMS = new Set(["claimed", "disputed"]);

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeItem(raw, index) {
    const status = String(raw?.status || "claimed").toLowerCase();

    return {
      id:String(raw?.id || `record-${index + 1}`),
      label:String(raw?.label || "Unnamed burn record"),
      btc:finite(raw?.btc),
      when:raw?.when ? String(raw.when) : "",
      source:raw?.source ? String(raw.source) : "",
      category:String(raw?.category || "other"),
      status,
      evidence:String(raw?.evidence || raw?.note || ""),
      notes:String(raw?.notes || ""),
      includeInVerifiedTotal:
        VERIFIED.has(status) &&
        raw?.include_in_verified_total !== false &&
        finite(raw?.btc) >= 0
    };
  }

  function normalize(data) {
    const items = (Array.isArray(data?.items) ? data.items : [])
      .map(normalizeItem);

    const verified = items.filter(item => item.includeInVerifiedTotal);
    const claims = items.filter(item => CLAIMS.has(item.status));

    return {
      schema:String(data?.schema || "zzx-btc-burned-v2"),
      updated:data?.updated || null,
      unit:String(data?.unit || "BTC"),
      methodology:String(data?.methodology || ""),
      items,
      verified,
      claims,
      verifiedTotal:verified.reduce((sum, item) => sum + item.btc, 0),
      claimedTotal:claims.reduce(
        (sum, item) => sum + (Number.isFinite(item.btc) ? item.btc : 0),
        0
      )
    };
  }

  function filter(model, mode, search) {
    const needle = String(search || "").trim().toLowerCase();

    let rows =
      mode === "verified"
        ? model.verified
        : mode === "claims"
          ? model.claims
          : model.items;

    if (needle) {
      rows = rows.filter(item =>
        [
          item.label,
          item.category,
          item.status,
          item.evidence,
          item.notes,
          item.when
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    return rows;
  }

  W.ZZXBurnedModel = Object.freeze({
    __version:1,
    normalize,
    filter
  });
})();

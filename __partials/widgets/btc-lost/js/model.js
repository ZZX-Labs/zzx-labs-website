// Shared evidence-aware loss model. Copied into each widget's js/ directory.
(function () {
  "use strict";

  const W = window;
  if (W.ZZXLossEvidenceModel?.__version >= 1) return;

  const VERIFIED = new Set(["verified"]);
  const NONVERIFIED = new Set(["claimed","estimated","disputed","template","excluded"]);

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeItem(raw, index) {
    const status = String(raw?.status || "claimed").toLowerCase();

    return {
      id: String(raw?.id || `record-${index + 1}`),
      label: String(raw?.label || "Unnamed record"),
      btc: finite(raw?.btc),
      btcMin: finite(raw?.btc_min),
      btcMax: finite(raw?.btc_max),
      when: raw?.when ? String(raw.when) : "",
      source: raw?.source ? String(raw.source) : "",
      category: String(raw?.category || "other"),
      status,
      evidence: String(raw?.evidence || raw?.note || ""),
      notes: String(raw?.notes || ""),
      includeInVerifiedTotal:
        VERIFIED.has(status) &&
        raw?.include_in_verified_total !== false &&
        finite(raw?.btc) >= 0
    };
  }

  function normalize(data) {
    const items = (Array.isArray(data?.items) ? data.items : []).map(normalizeItem);

    const verified = items.filter(item => item.includeInVerifiedTotal);
    const nonverified = items.filter(item => !item.includeInVerifiedTotal);

    const verifiedTotal = verified.reduce((sum, item) => sum + item.btc, 0);

    const estimatedMin = nonverified.reduce((sum, item) => {
      if (Number.isFinite(item.btcMin)) return sum + item.btcMin;
      if (Number.isFinite(item.btc) && ["claimed","estimated","disputed"].includes(item.status)) return sum + item.btc;
      return sum;
    }, 0);

    const estimatedMax = nonverified.reduce((sum, item) => {
      if (Number.isFinite(item.btcMax)) return sum + item.btcMax;
      if (Number.isFinite(item.btc) && ["claimed","estimated","disputed"].includes(item.status)) return sum + item.btc;
      return sum;
    }, 0);

    return {
      schema: String(data?.schema || "zzx-loss-evidence-v1"),
      updated: data?.updated || null,
      unit: String(data?.unit || "BTC"),
      kind: String(data?.kind || "unknown"),
      methodology: String(data?.methodology || ""),
      items,
      verified,
      nonverified,
      verifiedTotal,
      estimatedMin,
      estimatedMax
    };
  }

  function filter(model, mode, search) {
    const needle = String(search || "").trim().toLowerCase();

    let rows =
      mode === "verified"
        ? model.verified
        : mode === "nonverified"
          ? model.nonverified
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

  W.ZZXLossEvidenceModel = Object.freeze({
    __version: 1,
    normalize,
    filter
  });
})();

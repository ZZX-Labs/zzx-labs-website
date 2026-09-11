(function () {
  "use strict";

  const WFB = window.WFB;
  const client = window.ZZXWorldFactbook;
  if (!WFB || !client) return;

  async function loadArchive(options) {
    const opts = options || {};

    const [portal, references, electricity, media, sources] = await Promise.all([
      client.api.optionalJSON("portal-index.json", opts),
      client.api.optionalJSON("reference-index.json", opts),
      client.api.optionalJSON("electricity-history.json", opts),
      client.api.optionalJSON("media-index.json", opts),
      client.api.optionalJSON("source-index.json", opts)
    ]);

    const start = Number(
      portal?.start_year ??
      references?.scan_start_year ??
      electricity?.scan_start_year ??
      client.config.historicalStart
    );

    const end = Number(
      portal?.end_year ??
      references?.scan_end_year ??
      electricity?.scan_end_year ??
      client.config.historicalEnd
    );

    const referenceEditions = Array.isArray(references?.editions) ? references.editions : [];
    const referencePages = Array.isArray(references?.pages) ? references.pages : [];
    const powerRows = Array.isArray(electricity?.records) ? electricity.records : [];
    const portalEditions = Array.isArray(portal?.editions) ? portal.editions : [];

    const byYear = new Map();

    for (let year = start; year <= end; year += 1) {
      byYear.set(year, {
        year,
        status: "unresolved",
        providers: new Set(),
        referencePages: 0,
        electricityRecords: 0,
        media: 0,
        chunks: 0
      });
    }

    portalEditions.forEach((row) => {
      const year = Number(row.year ?? row.edition_year);
      if (!byYear.has(year)) return;
      const target = byYear.get(year);
      target.status = row.status === "available" ? "indexed" : (row.status || "partial");
      target.media = Number(row.images || 0);
      target.chunks = Number(row.chunks || 0);
    });

    referenceEditions.forEach((row) => {
      const year = Number(row.edition_year);
      if (!byYear.has(year)) return;
      const target = byYear.get(year);
      if (target.status === "unresolved") target.status = "partial";
      if (row.provider) target.providers.add(row.provider);
      if (row.extracted_country_pages) target.referencePages += Number(row.extracted_country_pages || 0);
    });

    referencePages.forEach((row) => {
      const year = Number(row.edition_year);
      if (!byYear.has(year)) return;
      const target = byYear.get(year);
      if (target.status === "unresolved") target.status = "partial";
      if (row.provider) target.providers.add(row.provider);
      target.referencePages += 1;
    });

    powerRows.forEach((row) => {
      const year = Number(row.edition_year);
      if (!byYear.has(year)) return;
      const target = byYear.get(year);
      if (target.status === "unresolved") target.status = "partial";
      if (row.source_provider) target.providers.add(row.source_provider);
      target.electricityRecords += 1;
    });

    const mediaRows = Array.isArray(media?.images)
      ? media.images
      : (Array.isArray(media?.records) ? media.records : []);

    mediaRows.forEach((row) => {
      const year = Number(row.edition_year ?? row.year);
      if (!byYear.has(year)) return;
      const target = byYear.get(year);
      if (target.status === "unresolved") target.status = "partial";
      target.media += 1;
    });

    const years = Array.from(byYear.values()).map((row) => ({
      ...row,
      providers: Array.from(row.providers).sort()
    }));

    const indexedYears = years.filter((row) => row.status === "indexed");
    const evidencedYears = years.filter((row) => row.status !== "unresolved");

    return {
      start,
      end,
      years,
      portal,
      references,
      electricity,
      media,
      sources,
      referencePages,
      powerRows,
      mediaRows,
      indexedYears,
      evidencedYears,
      generatedAt:
        portal?.generated_at ||
        references?.generated_at ||
        electricity?.generated_at ||
        media?.generated_at ||
        null
    };
  }

  WFB.api = Object.freeze({
    loadArchive,
    probe: (path) => client.api.optionalJSON(path)
  });
})();

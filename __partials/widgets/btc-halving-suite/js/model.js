// __partials/widgets/btc-halving-suite/js/model.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXHalvingModel?.__version >= 1) return;

  const HALVING_INTERVAL = 210000;
  const INITIAL_SUBSIDY_SATS = 5000000000n;
  const NOMINAL_CAP_SATS = 21000000n * 100000000n;

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function subsidySatsAtHeight(height) {
    const h = Math.floor(finite(height));
    if (!Number.isFinite(h) || h < 0) return 0n;

    const era = Math.floor(h / HALVING_INTERVAL);
    if (era >= 64) return 0n;

    return INITIAL_SUBSIDY_SATS >> BigInt(era);
  }

  function issuedSatsAtHeight(height) {
    const h = Math.floor(finite(height));
    if (!Number.isFinite(h) || h < 0) return 0n;

    let blocks = BigInt(h + 1);
    let total = 0n;
    let era = 0;
    const interval = BigInt(HALVING_INTERVAL);

    while (blocks > 0n && era < 64) {
      const subsidy = INITIAL_SUBSIDY_SATS >> BigInt(era);
      if (subsidy <= 0n) break;

      const take = blocks > interval ? interval : blocks;
      total += take * subsidy;
      blocks -= take;
      era += 1;
    }

    return total;
  }

  function terminalSupplySats() {
    let total = 0n;
    const interval = BigInt(HALVING_INTERVAL);

    for (let era = 0; era < 64; era++) {
      const subsidy = INITIAL_SUBSIDY_SATS >> BigInt(era);
      if (subsidy <= 0n) break;
      total += interval * subsidy;
    }

    return total;
  }

  const TERMINAL_SUPPLY_SATS = terminalSupplySats();

  function cadenceSeconds(blocks) {
    const rows = (Array.isArray(blocks) ? blocks : [])
      .filter(b => Number.isFinite(finite(b?.timestamp)))
      .sort((a,b) => finite(b?.height) - finite(a?.height))
      .slice(0, 10);

    const intervals = [];

    for (let i = 0; i < rows.length - 1; i++) {
      const seconds = finite(rows[i].timestamp) - finite(rows[i + 1].timestamp);
      if (seconds > 0 && seconds < 7200) intervals.push(seconds);
    }

    if (!intervals.length) return 600;

    return intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  }

  function build(height, blocks) {
    const h = Math.floor(finite(height));
    if (!Number.isFinite(h) || h < 0) throw new Error("invalid Bitcoin height");

    const era = Math.floor(h / HALVING_INTERVAL);
    const nextHeight = (era + 1) * HALVING_INTERVAL;
    const blocksRemaining = Math.max(0, nextHeight - h);

    const blockInEpoch = (h % HALVING_INTERVAL) + 1;
    const progress = (blockInEpoch / HALVING_INTERVAL) * 100;

    const subsidySats = subsidySatsAtHeight(h);
    const issuedSats = issuedSatsAtHeight(h);
    const subsidyRemainingSats =
      TERMINAL_SUPPLY_SATS > issuedSats
        ? TERMINAL_SUPPLY_SATS - issuedSats
        : 0n;

    const nominalHeadroomSats =
      NOMINAL_CAP_SATS > issuedSats
        ? NOMINAL_CAP_SATS - issuedSats
        : 0n;

    const cadence = cadenceSeconds(blocks);
    const now = Date.now();

    return {
      height:h,
      era,
      halvingNumber:era + 1,
      nextHeight,
      blocksRemaining,
      blockInEpoch,
      progress,
      subsidySats,
      issuedSats,
      subsidyRemainingSats,
      nominalHeadroomSats,
      terminalSupplySats:TERMINAL_SUPPLY_SATS,
      nominalCapSats:NOMINAL_CAP_SATS,
      cadenceSeconds:cadence,
      targetEtaMs:now + blocksRemaining * 600 * 1000,
      cadenceEtaMs:now + blocksRemaining * cadence * 1000
    };
  }

  W.ZZXHalvingModel = Object.freeze({
    __version:1,
    HALVING_INTERVAL,
    INITIAL_SUBSIDY_SATS,
    NOMINAL_CAP_SATS,
    TERMINAL_SUPPLY_SATS,
    subsidySatsAtHeight,
    issuedSatsAtHeight,
    terminalSupplySats,
    build
  });
})();

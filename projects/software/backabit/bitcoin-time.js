(() => {
  "use strict";

  const AVG_BLOCK_SECONDS = 600;

  function normalizeHeight(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function normalizeTimestampMs(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : Date.now();
  }

  function estimateHeightAt(timestampMs, anchorHeight, anchorTimestampMs) {
    const deltaSeconds = (normalizeTimestampMs(timestampMs) - normalizeTimestampMs(anchorTimestampMs)) / 1000;
    return Math.max(0, Math.floor(normalizeHeight(anchorHeight) + deltaSeconds / AVG_BLOCK_SECONDS));
  }

  function estimateTimeAtHeight(height, anchorHeight, anchorTimestampMs) {
    const deltaBlocks = normalizeHeight(height) - normalizeHeight(anchorHeight);
    return normalizeTimestampMs(anchorTimestampMs) + deltaBlocks * AVG_BLOCK_SECONDS * 1000;
  }

  function unixSeconds(ms) {
    return Math.floor(normalizeTimestampMs(ms) / 1000);
  }

  function cltvScript(lock, pubkeyPlaceholder="<pubkey>") {
    return `${Math.floor(Number(lock))} OP_CHECKLOCKTIMEVERIFY OP_DROP ${pubkeyPlaceholder} OP_CHECKSIG`;
  }

  function csvScript(sequence, pubkeyPlaceholder="<pubkey>") {
    return `${Math.floor(Number(sequence))} OP_CHECKSEQUENCEVERIFY OP_DROP ${pubkeyPlaceholder} OP_CHECKSIG`;
  }

  function blocksForDays(days) {
    return Math.max(1, Math.round(Number(days) * 86400 / AVG_BLOCK_SECONDS));
  }

  function formatSats(sats) {
    return `${Math.round(Number(sats)||0).toLocaleString()} sats`;
  }

  function formatDate(ms) {
    return new Date(normalizeTimestampMs(ms)).toISOString();
  }

  window.BitcoinTime = Object.freeze({
    AVG_BLOCK_SECONDS,
    estimateHeightAt,
    estimateTimeAtHeight,
    unixSeconds,
    cltvScript,
    csvScript,
    blocksForDays,
    formatSats,
    formatDate
  });
})();

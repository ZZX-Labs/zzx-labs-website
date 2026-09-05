// __partials/widgets/btc-blockexplorer/js/explorer.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXBlockExplorer?.__version >= 1) return;

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/g, "");
  }

  function bases(core) {
    return [...new Set([
      core?.ctx?.api?.MEMPOOL,
      core?.ctx?.api?.MEMPOOL_API,
      W.ZZX?.api?.MEMPOOL,
      W.ZZX?.api?.MEMPOOL_API,
      W.ZZX?.API?.MEMPOOL,
      W.ZZX?.API?.MEMPOOL_API,
      "https://mempool.space/api"
    ].map(normalizeBase).filter(Boolean))];
  }

  function classify(raw) {
    const query = String(raw || "").trim();

    if (!query) {
      return { type:"empty", query };
    }

    if (/^\d{1,9}$/.test(query)) {
      return { type:"height", query, height:Number(query) };
    }

    if (/^[0-9a-fA-F]{64}$/.test(query)) {
      return { type:"hash64", query:query.toLowerCase() };
    }

    const base58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
    const bech32 = /^(bc1)[ac-hj-np-z02-9]{11,71}$/i;

    if (base58.test(query) || bech32.test(query)) {
      return { type:"address", query };
    }

    return { type:"unknown", query };
  }

  async function request(base, path, mode) {
    const url = `${base}${path}`;

    if (W.ZZXAPI?.fetchRaw) {
      const response = await W.ZZXAPI.fetchRaw(url, {
        cacheBust:false,
        cache:"no-store",
        credentials:"omit",
        timeoutMs:10000,
        retries:1,
        retryDelayMs:450
      });

      return mode === "text" ? (await response.text()).trim() : await response.json();
    }

    const response = await fetch(url, {
      cache:"no-store",
      credentials:"omit"
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} ${url}`);
      error.status = response.status;
      throw error;
    }

    return mode === "text" ? (await response.text()).trim() : await response.json();
  }

  async function first(core, path, mode="json") {
    let lastError = null;

    for (const base of bases(core)) {
      try {
        return {
          data: await request(base, path, mode),
          base
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("all mempool API providers failed");
  }

  function txModel(tx, base) {
    const totalOut = (tx?.vout || []).reduce((sum, out) => {
      const value = finite(out?.value);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const fee = finite(tx?.fee);
    const weight = finite(tx?.weight);
    const vsize = Number.isFinite(weight) && weight > 0 ? weight / 4 : NaN;
    const feeRate =
      Number.isFinite(fee) && Number.isFinite(vsize) && vsize > 0
        ? fee / vsize
        : NaN;

    return {
      kind:"tx",
      query:tx?.txid || "",
      hero:tx?.txid || "",
      confirmed:Boolean(tx?.status?.confirmed),
      external:`https://mempool.space/tx/${encodeURIComponent(tx?.txid || "")}`,
      metrics:[
        ["status", tx?.status?.confirmed ? "confirmed" : "mempool"],
        ["fee", Number.isFinite(fee) ? `${fee.toLocaleString()} sats` : "—"],
        ["vsize", Number.isFinite(vsize) ? `${Math.round(vsize).toLocaleString()} vB` : "—"],
        ["fee rate", Number.isFinite(feeRate) ? `${feeRate.toFixed(2)} sat/vB` : "—"]
      ],
      details:[
        ["block height", tx?.status?.block_height ?? "unconfirmed"],
        ["inputs", Array.isArray(tx?.vin) ? tx.vin.length : "—"],
        ["outputs", Array.isArray(tx?.vout) ? tx.vout.length : "—"],
        ["output value", `${(totalOut / 1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`],
        ["API", base]
      ]
    };
  }

  function blockModel(block, base) {
    const timestamp = finite(block?.timestamp);

    return {
      kind:"block",
      query:block?.id || "",
      hero:`Block ${Number.isFinite(finite(block?.height)) ? Math.trunc(finite(block.height)).toLocaleString() : "—"}`,
      confirmed:true,
      external:`https://mempool.space/block/${encodeURIComponent(block?.id || "")}`,
      metrics:[
        ["transactions", Number.isFinite(finite(block?.tx_count)) ? Math.trunc(finite(block.tx_count)).toLocaleString() : "—"],
        ["size", Number.isFinite(finite(block?.size)) ? `${Math.trunc(finite(block.size)).toLocaleString()} B` : "—"],
        ["weight", Number.isFinite(finite(block?.weight)) ? Math.trunc(finite(block.weight)).toLocaleString() : "—"],
        ["time", Number.isFinite(timestamp) ? new Date(timestamp * 1000).toLocaleString() : "—"]
      ],
      details:[
        ["hash", block?.id || "—"],
        ["previous", block?.previousblockhash || "—"],
        ["merkle root", block?.merkle_root || "—"],
        ["difficulty", Number.isFinite(finite(block?.difficulty)) ? finite(block.difficulty).toLocaleString(undefined,{maximumFractionDigits:2}) : "—"],
        ["API", base]
      ]
    };
  }

  function addressModel(address, data, base) {
    const chain = data?.chain_stats || {};
    const mempool = data?.mempool_stats || {};

    const funded = finite(chain.funded_txo_sum);
    const spent = finite(chain.spent_txo_sum);
    const balance =
      Number.isFinite(funded) && Number.isFinite(spent)
        ? funded - spent
        : NaN;

    const memFunded = finite(mempool.funded_txo_sum);
    const memSpent = finite(mempool.spent_txo_sum);
    const memDelta =
      Number.isFinite(memFunded) && Number.isFinite(memSpent)
        ? memFunded - memSpent
        : 0;

    return {
      kind:"address",
      query:address,
      hero:address,
      confirmed:true,
      external:`https://mempool.space/address/${encodeURIComponent(address)}`,
      metrics:[
        ["confirmed balance", Number.isFinite(balance) ? `${(balance / 1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC` : "—"],
        ["chain txs", Number.isFinite(finite(chain.tx_count)) ? Math.trunc(finite(chain.tx_count)).toLocaleString() : "—"],
        ["mempool txs", Number.isFinite(finite(mempool.tx_count)) ? Math.trunc(finite(mempool.tx_count)).toLocaleString() : "—"],
        ["mempool delta", `${(memDelta / 1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`]
      ],
      details:[
        ["funded", Number.isFinite(funded) ? `${(funded / 1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC` : "—"],
        ["spent", Number.isFinite(spent) ? `${(spent / 1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC` : "—"],
        ["address type", address.toLowerCase().startsWith("bc1") ? "SegWit / Bech32-family" : "Base58"],
        ["API", base]
      ]
    };
  }

  async function exploreHeight(core, height) {
    const hashResult = await first(core, `/block-height/${height}`, "text");
    if (!/^[0-9a-f]{64}$/i.test(hashResult.data)) {
      throw new Error("invalid block hash returned for height");
    }

    const block = await request(hashResult.base, `/block/${hashResult.data}`, "json");
    return blockModel(block, hashResult.base);
  }

  async function exploreHash64(core, hash) {
    let txError = null;

    for (const base of bases(core)) {
      try {
        const tx = await request(base, `/tx/${hash}`, "json");
        return txModel(tx, base);
      } catch (error) {
        txError = error;
      }
    }

    for (const base of bases(core)) {
      try {
        const block = await request(base, `/block/${hash}`, "json");
        return blockModel(block, base);
      } catch (_) {}
    }

    throw txError || new Error("64-hex identifier is neither a known transaction nor block");
  }

  async function exploreAddress(core, address) {
    const result = await first(core, `/address/${encodeURIComponent(address)}`);
    return addressModel(address, result.data, result.base);
  }

  async function explore(core, raw) {
    const parsed = classify(raw);

    if (parsed.type === "height") {
      return await exploreHeight(core, parsed.height);
    }

    if (parsed.type === "hash64") {
      return await exploreHash64(core, parsed.query);
    }

    if (parsed.type === "address") {
      return await exploreAddress(core, parsed.query);
    }

    throw new Error(
      parsed.type === "empty"
        ? "enter a block height, block/transaction hash, or Bitcoin address"
        : "query format not recognized as a Bitcoin height, 64-hex hash, or mainnet address"
    );
  }

  W.ZZXBlockExplorer = Object.freeze({
    __version:1,
    classify,
    explore,
    bases
  });
})();

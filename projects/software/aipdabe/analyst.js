(() => {
  "use strict";

  const SATS_PER_BTC = 100_000_000;

  function btc(sats) {
    return (Number(sats) || 0) / SATS_PER_BTC;
  }

  function short(value, n = 12) {
    const s = String(value || "");
    if (s.length <= n * 2 + 1) return s;
    return `${s.slice(0, n)}…${s.slice(-n)}`;
  }

  function formatBtc(sats) {
    return `${btc(sats).toFixed(8)} BTC`;
  }

  function transactionMetrics(tx) {
    const inputs = Array.isArray(tx?.vin) ? tx.vin : [];
    const outputs = Array.isArray(tx?.vout) ? tx.vout : [];
    const totalIn = inputs.reduce((sum, vin) => sum + (Number(vin?.prevout?.value) || 0), 0);
    const totalOut = outputs.reduce((sum, vout) => sum + (Number(vout?.value) || 0), 0);
    const fee = Number(tx?.fee);
    const computedFee = totalIn && !inputs.some((vin) => vin.is_coinbase)
      ? Math.max(0, totalIn - totalOut)
      : null;

    return {
      inputs,
      outputs,
      totalIn,
      totalOut,
      fee: Number.isFinite(fee) ? fee : computedFee,
      vsize: Number(tx?.weight) ? Number(tx.weight) / 4 : null,
      confirmed: Boolean(tx?.status?.confirmed),
      status: tx?.status || {}
    };
  }

  function summarizeTransaction(tx) {
    const m = transactionMetrics(tx);
    const lines = [
      `Transaction ${short(tx.txid || tx.id || "unknown")}.`,
      `${m.inputs.length} input(s), ${m.outputs.length} output(s).`,
      `Outputs total ${formatBtc(m.totalOut)}.`
    ];

    if (m.totalIn) lines.push(`Known input value totals ${formatBtc(m.totalIn)}.`);
    if (m.fee != null) {
      lines.push(`Fee ${formatBtc(m.fee)} (${Math.round(m.fee).toLocaleString()} sat).`);
      if (m.vsize) lines.push(`Approximate fee rate ${(m.fee / m.vsize).toFixed(2)} sat/vB.`);
    }

    if (m.confirmed) {
      lines.push(
        `Confirmed${m.status.block_height != null ? ` in block ${m.status.block_height}` : ""}.`
      );
    } else {
      lines.push("Unconfirmed according to the loaded status.");
    }

    const addressOutputs = m.outputs.filter((o) => o.scriptpubkey_address).length;
    const opReturns = m.outputs.filter((o) => o.scriptpubkey_type === "op_return").length;

    if (addressOutputs) lines.push(`${addressOutputs} output(s) expose a standard address in the provider response.`);
    if (opReturns) lines.push(`${opReturns} OP_RETURN output(s) detected.`);

    return lines.join("\n");
  }

  function summarizeBlock(block) {
    return [
      `Block ${short(block.id || block.hash || "unknown")}.`,
      block.height != null ? `Height ${block.height}.` : null,
      block.tx_count != null ? `${block.tx_count.toLocaleString()} transaction(s).` : null,
      block.size != null ? `Serialized size ${Number(block.size).toLocaleString()} bytes.` : null,
      block.weight != null ? `Weight ${Number(block.weight).toLocaleString()} WU.` : null,
      block.timestamp != null ? `Timestamp ${new Date(Number(block.timestamp) * 1000).toISOString()}.` : null,
      block.difficulty != null ? `Difficulty ${Number(block.difficulty).toLocaleString()}.` : null
    ].filter(Boolean).join("\n");
  }

  function summarizeAddress(bundle) {
    const s = bundle.summary || bundle;
    const chain = s.chain_stats || {};
    const mem = s.mempool_stats || {};
    const utxos = Array.isArray(bundle.utxos) ? bundle.utxos : [];

    const funded = Number(chain.funded_txo_sum) || 0;
    const spent = Number(chain.spent_txo_sum) || 0;
    const balance = funded - spent;

    return [
      `Address ${short(bundle.address || s.address || "unknown", 14)}.`,
      `Confirmed funded value ${formatBtc(funded)}.`,
      `Confirmed spent value ${formatBtc(spent)}.`,
      `Confirmed balance estimate ${formatBtc(balance)}.`,
      `${Number(chain.tx_count) || 0} confirmed transaction(s) in provider summary.`,
      `${Number(mem.tx_count) || 0} mempool transaction(s) involving this address.`,
      `${utxos.length} currently listed UTXO(s).`
    ].join("\n");
  }

  function summarizeMempool(bundle) {
    const m = bundle.mempool || {};
    const f = bundle.fees || {};
    const count = Number(m.count) || 0;
    const vsize = Number(m.vsize) || 0;
    const totalFee = Number(m.total_fee) || 0;

    const level =
      count > 150000 ? "very high" :
      count > 80000 ? "high" :
      count > 30000 ? "moderate" :
      "relatively light";

    return [
      `Mempool contains ${count.toLocaleString()} transaction(s).`,
      `Virtual size ${vsize.toLocaleString()} vbytes.`,
      `Total attached fees ${(totalFee / SATS_PER_BTC).toFixed(8)} BTC.`,
      `Current transaction-count pressure appears ${level} by this simple local threshold model.`,
      f.fastestFee != null ? `Recommended fastest fee ${f.fastestFee} sat/vB.` : null,
      f.halfHourFee != null ? `Half-hour fee ${f.halfHourFee} sat/vB.` : null,
      f.hourFee != null ? `Hour fee ${f.hourFee} sat/vB.` : null,
      f.economyFee != null ? `Economy fee ${f.economyFee} sat/vB.` : null
    ].filter(Boolean).join("\n");
  }

  function summarize(type, data) {
    if (!data) return "No loaded object is available.";

    switch (type) {
      case "tx": return summarizeTransaction(data);
      case "block":
      case "block-height":
      case "block-hash": return summarizeBlock(data.block || data);
      case "address": return summarizeAddress(data);
      case "mempool": return summarizeMempool(data);
      case "tip":
        return `Chain tip height ${data.height}.\nTip hash ${data.hash}.`;
      default:
        return "The loaded object does not match a built-in AIPDABE summary type.";
    }
  }

  function answer(question, context) {
    const q = String(question || "").toLowerCase().trim();
    const { type, data } = context || {};
    if (!data) return "Load Bitcoin data first.";

    if (!q || /summar|explain|overview|what is this/.test(q)) {
      return summarize(type, data);
    }

    if (type === "tx") {
      const m = transactionMetrics(data);

      if (/fee|feerate|fee rate/.test(q)) {
        if (m.fee == null) return "No fee value can be derived from the loaded transaction.";
        const extra = m.vsize ? `\nApproximate fee rate ${(m.fee / m.vsize).toFixed(2)} sat/vB.` : "";
        return `Fee ${formatBtc(m.fee)} (${Math.round(m.fee).toLocaleString()} sat).${extra}`;
      }

      if (/input/.test(q)) {
        return m.inputs.map((vin, i) =>
          `Input ${i}: ${vin.is_coinbase ? "coinbase" : `${short(vin.txid)}:${vin.vout}`} · ${formatBtc(vin?.prevout?.value || 0)}`
        ).join("\n") || "No inputs are present.";
      }

      if (/output|utxo/.test(q)) {
        return m.outputs.map((vout, i) =>
          `Output ${i}: ${formatBtc(vout.value)} · ${vout.scriptpubkey_address || vout.scriptpubkey_type || "script"}`
        ).join("\n") || "No outputs are present.";
      }

      if (/confirm|block/.test(q)) {
        return m.confirmed
          ? `Confirmed${m.status.block_height != null ? ` at block height ${m.status.block_height}` : ""}.`
          : "Unconfirmed according to the loaded transaction status.";
      }

      if (/anomal|op_return|op return/.test(q)) {
        const opReturns = m.outputs
          .map((o, i) => ({ o, i }))
          .filter(({ o }) => o.scriptpubkey_type === "op_return");
        const dustish = m.outputs
          .map((o, i) => ({ o, i }))
          .filter(({ o }) => Number(o.value) > 0 && Number(o.value) < 546);

        const lines = [];
        if (opReturns.length) lines.push(`${opReturns.length} OP_RETURN output(s): ${opReturns.map(x => x.i).join(", ")}.`);
        if (dustish.length) lines.push(`${dustish.length} output(s) below 546 sat: ${dustish.map(x => x.i).join(", ")}.`);
        if (!lines.length) lines.push("No simple OP_RETURN or sub-546-sat output flags detected.");
        lines.push("This is heuristic inspection, not a determination of malicious or illicit activity.");
        return lines.join("\n");
      }
    }

    if (type === "address") {
      if (/utxo|unspent/.test(q)) {
        const utxos = Array.isArray(data.utxos) ? data.utxos : [];
        return utxos.map((u, i) =>
          `UTXO ${i}: ${short(u.txid)}:${u.vout} · ${formatBtc(u.value)} · ${u.status?.confirmed ? "confirmed" : "unconfirmed"}`
        ).join("\n") || "No UTXOs are listed.";
      }

      if (/balance/.test(q)) {
        const chain = data.summary?.chain_stats || {};
        const balance = (Number(chain.funded_txo_sum) || 0) - (Number(chain.spent_txo_sum) || 0);
        return `Confirmed balance estimate ${formatBtc(balance)}.`;
      }
    }

    if (type === "mempool" && /fee|congestion|pressure/.test(q)) {
      return summarizeMempool(data);
    }

    return `I can answer local questions about summaries, fees, inputs, outputs, UTXOs, confirmation state, address balance, mempool fees, and simple structural flags.\n\n${summarize(type, data)}`;
  }

  window.AIPDABEAnalyst = Object.freeze({
    summarize,
    answer,
    transactionMetrics
  });
})();

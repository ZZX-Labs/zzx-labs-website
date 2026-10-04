(() => {
  "use strict";

  const SATS_PER_BTC = 100_000_000;

  function shortId(value, size = 10) {
    const text = String(value || "");
    if (text.length <= size * 2 + 1) return text;
    return `${text.slice(0, size)}…${text.slice(-size)}`;
  }

  function sats(value) {
    return Number(value) || 0;
  }

  function btc(value) {
    return sats(value) / SATS_PER_BTC;
  }

  function inputValue(vin) {
    return sats(vin?.prevout?.value);
  }

  function outputValue(vout) {
    return sats(vout?.value);
  }

  function buildGraph(tx) {
    if (!tx || typeof tx !== "object" || !Array.isArray(tx.vin) || !Array.isArray(tx.vout)) {
      throw new Error("Loaded object is not an Esplora-style transaction.");
    }

    const txid = tx.txid || tx.id || "transaction";
    const nodes = [];
    const edges = [];

    tx.vin.forEach((vin, index) => {
      const id = `in-${index}`;
      const prevTx = vin.txid || "coinbase";
      nodes.push({
        id,
        kind: "input",
        label: vin.is_coinbase ? "COINBASE" : shortId(prevTx),
        value: inputValue(vin),
        address: vin?.prevout?.scriptpubkey_address || null,
        index
      });
      edges.push({
        from: id,
        to: "tx",
        value: inputValue(vin)
      });
    });

    nodes.push({
      id: "tx",
      kind: "transaction",
      label: shortId(txid, 12),
      value: 0
    });

    tx.vout.forEach((vout, index) => {
      const id = `out-${index}`;
      nodes.push({
        id,
        kind: "output",
        label: vout.scriptpubkey_address ? shortId(vout.scriptpubkey_address, 10) : `vout:${index}`,
        value: outputValue(vout),
        address: vout.scriptpubkey_address || null,
        scriptType: vout.scriptpubkey_type || null,
        index
      });
      edges.push({
        from: "tx",
        to: id,
        value: outputValue(vout)
      });
    });

    return {
      txid,
      nodes,
      edges,
      totalInput: tx.vin.reduce((sum, vin) => sum + inputValue(vin), 0),
      totalOutput: tx.vout.reduce((sum, vout) => sum + outputValue(vout), 0)
    };
  }

  class AIPDABEUTXOGraph {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.graph = null;
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(canvas);
    }

    setTransaction(tx) {
      this.graph = buildGraph(tx);
      this.render();
      return this.graph;
    }

    clear() {
      this.graph = null;
      this.render();
    }

    fit() {
      this.render();
    }

    export() {
      return this.graph ? JSON.parse(JSON.stringify(this.graph)) : null;
    }

    resizeCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(520, Math.round(rect.height || 520));
      const pxW = Math.round(width * this.dpr);
      const pxH = Math.round(height * this.dpr);

      if (this.canvas.width !== pxW || this.canvas.height !== pxH) {
        this.canvas.width = pxW;
        this.canvas.height = pxH;
      }

      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      return { width, height };
    }

    drawNode(node, x, y, w, h) {
      const ctx = this.ctx;
      ctx.save();

      ctx.fillStyle = "#090909";
      ctx.strokeStyle =
        node.kind === "input" ? "#e6a42b" :
        node.kind === "output" ? "#c0d674" :
        "#e8e8e8";

      ctx.lineWidth = node.kind === "transaction" ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle =
        node.kind === "input" ? "#e6a42b" :
        node.kind === "output" ? "#c0d674" :
        "#e8e8e8";
      ctx.font = '700 12px "IBM Plex Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.label, x + w / 2, y + h / 2 - 8);

      if (node.value) {
        ctx.fillStyle = "#969696";
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillText(`${btc(node.value).toFixed(8)} BTC`, x + w / 2, y + h / 2 + 10);
      }

      ctx.restore();
    }

    drawEdge(x1, y1, x2, y2, value, maxValue) {
      const ctx = this.ctx;
      const weight = maxValue ? Math.max(1, Math.min(7, 1 + 6 * (value / maxValue))) : 1;

      ctx.save();
      ctx.strokeStyle = "rgba(192,214,116,.38)";
      ctx.lineWidth = weight;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const mid = (x1 + x2) / 2;
      ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = "#c0d674";
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 8 * Math.cos(angle - .45), y2 - 8 * Math.sin(angle - .45));
      ctx.lineTo(x2 - 8 * Math.cos(angle + .45), y2 - 8 * Math.sin(angle + .45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    render() {
      const { width, height } = this.resizeCanvas();
      const ctx = this.ctx;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      // Background grid
      ctx.strokeStyle = "rgba(255,255,255,.025)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (!this.graph) {
        ctx.fillStyle = "#969696";
        ctx.font = '13px "IBM Plex Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillText("Load a transaction and choose GRAPH CURRENT TX.", width / 2, height / 2);
        return;
      }

      const inputs = this.graph.nodes.filter((n) => n.kind === "input");
      const outputs = this.graph.nodes.filter((n) => n.kind === "output");
      const center = this.graph.nodes.find((n) => n.kind === "transaction");

      const margin = 30;
      const nodeW = Math.max(130, Math.min(210, width * .2));
      const nodeH = 50;
      const inputX = margin;
      const txX = width / 2 - nodeW / 2;
      const outputX = width - margin - nodeW;

      const positions = new Map();

      function stackPositions(items, x) {
        const gap = Math.max(12, Math.min(34, (height - 2 * margin - items.length * nodeH) / Math.max(1, items.length - 1)));
        const total = items.length * nodeH + Math.max(0, items.length - 1) * gap;
        let y = Math.max(margin, (height - total) / 2);
        for (const item of items) {
          positions.set(item.id, { x, y, w: nodeW, h: nodeH });
          y += nodeH + gap;
        }
      }

      stackPositions(inputs, inputX);
      stackPositions(outputs, outputX);
      positions.set("tx", {
        x: txX,
        y: height / 2 - nodeH / 2,
        w: nodeW,
        h: nodeH
      });

      const maxValue = Math.max(
        1,
        ...this.graph.edges.map((edge) => Number(edge.value) || 0)
      );

      for (const edge of this.graph.edges) {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) continue;

        this.drawEdge(
          from.x + from.w,
          from.y + from.h / 2,
          to.x,
          to.y + to.h / 2,
          Number(edge.value) || 0,
          maxValue
        );
      }

      for (const node of this.graph.nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        this.drawNode(node, pos.x, pos.y, pos.w, pos.h);
      }

      ctx.fillStyle = "#969696";
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillText(
        `Σ inputs ${btc(this.graph.totalInput).toFixed(8)} BTC  ·  Σ outputs ${btc(this.graph.totalOutput).toFixed(8)} BTC`,
        width / 2,
        height - 12
      );
    }
  }

  window.AIPDABEUTXOGraph = AIPDABEUTXOGraph;
  window.AIPDABEGraphData = Object.freeze({ buildGraph, btc, shortId });
})();

(() => {
"use strict";

const te = new TextEncoder();
const td = new TextDecoder();

function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(s);
}

function ub64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

function concat(...parts) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function sha256(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return hex(new Uint8Array(d));
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunks(bytes, size) {
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

function xorBuffers(list, size) {
  const out = new Uint8Array(size);
  for (const b of list) {
    for (let i = 0; i < b.length; i++) out[i] ^= b[i];
  }
  return out;
}

function packetize(bytes, opts = {}) {
  const payloadSize = Math.max(32, Math.min(4096, opts.payloadSize || 256));
  const groupSize = Math.max(2, Math.min(16, opts.groupSize || 4));
  const streamId = opts.streamId || "BVTP-STREAM";
  const fps = Math.max(1, Math.min(60, opts.fps || 8));
  const data = chunks(bytes, payloadSize);
  const packets = [];
  let seq = 0;

  for (let g = 0; g < Math.ceil(data.length / groupSize); g++) {
    const group = data.slice(g * groupSize, (g + 1) * groupSize);

    group.forEach((payload, slot) => {
      packets.push({
        protocol: "BVTP/0.1-alpha",
        streamId,
        seq: seq++,
        group: g,
        slot,
        kind: "data",
        length: payload.length,
        crc32: crc32(payload),
        ptsMs: Math.round((seq - 1) * 1000 / fps),
        payload: b64(payload)
      });
    });

    const parity = xorBuffers(group, payloadSize);
    packets.push({
      protocol: "BVTP/0.1-alpha",
      streamId,
      seq: seq++,
      group: g,
      slot: group.length,
      kind: "parity",
      covers: group.length,
      length: parity.length,
      crc32: crc32(parity),
      ptsMs: Math.round((seq - 1) * 1000 / fps),
      payload: b64(parity)
    });
  }

  packets.forEach(p => p.total = packets.length);
  return { streamId, payloadSize, groupSize, fps, packets };
}

function recoverPackets(packets, payloadSize) {
  const groups = {};
  for (const p of packets) (groups[p.group] ??= []).push(p);

  const ordered = [];
  for (const g of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
    const group = groups[g];
    const parity = group.find(p => p.kind === "parity");
    const data = group.filter(p => p.kind === "data");
    const slots = new Map(data.map(p => [p.slot, p]));

    if (parity) {
      const expected = parity.covers;
      if (slots.size === expected - 1) {
        const missing = [...Array(expected).keys()].find(i => !slots.has(i));
        const parityBytes = ub64(parity.payload);
        const known = [...slots.values()].map(p => ub64(p.payload));
        const recovered = xorBuffers([parityBytes, ...known], payloadSize);
        const inferredLength = missing === expected - 1 ? payloadSize : payloadSize;
        slots.set(missing, {
          protocol: "BVTP/0.1-alpha",
          streamId: parity.streamId,
          group: g,
          slot: missing,
          kind: "data",
          length: inferredLength,
          payload: b64(recovered),
          recovered: true
        });
      }
      if (slots.size < expected) {
        throw new Error(`Group ${g}: more than one data packet is missing.`);
      }
      for (let i = 0; i < expected; i++) ordered.push(slots.get(i));
    } else {
      if (!data.length) continue;
      for (const p of data.sort((a, b) => a.slot - b.slot)) ordered.push(p);
    }
  }
  return ordered;
}

function decode(packets, payloadSize, originalBytes) {
  const data = recoverPackets(packets, payloadSize);
  const parts = data.map(p => ub64(p.payload).slice(0, p.length));
  return concat(...parts).slice(0, originalBytes);
}

function simulateNetwork(packets, cfg = {}) {
  const loss = Math.max(0, Math.min(100, Number(cfg.lossPct) || 0)) / 100;
  const jitterMs = Math.max(0, Number(cfg.jitterMs) || 0);
  const reorder = Boolean(cfg.reorder);
  const seed = Number(cfg.seed) || 1;
  let x = seed >>> 0;
  const rand = () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const delivered = [];
  const dropped = [];

  for (const p of packets) {
    if (rand() < loss) {
      dropped.push(p.seq);
      continue;
    }
    delivered.push({
      ...p,
      arrivalMs: Math.max(0, p.ptsMs + Math.round((rand() * 2 - 1) * jitterMs))
    });
  }

  if (reorder) delivered.sort((a, b) => a.arrivalMs - b.arrivalMs || a.seq - b.seq);
  return { delivered, dropped };
}

function jitterBuffer(packets, bufferMs) {
  const b = Math.max(0, Number(bufferMs) || 0);
  return [...packets]
    .map(p => ({ ...p, playoutMs: Math.max(p.ptsMs + b, p.arrivalMs ?? p.ptsMs) }))
    .sort((a, c) => a.playoutMs - c.playoutMs || a.seq - c.seq);
}

function drawPacket(canvas, packet) {
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.round(rect.width || 700));
  const h = Math.max(320, Math.round(rect.height || 700));
  const dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);

  if (!packet) return;

  const raw = concat(
    te.encode(`BVTP|${packet.streamId}|${packet.seq}|${packet.total}|${packet.group}|${packet.slot}|${packet.kind}|${packet.length}|${packet.crc32}|`),
    ub64(packet.payload)
  );
  const bits = [];
  for (const byte of raw) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);

  const side = Math.ceil(Math.sqrt(bits.length + 160));
  const pad = 24;
  const cell = Math.max(2, Math.floor((Math.min(w, h) - pad * 2) / side));
  const grid = side * cell;
  const ox = (w - grid) / 2;
  const oy = (h - grid) / 2;

  ctx.fillStyle = "#141414";
  ctx.fillRect(ox, oy, grid, grid);

  function marker(gx, gy) {
    ctx.fillStyle = "#c0d674";
    ctx.fillRect(ox + gx * cell, oy + gy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#050505";
    ctx.fillRect(ox + (gx + 1) * cell, oy + (gy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#e6a42b";
    ctx.fillRect(ox + (gx + 2) * cell, oy + (gy + 2) * cell, 3 * cell, 3 * cell);
  }
  marker(0, 0);
  marker(side - 7, 0);
  marker(0, side - 7);

  let bi = 0;
  for (let y = 0; y < side; y++) {
    for (let x2 = 0; x2 < side; x2++) {
      const m = (x2 < 7 && y < 7) || (x2 >= side - 7 && y < 7) || (x2 < 7 && y >= side - 7);
      if (m) continue;
      if (bits[bi++]) {
        ctx.fillStyle = "#e8e8e8";
        ctx.fillRect(ox + x2 * cell, oy + y * cell, cell, cell);
      }
    }
  }

  ctx.fillStyle = "#c0d674";
  ctx.font = "11px monospace";
  ctx.fillText(`BVTP ${packet.seq + 1}/${packet.total} · ${packet.kind.toUpperCase()} · PTS ${packet.ptsMs} ms`, 12, h - 10);
}

window.BVTPCore = Object.freeze({
  te, td, hex, b64, ub64, concat, sha256, crc32,
  packetize, recoverPackets, decode, simulateNetwork, jitterBuffer, drawPacket
});
})();

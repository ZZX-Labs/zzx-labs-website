(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = {
  source: BVTPCore.te.encode("BVTP transport-layer optical data stream."),
  sourceName: "message.txt",
  tx: null,
  channel: null,
  buffered: null,
  digest: null,
  timer: null,
  playerIndex: 0
};

function download(text, name) {
  const b = new Blob([text], {type:"application/json"});
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

async function build() {
  if ($("vs-mode").value === "text") {
    state.source = BVTPCore.te.encode($("vs-text").value);
    state.sourceName = $("vs-name").value.trim() || "message.txt";
  }
  state.tx = BVTPCore.packetize(state.source, {
    streamId: $("vs-id").value.trim() || "BVTP-STREAM",
    payloadSize: +$("vs-size").value || 256,
    groupSize: +$("vs-group").value || 4,
    fps: +$("vs-fps").value || 8
  });
  state.digest = await BVTPCore.sha256(state.source);
  state.channel = null;
  state.buffered = null;
  $("vs-output").textContent = JSON.stringify({
    streamId: state.tx.streamId,
    sourceName: state.sourceName,
    sourceBytes: state.source.length,
    sourceSha256: state.digest,
    packets: state.tx.packets.length,
    payloadSize: state.tx.payloadSize,
    parityGroup: state.tx.groupSize,
    fps: state.tx.fps,
    durationMs: state.tx.packets.at(-1)?.ptsMs || 0
  }, null, 2);
  showPlayer(0, state.tx.packets);
}

function simulate() {
  if (!state.tx) throw new Error("Packetize a stream first.");
  state.channel = BVTPCore.simulateNetwork(state.tx.packets, {
    lossPct: +$("vt-loss").value || 0,
    jitterMs: +$("vt-jitter").value || 0,
    reorder: $("vt-reorder").checked,
    seed: +$("vt-seed").value || 1
  });
  const sent = state.tx.packets.length;
  const delivered = state.channel.delivered.length;
  $("vt-sent").textContent = sent;
  $("vt-delivered").textContent = delivered;
  $("vt-dropped").textContent = state.channel.dropped.length;
  $("vt-lossactual").textContent = `${sent ? (100 * state.channel.dropped.length / sent).toFixed(2) : 0}%`;
  $("vt-output").textContent = JSON.stringify({
    droppedSequenceNumbers: state.channel.dropped,
    firstArrivals: state.channel.delivered.slice(0, 20).map(p => ({seq:p.seq, ptsMs:p.ptsMs, arrivalMs:p.arrivalMs}))
  }, null, 2);
}

function buffer() {
  if (!state.channel) simulate();
  state.buffered = BVTPCore.jitterBuffer(state.channel.delivered, +$("vb-ms").value || 0);
  const b = $("vb-body");
  b.replaceChildren();
  for (const p of state.buffered.slice(0, 200)) {
    const tr = document.createElement("tr");
    [p.seq, p.kind, p.ptsMs, p.arrivalMs, p.playoutMs, p.group].forEach(v => {
      const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
    });
    b.appendChild(tr);
  }
  if (!state.buffered.length) b.innerHTML = '<tr><td colspan="6">No delivered packets.</td></tr>';
}

function showPlayer(i, packets = null) {
  const list = packets || state.buffered || state.channel?.delivered || state.tx?.packets || [];
  if (!list.length) return;
  state.playerIndex = ((i % list.length) + list.length) % list.length;
  $("vp-index").value = state.playerIndex;
  const p = list[state.playerIndex];
  BVTPCore.drawPacket($("vp-canvas"), p);
  $("vp-output").textContent = JSON.stringify({...p, payload:`${p.payload.slice(0,64)}…`}, null, 2);
}

function toggle() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
    $("vp-toggle").textContent = "PLAY";
    return;
  }
  const fps = Math.max(1, Math.min(60, +$("vp-fps").value || 8));
  state.timer = setInterval(() => showPlayer(state.playerIndex + 1), 1000 / fps);
  $("vp-toggle").textContent = "STOP";
}

async function decode() {
  if (!state.tx) throw new Error("No stream.");
  const delivered = state.buffered || state.channel?.delivered || state.tx.packets;
  const bytes = BVTPCore.decode(delivered, state.tx.payloadSize, state.source.length);
  const hash = await BVTPCore.sha256(bytes);
  $("vd-output").textContent = JSON.stringify({
    recoveredBytes: bytes.length,
    sha256: hash,
    expectedSha256: state.digest,
    exactMatch: hash === state.digest,
    textPreview: $("vs-mode").value === "text" ? BVTPCore.td.decode(bytes).slice(0,1000) : null,
    note: hash === state.digest ? "Recovered stream matches source." : "Stream could not be fully reconstructed with the delivered packets."
  }, null, 2);
}

$("vs-file").addEventListener("change", async () => {
  const f = $("vs-file").files?.[0]; if (!f) return;
  state.source = new Uint8Array(await f.arrayBuffer());
  state.sourceName = f.name;
  $("vs-name").value = f.name;
  $("vs-mode").value = "binary";
  $("vs-output").textContent = `Loaded ${f.name} (${f.size} bytes).`;
});
$("vs-build").addEventListener("click", () => build().catch(e => $("vs-output").textContent = `ERROR: ${e.message}`));
$("vt-run").addEventListener("click", () => { try { simulate(); } catch(e) { $("vt-output").textContent = `ERROR: ${e.message}`; } });
$("vb-run").addEventListener("click", () => { try { buffer(); } catch(e) { $("vt-output").textContent = `ERROR: ${e.message}`; } });
$("vp-index").addEventListener("change", () => showPlayer(+$("vp-index").value || 0));
$("vp-toggle").addEventListener("click", toggle);
$("vd-run").addEventListener("click", () => decode().catch(e => $("vd-output").textContent = `ERROR: ${e.message}`));
$("vx-json").addEventListener("click", () => {
  if (!state.tx) return;
  const obj = {
    schema:"zzx.bvtp.capture.v1",
    sourceName:state.sourceName,
    originalBytes:state.source.length,
    sourceSha256:state.digest,
    tx:state.tx,
    channel:state.channel ? {dropped:state.channel.dropped, delivered:state.channel.delivered} : null
  };
  const text = JSON.stringify(obj, null, 2);
  download(text, `bvtp-${Date.now()}.json`);
  $("vx-output").textContent = JSON.stringify({...obj, tx:{...obj.tx, packets:`${obj.tx.packets.length} packets`}}, null, 2);
});

build();
window.BVTP = Object.freeze({
  version:"0.1.0-alpha-web",
  packetize:BVTPCore.packetize,
  simulate:BVTPCore.simulateNetwork,
  jitterBuffer:BVTPCore.jitterBuffer,
  recover:BVTPCore.decode,
  getState:()=>({streamId:state.tx?.streamId, packets:state.tx?.packets.length || 0, dropped:state.channel?.dropped.length || 0})
});
window.ZZXHooks?.emit("bvtp:ready",{version:"0.1.0-alpha-web"});
})();

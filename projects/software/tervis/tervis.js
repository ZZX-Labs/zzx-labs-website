(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    tfReady: false,
    mobileNet: null,
    customModel: null,
    customModelType: null,
    customLabels: [],
    imageBitmap: null,
    videoAnalyzing: false,
    videoRaf: 0,
    videoLastClassify: 0,
    videoPreviousFrame: null,
    videoFrameCount: 0,
    videoPatternEvents: 0,
    cameraStream: null,
    observations: [],
    sessionStarted: new Date().toISOString(),
    counters: { image: 0, video: 0, audio: 0 }
  };

  const MODEL_SCRIPTS = [
    {
      id: "tfjs-runtime",
      src: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
      ready: () => !!window.tf
    },
    {
      id: "tfjs-mobilenet",
      src: "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js",
      ready: () => !!window.mobilenet
    }
  ];

  function log(id, message) {
    const el = $(id);
    if (!el) return;
    const stamp = new Date().toISOString().slice(11, 23);
    el.textContent += `[${stamp}] ${message}\n`;
    if (el.textContent.length > 24000) el.textContent = el.textContent.slice(-18000);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(id, text, cls = "") {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "partial", "no");
    if (cls) el.classList.add(cls);
  }

  function runtimeStatus() {
    setStatus("status-canvas", "CANVAS: YES", "ok");
    setStatus(
      "status-camera",
      navigator.mediaDevices?.getUserMedia ? "CAMERA: YES" : "CAMERA: NO",
      navigator.mediaDevices?.getUserMedia ? "ok" : "no"
    );
    setStatus(
      "status-audio",
      window.AudioContext || window.webkitAudioContext ? "AUDIO: YES" : "AUDIO: NO",
      window.AudioContext || window.webkitAudioContext ? "ok" : "no"
    );
  }

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureTf({ withMobileNet = false } = {}) {
    setStatus("status-tf", "TFJS: LOADING", "partial");
    log("model-log", "Loading TensorFlow.js runtime…");

    const tfSpec = MODEL_SCRIPTS[0];
    if (!tfSpec.ready()) await loadScript(tfSpec.src, tfSpec.id);
    if (!window.tf) throw new Error("TensorFlow.js did not initialize.");

    await tf.ready();
    state.tfReady = true;

    if (withMobileNet) {
      const mnSpec = MODEL_SCRIPTS[1];
      if (!mnSpec.ready()) await loadScript(mnSpec.src, mnSpec.id);
      if (!window.mobilenet) throw new Error("MobileNet library did not initialize.");
    }

    setStatus("status-tf", `TFJS: ${tf.version.tfjs}`, "ok");
    log("model-log", `TensorFlow.js ready (${tf.getBackend()}).`);
    return tf;
  }

  async function loadMobileNet() {
    await ensureTf({ withMobileNet: true });
    if (!state.mobileNet) {
      log("model-log", "Loading MobileNet model weights…");
      state.mobileNet = await mobilenet.load({ version: 2, alpha: 1.0 });
      log("model-log", "MobileNet loaded.");
    }
    return state.mobileNet;
  }

  function parseLabels() {
    return $("custom-model-labels").value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async function loadCustomModel(type) {
    await ensureTf();
    const url = $("custom-model-url").value.trim();
    if (!url) throw new Error("Enter a model.json URL.");

    state.customLabels = parseLabels();
    log("model-log", `Loading custom ${type} model from ${url}`);

    if (state.customModel?.dispose) {
      try { state.customModel.dispose(); } catch {}
    }

    state.customModel = type === "graph"
      ? await tf.loadGraphModel(url)
      : await tf.loadLayersModel(url);

    state.customModelType = type;
    log("model-log", `Custom ${type} model loaded.`);
  }

  function clearCustomModel() {
    if (state.customModel?.dispose) {
      try { state.customModel.dispose(); } catch {}
    }
    state.customModel = null;
    state.customModelType = null;
    state.customLabels = [];
    log("model-log", "Custom model cleared.");
  }

  function drawContained(source, canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return null;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / sw, canvas.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (canvas.width - dw) / 2;
    const dy = (canvas.height - dh) / 2;

    ctx.drawImage(source, dx, dy, dw, dh);
    return { sw, sh, dx, dy, dw, dh };
  }

  function imageFeatures(canvas) {
    const sample = document.createElement("canvas");
    sample.width = 160;
    sample.height = 90;
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(canvas, 0, 0, sample.width, sample.height);

    const { data } = sctx.getImageData(0, 0, sample.width, sample.height);
    const gray = new Float32Array(sample.width * sample.height);

    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      gray[p] = y;
      sum += y;
    }

    let edgePixels = 0;
    let edgeTotal = 0;
    for (let y = 1; y < sample.height - 1; y++) {
      for (let x = 1; x < sample.width - 1; x++) {
        const i = y * sample.width + x;
        const gx = gray[i + 1] - gray[i - 1];
        const gy = gray[i + sample.width] - gray[i - sample.width];
        const g = Math.hypot(gx, gy);
        edgeTotal++;
        if (g > 35) edgePixels++;
      }
    }

    return {
      meanLuminance: sum / gray.length,
      edgeDensity: edgeTotal ? edgePixels / edgeTotal : 0
    };
  }

  function renderPredictions(targetId, predictions) {
    const el = $(targetId);
    el.replaceChildren();

    if (!predictions?.length) {
      el.innerHTML = '<p class="muted">No prediction returned.</p>';
      return;
    }

    for (const prediction of predictions) {
      const row = document.createElement("div");
      row.className = "prediction";

      const label = document.createElement("strong");
      label.textContent = prediction.className || prediction.label || "unknown";

      const probability = document.createElement("span");
      const p = Number(prediction.probability ?? prediction.score ?? 0);
      probability.textContent = `${(p * 100).toFixed(2)}%`;

      row.append(label, probability);
      el.appendChild(row);
    }
  }

  function recordObservation(kind, payload) {
    const observation = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      kind,
      ...payload
    };

    state.observations.push(observation);
    if (kind === "image") state.counters.image++;
    else if (kind === "audio") state.counters.audio++;
    else state.counters.video++;

    updateDataset();
    window.ZZXHooks?.emit("tervis:observation", observation);
    return observation;
  }

  function updateDataset() {
    $("dataset-count").textContent = String(state.observations.length);
    $("dataset-started").textContent = state.sessionStarted;
    $("dataset-images").textContent = String(state.counters.image);
    $("dataset-video").textContent = String(state.counters.video);

    const preview = state.observations.slice(-12);
    $("dataset-preview").textContent = JSON.stringify(preview, null, 2);
  }

  async function classifyWithMobileNet(source, topK = 5) {
    const model = await loadMobileNet();
    return model.classify(source, topK);
  }

  async function classifyWithCustom(source, topK = 5) {
    if (!state.customModel) throw new Error("No custom TensorFlow.js model is loaded.");
    await ensureTf();

    let inputShape = null;
    try {
      inputShape = state.customModel.inputs?.[0]?.shape || null;
    } catch {}

    const height = Number(inputShape?.[1]) || 224;
    const width = Number(inputShape?.[2]) || 224;

    const input = tf.tidy(() => {
      const pixels = tf.browser.fromPixels(source);
      const resized = tf.image.resizeBilinear(pixels, [height, width], true);
      return resized.toFloat().div(255).expandDims(0);
    });

    try {
      let output = state.customModelType === "graph"
        ? await state.customModel.executeAsync(input)
        : state.customModel.predict(input);

      if (Array.isArray(output)) output = output[0];

      const data = await output.data();
      const values = Array.from(data);
      const pairs = values
        .map((score, index) => ({
          index,
          score,
          label: state.customLabels[index] || `class_${index}`
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((x) => ({ className: x.label, probability: x.score }));

      if (output.dispose) output.dispose();
      return pairs;
    } finally {
      input.dispose();
    }
  }

  async function classifySource(source) {
    if (state.customModel) return classifyWithCustom(source);
    return classifyWithMobileNet(source);
  }

  async function loadImageFile(file) {
    const bitmap = await createImageBitmap(file);
    state.imageBitmap = bitmap;

    const canvas = $("image-canvas");
    drawContained(bitmap, canvas);
    const features = imageFeatures(canvas);

    $("image-width").textContent = `${bitmap.width}px`;
    $("image-height").textContent = `${bitmap.height}px`;
    $("image-luma").textContent = features.meanLuminance.toFixed(2);
    $("image-edge").textContent = features.edgeDensity.toFixed(4);

    renderPredictions("image-predictions", []);
  }

  async function classifyImage() {
    if (!state.imageBitmap) throw new Error("Select an image first.");
    const predictions = await classifySource($("image-canvas"));
    renderPredictions("image-predictions", predictions);

    recordObservation("image", {
      source: "local-image",
      features: imageFeatures($("image-canvas")),
      predictions
    });
  }

  function frameGray(canvas, width = 96, height = 54) {
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    }

    return gray;
  }

  function motionScore(current, previous, threshold) {
    if (!previous || current.length !== previous.length) return { score: 0, activeRatio: 0 };

    let sum = 0;
    let active = 0;

    for (let i = 0; i < current.length; i++) {
      const d = Math.abs(current[i] - previous[i]);
      sum += d;
      if (d >= threshold) active++;
    }

    return {
      score: sum / (current.length * 255),
      activeRatio: active / current.length
    };
  }

  async function videoLoop(time) {
    if (!state.videoAnalyzing) return;

    const video = $("video-player");
    const canvas = $("video-overlay");
    if (video.readyState >= 2 && !video.paused && !video.ended) {
      drawContained(video, canvas);
      const current = frameGray(canvas);
      const threshold = Number($("video-motion-threshold").value) || 18;
      const motion = motionScore(current, state.videoPreviousFrame, threshold);
      state.videoPreviousFrame = current;
      state.videoFrameCount++;

      $("video-frame-count").textContent = String(state.videoFrameCount);
      $("video-motion-score").textContent = motion.score.toFixed(4);

      if (motion.activeRatio > 0.12) {
        state.videoPatternEvents++;
        $("video-pattern-events").textContent = String(state.videoPatternEvents);
      }

      const interval = Number($("video-classify-interval").value) || 1000;
      if (time - state.videoLastClassify >= interval) {
        state.videoLastClassify = time;

        try {
          const predictions = await classifySource(canvas);
          const top = predictions?.[0];
          $("video-top-class").textContent = top?.className || "—";

          if (top) {
            log(
              "video-log",
              `${video.currentTime.toFixed(2)}s | ${(top.probability * 100).toFixed(2)}% ${top.className} | motion=${motion.score.toFixed(4)}`
            );

            recordObservation("video", {
              source: "local-video",
              mediaTime: video.currentTime,
              motion,
              predictions
            });
          }
        } catch (error) {
          log("video-log", `classification error: ${error.message}`);
        }
      }
    }

    state.videoRaf = requestAnimationFrame(videoLoop);
  }

  function startVideoAnalysis() {
    const video = $("video-player");
    if (!video.src) throw new Error("Select a video first.");

    state.videoAnalyzing = true;
    state.videoPreviousFrame = null;
    state.videoLastClassify = 0;
    log("video-log", "Frame analysis started.");

    if (video.paused) video.play().catch(() => {});
    cancelAnimationFrame(state.videoRaf);
    state.videoRaf = requestAnimationFrame(videoLoop);
  }

  function stopVideoAnalysis() {
    state.videoAnalyzing = false;
    cancelAnimationFrame(state.videoRaf);
    log("video-log", "Frame analysis stopped.");
  }

  async function snapshotVideo() {
    const video = $("video-player");
    if (video.readyState < 2) throw new Error("Video has no decodable frame.");
    const canvas = $("video-overlay");
    drawContained(video, canvas);

    const predictions = await classifySource(canvas);
    const top = predictions?.[0];
    log(
      "video-log",
      `snapshot ${video.currentTime.toFixed(2)}s | ${top ? `${(top.probability * 100).toFixed(2)}% ${top.className}` : "no class"}`
    );

    recordObservation("video", {
      source: "video-snapshot",
      mediaTime: video.currentTime,
      predictions
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia is unavailable.");

    if (state.cameraStream) stopCamera();

    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    $("camera-player").srcObject = state.cameraStream;
    $("camera-predictions").innerHTML = '<p class="muted">Camera active. Use CLASSIFY CURRENT FRAME.</p>';
  }

  function stopCamera() {
    if (state.cameraStream) {
      for (const track of state.cameraStream.getTracks()) track.stop();
    }
    state.cameraStream = null;
    $("camera-player").srcObject = null;
    $("camera-predictions").innerHTML = '<p class="muted">Camera is not active.</p>';
  }

  async function classifyCamera() {
    const video = $("camera-player");
    if (!state.cameraStream || video.readyState < 2) throw new Error("Camera is not ready.");

    const canvas = $("camera-overlay");
    drawContained(video, canvas);
    const predictions = await classifySource(canvas);
    renderPredictions("camera-predictions", predictions);

    recordObservation("camera", {
      source: "webcam",
      predictions
    });
  }

  function decodeAudio(arrayBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio API is unavailable.");

    const ctx = new Ctx();
    return ctx.decodeAudioData(arrayBuffer.slice(0))
      .finally(() => ctx.close().catch(() => {}));
  }

  function audioFeatures(buffer) {
    const channel = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    let sumSquares = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < channel.length; i++) {
      const x = channel[i];
      sumSquares += x * x;
      if (i > 0 && ((channel[i - 1] < 0 && x >= 0) || (channel[i - 1] >= 0 && x < 0))) {
        zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, channel.length));
    const zcr = zeroCrossings / Math.max(1, channel.length);

    const n = 2048;
    const start = Math.max(0, Math.floor((channel.length - n) / 2));
    const windowed = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const x = channel[start + i] || 0;
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      windowed[i] = x * hann;
    }

    const magnitudes = dftMagnitudes(windowed);
    let weighted = 0;
    let magSum = 0;

    for (let k = 0; k < magnitudes.length; k++) {
      const frequency = k * sampleRate / n;
      const mag = magnitudes[k];
      weighted += frequency * mag;
      magSum += mag;
    }

    const centroid = magSum ? weighted / magSum : 0;
    return { rms, zcr, centroid, magnitudes, sampleRate, fftSize: n };
  }

  function dftMagnitudes(samples) {
    const n = samples.length;
    const bins = Math.floor(n / 2);
    const mags = new Float32Array(bins);

    // A direct DFT is intentionally limited to one 2048-sample analysis window.
    // It avoids another dependency while remaining deterministic and transparent.
    for (let k = 0; k < bins; k++) {
      let re = 0;
      let im = 0;
      const angular = -2 * Math.PI * k / n;

      for (let t = 0; t < n; t++) {
        const a = angular * t;
        re += samples[t] * Math.cos(a);
        im += samples[t] * Math.sin(a);
      }

      mags[k] = Math.hypot(re, im);
    }

    return mags;
  }

  function drawSpectrum(features) {
    const canvas = $("audio-spectrum");
    const ctx = canvas.getContext("2d");
    const mags = features.magnitudes;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let max = 0;
    for (const value of mags) if (value > max) max = value;
    max = max || 1;

    const bars = Math.min(300, mags.length);
    const step = Math.floor(mags.length / bars) || 1;

    ctx.fillStyle = "#c0d674";
    for (let i = 0; i < bars; i++) {
      const value = mags[i * step] / max;
      const h = value * (canvas.height - 20);
      const x = i * canvas.width / bars;
      const w = Math.max(1, canvas.width / bars - 1);
      ctx.fillRect(x, canvas.height - h, w, h);
    }

    ctx.strokeStyle = "#e6a42b";
    const centroidX = Math.min(
      canvas.width,
      features.centroid / (features.sampleRate / 2) * canvas.width
    );
    ctx.beginPath();
    ctx.moveTo(centroidX, 0);
    ctx.lineTo(centroidX, canvas.height);
    ctx.stroke();
  }

  async function analyzeAudio() {
    const file = $("audio-file").files?.[0];
    if (!file) throw new Error("Select an audio file first.");

    log("audio-log", `Decoding ${file.name}…`);
    const buffer = await decodeAudio(await file.arrayBuffer());
    const features = audioFeatures(buffer);
    drawSpectrum(features);

    $("audio-duration").textContent = `${buffer.duration.toFixed(2)} s`;
    $("audio-rms").textContent = features.rms.toFixed(6);
    $("audio-centroid").textContent = `${features.centroid.toFixed(1)} Hz`;
    $("audio-zcr").textContent = features.zcr.toFixed(6);

    const observation = {
      source: "local-audio",
      fileName: file.name,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      rms: features.rms,
      zeroCrossingRate: features.zcr,
      spectralCentroidHz: features.centroid
    };

    recordObservation("audio", observation);
    log("audio-log", JSON.stringify(observation, null, 2));
  }

  function csvEscape(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return `"${String(text ?? "").replace(/"/g, '""')}"`;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    const payload = {
      project: "TerVIS",
      version: "0.3.0-alpha-web",
      sessionStarted: state.sessionStarted,
      exportedAt: new Date().toISOString(),
      observations: state.observations
    };

    download(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `tervis-session-${Date.now()}.json`
    );
  }

  function exportCsv() {
    const rows = [
      ["id", "timestamp", "kind", "source", "payload"].map(csvEscape).join(",")
    ];

    for (const observation of state.observations) {
      const { id, timestamp, kind, source = "", ...payload } = observation;
      rows.push([id, timestamp, kind, source, payload].map(csvEscape).join(","));
    }

    download(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
      `tervis-session-${Date.now()}.csv`
    );
  }

  function clearDataset() {
    state.observations = [];
    state.counters = { image: 0, video: 0, audio: 0 };
    state.sessionStarted = new Date().toISOString();
    updateDataset();
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (!el) return;

    el.addEventListener(event, async (e) => {
      try {
        await handler(e);
      } catch (error) {
        console.error(error);
        const logTarget =
          id.includes("audio") ? "audio-log" :
          id.includes("model") || id.includes("mobilenet") ? "model-log" :
          id.includes("video") ? "video-log" : null;

        if (logTarget) log(logTarget, `ERROR: ${error.message}`);
        else alert(error.message);
      }
    });
  }

  function bindEvents() {
    bind("image-file", "change", async () => {
      const file = $("image-file").files?.[0];
      if (file) await loadImageFile(file);
    });

    bind("classify-image", "click", classifyImage);
    bind("load-mobilenet", "click", loadMobileNet);
    bind("load-custom-layers", "click", () => loadCustomModel("layers"));
    bind("load-custom-graph", "click", () => loadCustomModel("graph"));
    bind("clear-model", "click", clearCustomModel);

    bind("video-file", "change", () => {
      const file = $("video-file").files?.[0];
      if (!file) return;

      stopVideoAnalysis();
      const video = $("video-player");
      if (video.dataset.objectUrl) URL.revokeObjectURL(video.dataset.objectUrl);
      const url = URL.createObjectURL(file);
      video.dataset.objectUrl = url;
      video.src = url;
      state.videoPreviousFrame = null;
      state.videoFrameCount = 0;
      state.videoPatternEvents = 0;
      $("video-frame-count").textContent = "0";
      $("video-pattern-events").textContent = "0";
      $("video-motion-score").textContent = "0.000";
      $("video-top-class").textContent = "—";
      log("video-log", `Loaded ${file.name}.`);
    });

    bind("start-video-analysis", "click", startVideoAnalysis);
    bind("stop-video-analysis", "click", stopVideoAnalysis);
    bind("snapshot-video", "click", snapshotVideo);

    bind("start-camera", "click", startCamera);
    bind("classify-camera", "click", classifyCamera);
    bind("stop-camera", "click", stopCamera);

    bind("audio-file", "change", () => {
      const file = $("audio-file").files?.[0];
      if (!file) return;
      const player = $("audio-player");
      if (player.dataset.objectUrl) URL.revokeObjectURL(player.dataset.objectUrl);
      const url = URL.createObjectURL(file);
      player.dataset.objectUrl = url;
      player.src = url;
      log("audio-log", `Loaded ${file.name}.`);
    });

    bind("analyze-audio", "click", analyzeAudio);
    bind("export-json", "click", exportJson);
    bind("export-csv", "click", exportCsv);
    bind("clear-dataset", "click", clearDataset);

    window.addEventListener("beforeunload", () => {
      stopCamera();
      stopVideoAnalysis();
    });
  }

  function exposeApi() {
    window.TerVIS = Object.freeze({
      version: "0.3.0-alpha-web",
      ensureTf,
      loadMobileNet,
      loadCustomModel,
      clearCustomModel,
      classifySource,
      imageFeatures,
      motionScore,
      analyzeAudio,
      startCamera,
      stopCamera,
      exportSession: () => structuredClone
        ? structuredClone(state.observations)
        : JSON.parse(JSON.stringify(state.observations)),
      getState: () => ({
        tfReady: state.tfReady,
        mobileNetLoaded: !!state.mobileNet,
        customModelLoaded: !!state.customModel,
        customModelType: state.customModelType,
        observations: state.observations.length,
        sessionStarted: state.sessionStarted
      })
    });
  }

  runtimeStatus();
  updateDataset();
  bindEvents();
  exposeApi();

  window.ZZXHooks?.emit("tervis:ready", { version: "0.3.0-alpha-web" });
})();

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    project: {
      schema: "zzx.4dv.project.v1",
      title: "Untitled 4DV Project",
      notes: "",
      source: {
        name: null,
        size: null,
        type: null,
        duration: null
      },
      layers: []
    },
    sourceObjectUrl: null,
    timeline: null,
    layerManager: null,
    raf: 0
  };

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `4dv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatTime(seconds) {
    return window.FourDVTime?.formatTime(seconds) || `${Number(seconds || 0).toFixed(3)}s`;
  }

  function updateRuntimeStatus() {
    const audio = $("status-audio");
    const hasAudio = Boolean(window.AudioContext || window.webkitAudioContext);
    audio.textContent = `AUDIO: ${hasAudio ? "YES" : "PARTIAL"}`;
    audio.className = `runtime-badge ${hasAudio ? "ok" : "partial"}`;
  }

  function sourceVideo() {
    return $("source-video");
  }

  function cleanExportLayer(layer) {
    const {
      mediaUrl,
      mediaFileName,
      mediaFileSize,
      mediaFileType,
      ...portable
    } = layer;

    return {
      ...portable,
      media: mediaFileName ? {
        fileName: mediaFileName,
        fileSize: mediaFileSize,
        fileType: mediaFileType,
        embedded: false
      } : null
    };
  }

  function portableProject() {
    return {
      schema: "zzx.4dv.project.v1",
      exportedAt: new Date().toISOString(),
      title: state.project.title,
      notes: state.project.notes,
      source: { ...state.project.source },
      layers: state.project.layers.map(cleanExportLayer)
    };
  }

  function updateProjectFields() {
    state.project.title = $("project-title").value || "Untitled 4DV Project";
    state.project.notes = $("project-notes").value || "";
  }

  function renderProjectOutput() {
    updateProjectFields();
    $("project-output").textContent = JSON.stringify(portableProject(), null, 2);
  }

  function renderLayerTable() {
    const body = $("layer-table-body");
    body.replaceChildren();

    if (!state.project.layers.length) {
      const row = document.createElement("tr");
      row.innerHTML = '<td colspan="6" class="muted">No layers yet.</td>';
      body.appendChild(row);
      return;
    }

    const sorted = [...state.project.layers].sort((a, b) => a.start - b.start);

    for (const layer of sorted) {
      const row = document.createElement("tr");
      if (!layer.enabled) row.classList.add("fourdv-row-muted");

      const values = [
        layer.type.toUpperCase(),
        layer.title || "(untitled)",
        formatTime(layer.start),
        formatTime(layer.end),
        layer.enabled ? "YES" : "NO"
      ];

      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = value;
        row.appendChild(td);
      }

      const actions = document.createElement("td");

      const jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = "JUMP";
      jump.addEventListener("click", () => {
        sourceVideo().currentTime = layer.start;
        syncNow();
      });

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = layer.enabled ? "MUTE" : "ENABLE";
      toggle.style.marginLeft = ".3rem";
      toggle.addEventListener("click", () => {
        layer.enabled = !layer.enabled;
        renderAll();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "DELETE";
      remove.style.marginLeft = ".3rem";
      remove.addEventListener("click", () => removeLayer(layer.id));

      actions.append(jump, toggle, remove);
      row.appendChild(actions);
      body.appendChild(row);
    }
  }

  function renderTimeline() {
    const duration = Number(state.project.source.duration) || sourceVideo().duration || 1;
    state.timeline.setDuration(duration);
    state.timeline.setLayers(state.project.layers);
    state.timeline.setCurrentTime(sourceVideo().currentTime || 0);
  }

  function renderAll() {
    renderLayerTable();
    renderTimeline();
    renderProjectOutput();
    syncNow();
  }

  function removeLayer(id) {
    const index = state.project.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;

    const [layer] = state.project.layers.splice(index, 1);
    if (layer.mediaUrl) {
      try { URL.revokeObjectURL(layer.mediaUrl); } catch {}
    }

    state.layerManager.removeLayer(id);
    renderAll();
    window.ZZXHooks?.emit("4dv:layer-remove", { id });
  }

  function clearLayers() {
    for (const layer of state.project.layers) {
      if (layer.mediaUrl) {
        try { URL.revokeObjectURL(layer.mediaUrl); } catch {}
      }
    }

    state.project.layers = [];
    state.layerManager.clear();
    renderAll();
  }

  function formLayer() {
    const type = $("layer-type").value;
    const start = Math.max(0, Number($("layer-start").value) || 0);
    const end = Math.max(start + .001, Number($("layer-end").value) || start + 5);
    const file = $("layer-media-file").files?.[0] || null;

    if ((type === "audio" || type === "video") && !file) {
      throw new Error(`${type.toUpperCase()} layers require a local media attachment.`);
    }

    let mediaUrl = null;
    if (file) {
      mediaUrl = URL.createObjectURL(file);
      state.layerManager.registerObjectUrl(mediaUrl);
    }

    return {
      id: uid(),
      type,
      title: $("layer-title").value.trim() || `${type} layer`,
      text: $("layer-text").value,
      start,
      end,
      enabled: $("layer-enabled").checked,
      loop: $("layer-loop").checked,
      mediaUrl,
      mediaFileName: file?.name || null,
      mediaFileSize: file?.size || null,
      mediaFileType: file?.type || null
    };
  }

  function clearLayerForm() {
    $("layer-type").value = "text";
    $("layer-title").value = "";
    $("layer-text").value = "";
    $("layer-media-file").value = "";
    $("layer-enabled").checked = true;
    $("layer-loop").checked = false;

    const t = sourceVideo().currentTime || 0;
    $("layer-start").value = t.toFixed(3);
    $("layer-end").value = (t + 5).toFixed(3);
  }

  function addLayer() {
    const layer = formLayer();
    state.project.layers.push(layer);
    clearLayerForm();
    renderAll();

    window.ZZXHooks?.emit("4dv:layer-add", {
      id: layer.id,
      type: layer.type,
      start: layer.start,
      end: layer.end
    });
  }

  function syncNow() {
    const video = sourceVideo();
    const active = state.layerManager.sync(state.project.layers);
    $("active-layer-count").textContent = String(active);
    $("source-current").textContent = formatTime(video.currentTime || 0);
    state.timeline.setCurrentTime(video.currentTime || 0);

    const current = state.project.layers
      .filter((layer) =>
        layer.enabled &&
        video.currentTime >= layer.start &&
        video.currentTime < layer.end
      )
      .map((layer) => ({
        type: layer.type,
        title: layer.title,
        start: layer.start,
        end: layer.end
      }));

    $("player-output").textContent = JSON.stringify({
      currentTime: video.currentTime || 0,
      activeLayers: current
    }, null, 2);
  }

  function animationLoop() {
    syncNow();
    state.raf = requestAnimationFrame(animationLoop);
  }

  function loadSourceFile(file) {
    const video = sourceVideo();

    if (state.sourceObjectUrl) {
      try { URL.revokeObjectURL(state.sourceObjectUrl); } catch {}
    }

    state.sourceObjectUrl = URL.createObjectURL(file);
    video.src = state.sourceObjectUrl;

    state.project.source = {
      name: file.name,
      size: file.size,
      type: file.type,
      duration: null
    };

    $("source-name").textContent = file.name;
    $("player-output").textContent = `Loaded ${file.name}. Waiting for media metadata…`;

    video.addEventListener("loadedmetadata", () => {
      state.project.source.duration = video.duration;
      $("source-duration").textContent = formatTime(video.duration);
      renderAll();
    }, { once: true });

    window.ZZXHooks?.emit("4dv:source", {
      name: file.name,
      size: file.size,
      type: file.type
    });
  }

  function jumpLayer(direction) {
    const t = sourceVideo().currentTime || 0;
    const starts = state.project.layers
      .filter((layer) => layer.enabled)
      .map((layer) => layer.start)
      .sort((a, b) => a - b);

    if (!starts.length) return;

    let target = null;

    if (direction > 0) {
      target = starts.find((value) => value > t + .01);
      if (target == null) target = starts[0];
    } else {
      const prev = starts.filter((value) => value < t - .01);
      target = prev.length ? prev[prev.length - 1] : starts[starts.length - 1];
    }

    sourceVideo().currentTime = target;
    syncNow();
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportProject() {
    updateProjectFields();
    downloadJson(
      portableProject(),
      `4dv-project-${Date.now()}.json`
    );
  }

  function validateImportedProject(value) {
    if (!value || typeof value !== "object") throw new Error("Project JSON must contain an object.");
    if (value.schema !== "zzx.4dv.project.v1") throw new Error("Unsupported 4DV project schema.");
    if (!Array.isArray(value.layers)) throw new Error("4DV project is missing a layers array.");

    return {
      schema: "zzx.4dv.project.v1",
      title: String(value.title || "Imported 4DV Project"),
      notes: String(value.notes || ""),
      source: {
        name: value.source?.name || null,
        size: Number(value.source?.size) || null,
        type: value.source?.type || null,
        duration: Number(value.source?.duration) || null
      },
      layers: value.layers.map((layer) => ({
        id: String(layer.id || uid()),
        type: ["text", "audio", "video"].includes(layer.type) ? layer.type : "text",
        title: String(layer.title || `${layer.type || "text"} layer`),
        text: String(layer.text || ""),
        start: Math.max(0, Number(layer.start) || 0),
        end: Math.max(Number(layer.start) || 0, Number(layer.end) || 0),
        enabled: layer.enabled !== false,
        loop: Boolean(layer.loop),
        mediaUrl: null,
        mediaFileName: layer.media?.fileName || null,
        mediaFileSize: Number(layer.media?.fileSize) || null,
        mediaFileType: layer.media?.fileType || null
      }))
    };
  }

  async function importProjectFile(file) {
    const text = await file.text();
    const value = JSON.parse(text);

    clearLayers();
    state.project = validateImportedProject(value);

    $("project-title").value = state.project.title;
    $("project-notes").value = state.project.notes;

    if (state.project.source.name) {
      $("source-name").textContent = `${state.project.source.name} (reselect source)`;
    }

    renderAll();

    $("project-output").textContent =
      JSON.stringify(portableProject(), null, 2) +
      "\n\nLocal media attachments are not embedded in exported JSON and must be reselected.";

    window.ZZXHooks?.emit("4dv:project-import", {
      title: state.project.title,
      layers: state.project.layers.length
    });
  }

  function newProject() {
    clearLayers();

    state.project = {
      schema: "zzx.4dv.project.v1",
      title: "Untitled 4DV Project",
      notes: "",
      source: {
        name: sourceVideo().src ? state.project.source.name : null,
        size: sourceVideo().src ? state.project.source.size : null,
        type: sourceVideo().src ? state.project.source.type : null,
        duration: sourceVideo().duration || null
      },
      layers: []
    };

    $("project-title").value = state.project.title;
    $("project-notes").value = "";
    renderAll();
  }

  function initTimeline() {
    state.timeline = new window.FourDVTimeline({
      root: $("timeline-root"),
      ruler: $("timeline-ruler"),
      tracks: $("timeline-tracks"),
      playhead: $("timeline-playhead"),
      onSeek: (time) => {
        const video = sourceVideo();
        if (Number.isFinite(video.duration)) {
          video.currentTime = clamp(time, 0, video.duration);
          syncNow();
        }
      }
    });
  }

  function initLayerManager() {
    state.layerManager = new window.FourDVMediaLayerManager({
      sourceVideo: sourceVideo(),
      overlayRoot: $("overlay-root"),
      audioBin: $("audio-layer-bin")
    });
  }

  function bind(id, event, handler) {
    const element = $(id);
    if (!element) return;

    element.addEventListener(event, async (evt) => {
      try {
        await handler(evt);
      } catch (error) {
        console.error(error);
        const out = $("player-output") || $("project-output");
        if (out) out.textContent = `ERROR: ${error.message}`;
      }
    });
  }

  function bindEvents() {
    bind("source-video-file", "change", () => {
      const file = $("source-video-file").files?.[0];
      if (file) loadSourceFile(file);
    });

    bind("add-layer", "click", addLayer);
    bind("clear-layer-form", "click", clearLayerForm);

    bind("capture-start", "click", () => {
      $("layer-start").value = (sourceVideo().currentTime || 0).toFixed(3);
    });

    bind("capture-end", "click", () => {
      $("layer-end").value = (sourceVideo().currentTime || 0).toFixed(3);
    });

    bind("jump-prev-layer", "click", () => jumpLayer(-1));
    bind("jump-next-layer", "click", () => jumpLayer(1));
    bind("timeline-clear", "click", clearLayers);
    bind("timeline-fit", "click", renderTimeline);

    bind("export-project", "click", exportProject);
    bind("new-project", "click", newProject);

    bind("project-file", "change", async () => {
      const file = $("project-file").files?.[0];
      if (file) await importProjectFile(file);
    });

    bind("project-title", "input", renderProjectOutput);
    bind("project-notes", "input", renderProjectOutput);

    const video = sourceVideo();

    video.addEventListener("timeupdate", syncNow);
    video.addEventListener("seeked", () => {
      state.layerManager.onSeek(state.project.layers);
      syncNow();
    });
    video.addEventListener("pause", () => state.layerManager.onPause());
    video.addEventListener("ratechange", syncNow);
    video.addEventListener("ended", () => state.layerManager.onPause());

    const dropzone = $("project-dropzone");

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", async (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".json")) return;
      await importProjectFile(file);
    });

    window.addEventListener("beforeunload", () => {
      cancelAnimationFrame(state.raf);
      state.layerManager.clear();

      if (state.sourceObjectUrl) {
        try { URL.revokeObjectURL(state.sourceObjectUrl); } catch {}
      }
    });
  }

  function exposeApi() {
    window.FourDV = Object.freeze({
      version: "0.1.0-alpha-web",
      getProject: () => portableProject(),
      getLayers: () => state.project.layers.map((layer) => ({ ...layer })),
      addLayer: (layer) => {
        const normalized = {
          id: String(layer.id || uid()),
          type: ["text", "audio", "video"].includes(layer.type) ? layer.type : "text",
          title: String(layer.title || "layer"),
          text: String(layer.text || ""),
          start: Math.max(0, Number(layer.start) || 0),
          end: Math.max(Number(layer.start) || 0, Number(layer.end) || 0),
          enabled: layer.enabled !== false,
          loop: Boolean(layer.loop),
          mediaUrl: layer.mediaUrl || null,
          mediaFileName: layer.mediaFileName || null,
          mediaFileSize: layer.mediaFileSize || null,
          mediaFileType: layer.mediaFileType || null
        };

        state.project.layers.push(normalized);
        renderAll();
        return normalized.id;
      },
      removeLayer,
      clearLayers,
      seek: (seconds) => {
        sourceVideo().currentTime = Math.max(0, Number(seconds) || 0);
        syncNow();
      },
      exportProject,
      importProject: (value) => {
        clearLayers();
        state.project = validateImportedProject(value);
        renderAll();
      },
      getState: () => ({
        currentTime: sourceVideo().currentTime || 0,
        duration: sourceVideo().duration || null,
        layerCount: state.project.layers.length,
        title: state.project.title
      })
    });
  }

  updateRuntimeStatus();
  initTimeline();
  initLayerManager();
  bindEvents();
  clearLayerForm();
  renderAll();
  exposeApi();

  state.raf = requestAnimationFrame(animationLoop);

  window.ZZXHooks?.emit("4dv:ready", {
    version: "0.1.0-alpha-web"
  });
})();

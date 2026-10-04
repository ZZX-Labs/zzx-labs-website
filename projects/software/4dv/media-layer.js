(() => {
  "use strict";

  function safePause(media) {
    if (!media) return;
    try { media.pause(); } catch {}
  }

  function syncMedia(media, sourceVideo, layer, active) {
    if (!media || !sourceVideo) return;

    if (!active) {
      safePause(media);
      return;
    }

    const relative = Math.max(0, sourceVideo.currentTime - layer.start);
    const target = layer.loop && media.duration > 0
      ? relative % media.duration
      : relative;

    if (Number.isFinite(media.duration) && media.duration > 0) {
      const clamped = Math.min(target, Math.max(0, media.duration - .02));
      if (Math.abs(media.currentTime - clamped) > .35) {
        try { media.currentTime = clamped; } catch {}
      }
    }

    media.playbackRate = sourceVideo.playbackRate || 1;

    if (!sourceVideo.paused && !sourceVideo.ended) {
      const promise = media.play();
      if (promise?.catch) promise.catch(() => {});
    } else {
      safePause(media);
    }
  }

  class FourDVMediaLayerManager {
    constructor({ sourceVideo, overlayRoot, audioBin }) {
      this.sourceVideo = sourceVideo;
      this.overlayRoot = overlayRoot;
      this.audioBin = audioBin;
      this.nodes = new Map();
      this.urls = new Set();
    }

    registerObjectUrl(url) {
      if (url) this.urls.add(url);
      return url;
    }

    createNode(layer) {
      if (layer.type === "text") {
        const node = document.createElement("div");
        node.className = "fourdv-text-overlay";
        node.textContent = layer.text || layer.title || "";
        node.hidden = true;
        this.overlayRoot.appendChild(node);
        return node;
      }

      if (layer.type === "audio") {
        const node = document.createElement("audio");
        node.preload = "auto";
        node.hidden = true;
        if (layer.mediaUrl) node.src = layer.mediaUrl;
        node.loop = Boolean(layer.loop);
        this.audioBin.appendChild(node);
        return node;
      }

      if (layer.type === "video") {
        const node = document.createElement("video");
        node.className = "fourdv-video-overlay";
        node.preload = "auto";
        node.muted = false;
        node.playsInline = true;
        if (layer.mediaUrl) node.src = layer.mediaUrl;
        node.loop = Boolean(layer.loop);
        node.hidden = true;
        this.overlayRoot.appendChild(node);
        return node;
      }

      return null;
    }

    ensureNode(layer) {
      if (this.nodes.has(layer.id)) return this.nodes.get(layer.id);
      const node = this.createNode(layer);
      if (node) this.nodes.set(layer.id, node);
      return node;
    }

    removeLayer(id) {
      const node = this.nodes.get(id);
      if (node) {
        safePause(node);
        node.remove();
      }
      this.nodes.delete(id);
    }

    clear() {
      for (const node of this.nodes.values()) {
        safePause(node);
        node.remove();
      }
      this.nodes.clear();

      for (const url of this.urls) {
        try { URL.revokeObjectURL(url); } catch {}
      }
      this.urls.clear();
    }

    sync(layers) {
      const t = this.sourceVideo.currentTime || 0;
      let activeCount = 0;

      for (const layer of layers) {
        const node = this.ensureNode(layer);
        if (!node) continue;

        const active = Boolean(layer.enabled) &&
          t >= Number(layer.start) &&
          t < Number(layer.end);

        if (active) activeCount++;

        if (layer.type === "text") {
          node.hidden = !active;
          if (active) node.textContent = layer.text || layer.title || "";
        } else if (layer.type === "audio") {
          syncMedia(node, this.sourceVideo, layer, active);
        } else if (layer.type === "video") {
          node.hidden = !active;
          syncMedia(node, this.sourceVideo, layer, active);
        }
      }

      const ids = new Set(layers.map((layer) => layer.id));
      for (const id of [...this.nodes.keys()]) {
        if (!ids.has(id)) this.removeLayer(id);
      }

      return activeCount;
    }

    onSeek(layers) {
      this.sync(layers);
    }

    onPause() {
      for (const node of this.nodes.values()) {
        if (node instanceof HTMLMediaElement) safePause(node);
      }
    }
  }

  window.FourDVMediaLayerManager = FourDVMediaLayerManager;
})();

(() => {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const secs = Math.floor(value % 60);
    const ms = Math.floor((value - Math.floor(value)) * 1000);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function niceTicks(duration) {
    const d = Math.max(1, Number(duration) || 1);
    const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const target = d / 8;
    return candidates.find((v) => v >= target) || Math.ceil(target / 600) * 600;
  }

  class FourDVTimeline {
    constructor({ root, ruler, tracks, playhead, onSeek }) {
      this.root = root;
      this.ruler = ruler;
      this.tracks = tracks;
      this.playhead = playhead;
      this.onSeek = typeof onSeek === "function" ? onSeek : () => {};
      this.duration = 1;
      this.layers = [];
      this.currentTime = 0;

      this.root?.addEventListener("click", (event) => {
        const rect = this.root.getBoundingClientRect();
        const x = clamp(event.clientX - rect.left, 0, rect.width);
        const ratio = rect.width ? x / rect.width : 0;
        this.onSeek(ratio * this.duration);
      });
    }

    setDuration(duration) {
      this.duration = Math.max(0.001, Number(duration) || 1);
      this.render();
    }

    setLayers(layers) {
      this.layers = Array.isArray(layers) ? layers : [];
      this.render();
    }

    setCurrentTime(time) {
      this.currentTime = clamp(Number(time) || 0, 0, this.duration);
      if (this.playhead) {
        this.playhead.style.left = `calc(.6rem + ${(this.currentTime / this.duration) * 100}% - ${(this.currentTime / this.duration) * 1.2}rem)`;
      }
    }

    renderRuler() {
      if (!this.ruler) return;
      this.ruler.replaceChildren();

      const step = niceTicks(this.duration);
      for (let t = 0; t <= this.duration + 0.0001; t += step) {
        const span = document.createElement("span");
        span.className = "fourdv-ruler-label";
        span.style.left = `${(t / this.duration) * 100}%`;
        span.textContent = formatTime(t);
        this.ruler.appendChild(span);
      }
    }

    render() {
      this.renderRuler();
      if (!this.tracks) return;

      this.tracks.replaceChildren();

      for (const type of ["text", "audio", "video"]) {
        const row = document.createElement("div");
        row.className = "fourdv-track-row";
        row.dataset.type = type;

        const label = document.createElement("span");
        label.className = "fourdv-track-name";
        label.textContent = type.toUpperCase();
        row.appendChild(label);

        const clips = this.layers.filter((layer) => layer.type === type);
        for (const layer of clips) {
          const clip = document.createElement("button");
          clip.type = "button";
          clip.className = `fourdv-clip ${type}`;
          clip.title = `${layer.title || type} (${formatTime(layer.start)} – ${formatTime(layer.end)})`;
          clip.textContent = layer.title || type;

          const start = clamp(layer.start / this.duration, 0, 1);
          const end = clamp(layer.end / this.duration, start, 1);
          clip.style.left = `${start * 100}%`;
          clip.style.width = `${Math.max(.35, (end - start) * 100)}%`;

          clip.addEventListener("click", (event) => {
            event.stopPropagation();
            this.onSeek(layer.start);
          });

          row.appendChild(clip);
        }

        this.tracks.appendChild(row);
      }

      this.setCurrentTime(this.currentTime);
    }
  }

  window.FourDVTimeline = FourDVTimeline;
  window.FourDVTime = Object.freeze({ formatTime });
})();

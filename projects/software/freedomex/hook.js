(() => {
  "use strict";

  const listeners = new Map();

  window.ZZXHooks = window.ZZXHooks || Object.freeze({
    on(name, handler) {
      if (typeof name !== "string" || typeof handler !== "function") {
        throw new TypeError("ZZXHooks.on(name, handler) requires a string and function.");
      }

      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
      return () => listeners.get(name)?.delete(handler);
    },

    emit(name, payload) {
      const handlers = listeners.get(name);
      if (!handlers) return;

      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[ZZXHooks:${name}]`, error);
        }
      }
    }
  });

  function mountFallbackShell() {
    const header = document.getElementById("zzx-header");
    const footer = document.getElementById("zzx-footer");
    if (header && !header.children.length && !header.textContent.trim()) {
      header.className = "zzx-fallback-header";
      header.innerHTML = '<a class="zzx-fallback-brand" href="/">ZZX-LABS R&amp;D</a><nav aria-label="Project navigation"><a href="/projects/">PROJECTS</a><a href="/projects/software/">SOFTWARE</a><a href="./README.md">README</a></nav>';
    }
    if (footer && !footer.children.length && !footer.textContent.trim()) {
      footer.className = "zzx-fallback-footer";
      footer.innerHTML = `<span>ZZX-LABS R&amp;D // FREEDOMX // ${new Date().getFullYear()}</span><span>BITCOIN ONLY · NONCUSTODIAL RESEARCH</span>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountFallbackShell, { once: true });
  else mountFallbackShell();

  window.dispatchEvent(new CustomEvent("zzx:hooks-ready"));
})();

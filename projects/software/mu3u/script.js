// /projects/software/mu3u/script.js
// mu3u — M3U/M3U8 Playlist Builder, Editor, Viewer
(() => {
  const tbody = document.getElementById("mu3u-tbody");
  const tplRow = document.getElementById("tpl-row");
  const outEl = document.getElementById("mu3u-output");
  const statusEl = document.getElementById("mu3u-status");
  const reportEl = document.getElementById("mu3u-report");
  const audioEl = document.getElementById("mu3u-audio");
  const previewTitle = document.getElementById("preview-title");
  const previewUrl = document.getElementById("preview-url");

  const fileInput = document.getElementById("mu3u-file");

  const rows = () => Array.from(tbody.querySelectorAll("tr"));

  function newRow(data = {}) {
    const node = tplRow.content.cloneNode(true);
    const tr = node.querySelector("tr");
    if (data.title) tr.querySelector(".title").value = data.title;
    if (data.url) tr.querySelector(".url").value = data.url;
    if (typeof data.dur !== "undefined") tr.querySelector(".dur").value = data.dur;
    if (data.attrs) tr.querySelector(".attrs").value = data.attrs;

    tbody.appendChild(tr);
    renumber();
  }

  function renumber() {
    rows().forEach((tr, i) => {
      tr.querySelector(".idx").textContent = i + 1;
    });
    updateOutput();
  }

  function updateOutput() {
    const lines = ["#EXTM3U"];
    rows().forEach((tr) => {
      const title = tr.querySelector(".title").value.trim();
      const url = tr.querySelector(".url").value.trim();
      const dur = tr.querySelector(".dur").value.trim();
      const attrs = tr.querySelector(".attrs").value.trim();

      if (!url) return;

      let line = `#EXTINF:${dur || -1},${title || ""}`;
      if (attrs) line += ` ${attrs}`;
      lines.push(line);
      lines.push(url);
    });
    outEl.value = lines.join("\n");
    status("Updated");
  }

  function status(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function validate() {
    const issues = [];
    rows().forEach((tr, i) => {
      const url = tr.querySelector(".url").value.trim();
      if (!url) issues.push(`Row ${i + 1}: Missing URL`);
    });
    reportEl.textContent = issues.length ? issues.join("\n") : "No issues.";
  }

  function dedup() {
    const seen = new Set();
    rows().forEach((tr) => {
      const url = tr.querySelector(".url").value.trim();
      if (url && seen.has(url)) tr.remove();
      else if (url) seen.add(url);
    });
    renumber();
  }

  function sortAZ() {
    const sorted = rows().sort((a, b) => {
      const ta = a.querySelector(".title").value.toLowerCase();
      const tb = b.querySelector(".title").value.toLowerCase();
      return ta.localeCompare(tb);
    });
    tbody.innerHTML = "";
    sorted.forEach((r) => tbody.appendChild(r));
    renumber();
  }

  function clearAll() {
    tbody.innerHTML = "";
    renumber();
  }

  function playRow(tr) {
    const url = tr.querySelector(".url").value.trim();
    if (!url) return;
    audioEl.src = url;
    audioEl.play().catch(() => {});
    previewTitle.textContent = tr.querySelector(".title").value || "—";
    previewUrl.textContent = url;
  }

  // Row actions
  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    if (e.target.classList.contains("row-up")) {
      if (tr.previousElementSibling) tbody.insertBefore(tr, tr.previousElementSibling);
      renumber();
    }
    if (e.target.classList.contains("row-down")) {
      if (tr.nextElementSibling) tbody.insertBefore(tr.nextElementSibling, tr);
      renumber();
    }
    if (e.target.classList.contains("row-del")) {
      tr.remove();
      renumber();
    }
    if (e.target.classList.contains("row-play")) {
      playRow(tr);
    }
  });

  tbody.addEventListener("input", updateOutput);

  // Buttons
  document.getElementById("btn-add").onclick = () => newRow();
  document.getElementById("btn-new").onclick = () => clearAll();
  document.getElementById("btn-clear").onclick = () => clearAll();
  document.getElementById("btn-validate").onclick = () => validate();
  document.getElementById("btn-dedup").onclick = () => dedup();
  document.getElementById("btn-sort").onclick = () => sortAZ();

  // Import/export
  document.getElementById("btn-import").onclick = () => fileInput.click();
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    parseM3U(text);
  };

  document.getElementById("btn-paste").onclick = () => {
    const text = prompt("Paste M3U/M3U8 content:");
    if (text) parseM3U(text);
  };

  document.getElementById("btn-export").onclick = () => download("playlist.m3u", outEl.value);
  document.getElementById("btn-export-m3u8").onclick = () => {
    const text = outEl.value.replace(/\r?\n/g, "\r\n");
    download("playlist.m3u8", text);
  };

  function download(name, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function parseM3U(text) {
    clearAll();
    const lines = text.split(/\r?\n/);
    let pendingTitle = "";
    let pendingDur = -1;
    let pendingAttrs = "";

    lines.forEach((line) => {
      if (!line.trim()) return;
      if (line.startsWith("#EXTM3U")) return;
      if (line.startsWith("#EXTINF:")) {
        const [, rest] = line.split(":", 2);
        let dur = -1;
        let title = "";
        let attrs = "";

        const match = rest.match(/^(-?\d+),(.*)$/);
        if (match) {
          dur = parseInt(match[1], 10);
          const parts = match[2].split(/\s+(?=\w+=)/);
          title = parts.shift() || "";
          attrs = parts.join(" ");
        }
        pendingTitle = title.trim();
        pendingDur = dur;
        pendingAttrs = attrs;
      } else if (!line.startsWith("#")) {
        newRow({ title: pendingTitle, url: line.trim(), dur: pendingDur, attrs: pendingAttrs });
        pendingTitle = "";
        pendingDur = -1;
        pendingAttrs = "";
      }
    });
    status("Imported");
  }

  // Initialize
  newRow();
})();

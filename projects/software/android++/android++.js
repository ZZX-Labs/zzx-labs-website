(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    editor: null,
    vault: new AndroidPPCryptoVault(),
    apk: new AndroidPPAPKContainer(),
    transform: {
      output: "",
      target: null
    },
    findCursor: 0
  };

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function runtimeStatus() {
    const cryptoBadge = $("status-crypto");
    const webCrypto = Boolean(crypto?.subtle && crypto?.getRandomValues);
    cryptoBadge.textContent = `CRYPTO: ${webCrypto ? "YES" : "NO"}`;
    cryptoBadge.className = `runtime-badge ${webCrypto ? "ok" : "no"}`;

    $("crypto-webcrypto").className = `androidpp-badge ${webCrypto ? "ok" : "no"}`;
  }

  function renderTabs() {
    const root = $("editor-tabs");
    root.replaceChildren();

    for (const doc of state.editor.documents) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `androidpp-tab ${doc.id === state.editor.activeId ? "active" : ""}`;

      const name = document.createElement("span");
      name.className = "androidpp-tab-name";
      name.textContent = doc.name;

      if (doc.dirty) {
        const dirty = document.createElement("span");
        dirty.className = "androidpp-tab-dirty";
        dirty.textContent = "●";
        tab.append(name, dirty);
      } else {
        tab.append(name);
      }

      const close = document.createElement("span");
      close.className = "androidpp-tab-close";
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        state.editor.close(doc.id);
        renderAll();
      });

      tab.append(close);
      tab.addEventListener("click", () => {
        state.editor.activate(doc.id);
        renderAll();
      });
      root.appendChild(tab);
    }
  }

  function renderFiles() {
    const root = $("file-list");
    root.replaceChildren();

    for (const doc of state.editor.documents) {
      const row = document.createElement("div");
      row.className = "androidpp-file-row";

      const code = document.createElement("code");
      code.textContent = `${doc.name}${doc.dirty ? " *" : ""}`;

      const meta = document.createElement("span");
      meta.textContent = `${doc.language} · ${doc.text.length.toLocaleString()} chars`;

      row.append(code, meta);
      row.addEventListener("click", () => {
        state.editor.activate(doc.id);
        renderAll();
      });
      root.appendChild(row);
    }

    const active = state.editor.active();
    $("file-rename").value = active?.name || "";
    $("files-output").textContent = JSON.stringify({
      documents: state.editor.documents.map((doc) => ({
        name: doc.name,
        language: doc.language,
        chars: doc.text.length,
        dirty: doc.dirty
      })),
      active: active?.name || null
    }, null, 2);
  }

  function renderStatus() {
    const info = state.editor.cursorInfo();
    $("status-line").textContent = String(info.line);
    $("status-col").textContent = String(info.col);
    $("status-lines").textContent = String(info.lines);
    $("status-chars").textContent = String(info.chars);

    const active = state.editor.active();
    if (active) $("editor-language").value = active.language;
    $("editor-wrap").textContent = `WRAP: ${state.editor.wrap ? "ON" : "OFF"}`;
  }

  function renderAll() {
    renderTabs();
    renderFiles();
    renderStatus();
  }

  function newDocument() {
    state.editor.newDocument("new 1.txt", "");
    renderAll();
  }

  async function openFiles(files) {
    await state.editor.openFiles(files);
    renderAll();
  }

  function downloadAs() {
    const active = state.editor.active();
    if (!active) return;
    const name = prompt("Download filename:", active.name);
    if (name) state.editor.download(active.id, name);
    renderAll();
  }

  function findRegex() {
    const query = $("find-query").value;
    if (!query) throw new Error("Enter search text.");

    const flags = $("find-case").checked ? "g" : "gi";
    return new RegExp(
      $("find-regex").checked ? query : escapeRegExp(query),
      flags
    );
  }

  function findNext() {
    const rx = findRegex();
    const text = state.editor.currentText();
    rx.lastIndex = state.findCursor;

    let match = rx.exec(text);
    if (!match && state.findCursor > 0) {
      rx.lastIndex = 0;
      match = rx.exec(text);
    }

    if (!match) {
      $("find-result").textContent = "No match.";
      return null;
    }

    const start = match.index;
    const end = start + Math.max(1, match[0].length);
    state.editor.textarea.focus();
    state.editor.textarea.setSelectionRange(start, end);
    state.findCursor = end;

    const line = text.slice(0, start).split("\n").length;
    $("find-result").textContent =
      `Match at line ${line}, characters ${start}–${end}.\n${match[0]}`;

    renderStatus();
    return { start, end, match };
  }

  function replaceOne() {
    let start = state.editor.textarea.selectionStart;
    let end = state.editor.textarea.selectionEnd;

    if (start === end) {
      const result = findNext();
      if (!result) return;
      start = result.start;
      end = result.end;
    }

    state.editor.replaceRange(start, end, $("replace-query").value);
    state.findCursor = start + $("replace-query").value.length;
    $("find-result").textContent = "Replaced current match.";
    renderAll();
  }

  function replaceAll() {
    const rx = findRegex();
    const text = state.editor.currentText();
    let count = 0;
    const replaced = text.replace(rx, () => {
      count++;
      return $("replace-query").value;
    });
    state.editor.setText(replaced);
    state.findCursor = 0;
    $("find-result").textContent = `Replaced ${count} match(es).`;
    renderAll();
  }

  async function runTransform(name) {
    const target = state.editor.targetText();
    const output = await AndroidPPTransforms.run(name, target.text);
    state.transform = { output, target, name };
    $("transform-output").value = output;
  }

  function replaceTransformTarget() {
    if (!state.transform.target) throw new Error("Run a transform first.");
    state.editor.replaceRange(
      state.transform.target.start,
      state.transform.target.end,
      state.transform.output
    );
    renderAll();
  }

  function transformNewDocument() {
    if (!state.transform.target) throw new Error("Run a transform first.");
    const ext = state.transform.name === "sha256" ? "txt" : "txt";
    state.editor.newDocument(`transform-${state.transform.name}.${ext}`, state.transform.output);
    renderAll();
  }

  async function encryptCurrent() {
    const passphrase = $("crypto-passphrase").value;
    const iterations = Number($("crypto-iterations").value);
    const container = await state.vault.encrypt(
      state.editor.targetText().text,
      passphrase,
      iterations
    );
    $("crypto-container").value = JSON.stringify(container, null, 2);
  }

  async function decryptContainer() {
    const text = await state.vault.decrypt(
      $("crypto-container").value,
      $("crypto-passphrase").value
    );
    state.editor.newDocument("decrypted.txt", text);
    renderAll();
  }

  function downloadVault() {
    const text = $("crypto-container").value.trim();
    if (!text) throw new Error("No encrypted container to download.");
    JSON.parse(text);

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `androidpp-${Date.now()}.androidpp-vault`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadVaultFile(file) {
    $("crypto-container").value = await file.text();
  }

  function setApkBadge(id, cls) {
    const el = $(id);
    el.className = `androidpp-badge ${cls || ""}`.trim();
  }

  function renderApk(info) {
    $("apk-size").textContent = info.sizeFormatted;
    $("apk-entries").textContent = String(info.entryCount);
    $("apk-dex").textContent = String(info.dex.length);
    $("apk-web").textContent = String(info.webAssets.length);
    $("apk-sha256").value = info.sha256;

    setApkBadge("apk-badge-zip", "ok");
    setApkBadge("apk-badge-manifest", info.androidManifest ? "ok" : "no");
    setApkBadge("apk-badge-dex", info.dex.length ? "ok" : "no");
    setApkBadge("apk-badge-web", info.htmlEntries.length ? "ok" : "warn");
    setApkBadge(
      "apk-badge-signature",
      info.signingBlock || info.legacySig.length ? "ok" : "warn"
    );

    $("apk-run-web").disabled = !info.htmlEntries.length;
    $("status-apk").textContent = `APK: ${info.likelyApk ? "LOADED" : "ZIP"}`;
    $("status-apk").className = `runtime-badge ${info.likelyApk ? "ok" : "partial"}`;

    $("apk-output").textContent = JSON.stringify({
      source: info.source,
      size: info.size,
      sha256: info.sha256,
      entryCount: info.entryCount,
      androidManifest: info.androidManifest,
      dex: info.dex,
      nativeLibraries: info.libs.length,
      resourcesArsc: info.resourcesArsc,
      signature: {
        apkSigningBlock: info.signingBlock,
        legacyEntries: info.legacySig
      },
      webAssets: info.webAssets.length,
      htmlEntrypoints: info.likelyEntrypoints,
      nativeDexExecutableInBrowser: false,
      runtimeProviderRegistered: Boolean(state.apk.runtimeProvider)
    }, null, 2);

    const list = $("apk-entry-list");
    list.replaceChildren();

    for (const entry of info.entries.slice(0, 1200)) {
      const row = document.createElement("div");
      row.className = "androidpp-apk-entry";

      const name = document.createElement("code");
      name.textContent = entry.name;

      const size = document.createElement("span");
      size.textContent = AndroidPPAPKTools.formatBytes(entry.uncompressedSize);

      row.append(name, size);
      list.appendChild(row);
    }

    if (info.entries.length > 1200) {
      const row = document.createElement("div");
      row.className = "androidpp-apk-entry";
      const name = document.createElement("code");
      name.textContent = `… ${info.entries.length - 1200} additional entries omitted`;
      row.appendChild(name);
      list.appendChild(row);
    }
  }

  async function loadHostedApk() {
    $("apk-output").textContent = "Fetching ./androidpp.apk as inert package data…";
    try {
      const info = await state.apk.loadUrl("./androidpp.apk");
      renderApk(info);
    } catch (error) {
      $("status-apk").textContent = "APK: NOT FOUND";
      $("status-apk").className = "runtime-badge partial";
      $("apk-output").textContent =
        `Hosted APK could not be loaded.\n${error.message}\n\n` +
        `The browser-native Android++ editor remains fully operational. ` +
        `Place the raw APK at ./androidpp.apk or select it locally.`;
    }
  }

  async function loadApkFile(file) {
    $("apk-output").textContent = `Reading ${file.name}…`;
    const info = await state.apk.loadFile(file);
    renderApk(info);
  }

  async function runApkWebContainer() {
    const frame = $("apk-container-frame");
    const placeholder = $("apk-container-placeholder");

    const result = await state.apk.runWebAssetContainer(frame);
    placeholder.hidden = true;
    frame.hidden = false;

    $("apk-output").textContent +=
      `\n\nSandboxed WebView asset container launched from:\n${result.entrypoint}\n` +
      `Network access is blocked by injected CSP and iframe sandbox.`;
  }

  function resetApkContainer() {
    const frame = $("apk-container-frame");
    state.apk.resetSandbox(frame);
    frame.hidden = true;
    const placeholder = $("apk-container-placeholder");
    placeholder.hidden = false;
    placeholder.textContent = "APK web-asset container is not running.";
  }

  function setupDropzone() {
    const drop = $("apk-drop");

    ["dragenter", "dragover"].forEach((name) => {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.classList.remove("dragover");
      });
    });

    drop.addEventListener("drop", async (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;

      try {
        if (!file.name.toLowerCase().endsWith(".apk")) {
          throw new Error("Dropped file is not an .apk file.");
        }
        await loadApkFile(file);
      } catch (error) {
        $("apk-output").textContent = `ERROR: ${error.message}`;
      }
    });
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (!el) return;

    el.addEventListener(event, async (evt) => {
      try {
        await handler(evt);
      } catch (error) {
        console.error(error);
        const target =
          id.includes("apk") ? $("apk-output") :
          id.includes("crypto") ? $("crypto-container") :
          id.includes("transform") ? $("transform-output") :
          id.includes("find") || id.includes("replace") ? $("find-result") :
          $("files-output");

        if (target) {
          if ("value" in target && target.tagName === "TEXTAREA") target.value = `ERROR: ${error.message}`;
          else target.textContent = `ERROR: ${error.message}`;
        }
      }
    });
  }

  function bindEvents() {
    bind("editor-new", "click", newDocument);
    bind("files-new", "click", newDocument);

    bind("editor-open", "change", async () => {
      const files = [...($("editor-open").files || [])];
      if (files.length) await openFiles(files);
      $("editor-open").value = "";
    });

    bind("files-open", "change", async () => {
      const files = [...($("files-open").files || [])];
      if (files.length) await openFiles(files);
      $("files-open").value = "";
    });

    bind("editor-save", "click", () => {
      state.editor.download();
      renderAll();
    });
    bind("editor-save-copy", "click", downloadAs);

    bind("editor-language", "change", () => {
      state.editor.setLanguage($("editor-language").value);
      renderAll();
    });

    bind("editor-wrap", "click", () => {
      state.editor.setWrap(!state.editor.wrap);
      renderAll();
    });

    bind("file-apply-name", "click", () => {
      const active = state.editor.active();
      if (!active) return;
      state.editor.rename(active.id, $("file-rename").value);
      renderAll();
    });

    bind("file-duplicate", "click", () => {
      const active = state.editor.active();
      if (active) state.editor.duplicate(active.id);
      renderAll();
    });

    bind("file-close", "click", () => {
      const active = state.editor.active();
      if (active) state.editor.close(active.id);
      renderAll();
    });

    bind("find-next", "click", findNext);
    bind("replace-one", "click", replaceOne);
    bind("replace-all", "click", replaceAll);

    document.querySelectorAll("[data-transform]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await runTransform(button.dataset.transform);
        } catch (error) {
          $("transform-output").value = `ERROR: ${error.message}`;
        }
      });
    });

    bind("transform-replace", "click", replaceTransformTarget);
    bind("transform-newdoc", "click", transformNewDocument);
    bind("transform-copy", "click", async () => {
      await navigator.clipboard.writeText($("transform-output").value);
    });

    bind("crypto-encrypt", "click", encryptCurrent);
    bind("crypto-decrypt", "click", decryptContainer);
    bind("crypto-save", "click", downloadVault);

    bind("crypto-load", "change", async () => {
      const file = $("crypto-load").files?.[0];
      if (file) await loadVaultFile(file);
      $("crypto-load").value = "";
    });

    bind("apk-load-hosted", "click", loadHostedApk);
    bind("apk-file", "change", async () => {
      const file = $("apk-file").files?.[0];
      if (file) await loadApkFile(file);
      $("apk-file").value = "";
    });
    bind("apk-run-web", "click", runApkWebContainer);
    bind("apk-stop-container", "click", resetApkContainer);

    state.editor.textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        state.editor.download();
        renderAll();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.querySelector('.mode-tab[data-mode="find"]')?.click();
        $("find-query").focus();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newDocument();
      }
    });

    setupDropzone();
  }

  function exposeApi() {
    window.AndroidPP = Object.freeze({
      version: "0.6.0-alpha-web",

      newDocument(name, text = "") {
        const doc = state.editor.newDocument(name || "new.txt", text);
        renderAll();
        return doc.id;
      },

      getDocuments() {
        return state.editor.documents.map((doc) => ({ ...doc }));
      },

      getActiveDocument() {
        const doc = state.editor.active();
        return doc ? { ...doc, text: state.editor.currentText() } : null;
      },

      setActiveText(text) {
        state.editor.setText(text);
        renderAll();
      },

      transform(name, text) {
        return AndroidPPTransforms.run(name, text);
      },

      encrypt(text, passphrase, iterations) {
        return state.vault.encrypt(text, passphrase, iterations);
      },

      decrypt(container, passphrase) {
        return state.vault.decrypt(container, passphrase);
      },

      registerOpenPGPProvider(provider) {
        state.vault.registerOpenPGPProvider(provider);
        $("crypto-pgp").textContent = provider
          ? "OPENPGP PROVIDER: READY"
          : "OPENPGP PROVIDER: NONE";
        $("crypto-pgp").className = `androidpp-badge ${provider ? "ok" : "warn"}`;
      },

      registerAndroidRuntimeProvider(provider) {
        state.apk.registerRuntimeProvider(provider);
      },

      inspectApkFile(file) {
        return state.apk.loadFile(file);
      },

      inspectApkUrl(url) {
        return state.apk.loadUrl(url);
      },

      runApkRuntime(options) {
        return state.apk.runNativeProvider(options);
      },

      getState() {
        return {
          documents: state.editor.documents.length,
          active: state.editor.active()?.name || null,
          wrap: state.editor.wrap,
          openpgpProvider: Boolean(state.vault.openpgpProvider),
          apkLoaded: Boolean(state.apk.buffer),
          androidRuntimeProvider: Boolean(state.apk.runtimeProvider)
        };
      }
    });
  }

  runtimeStatus();

  state.editor = new AndroidPPEditorCore(
    $("editor-code"),
    $("editor-gutter")
  );
  state.editor.onChange = () => {
    renderTabs();
    renderStatus();
  };
  state.editor.onState = renderStatus;

  if (!state.editor.restore()) {
    state.editor.newDocument(
      "welcome.txt",
      "Android++ browser-native editor is ready.\n\n" +
      "Open local files, create tabs, search/replace, run transforms, " +
      "encrypt notes, or inspect the Android APK from the APK Container tab.\n"
    );
  }

  bindEvents();
  renderAll();
  exposeApi();

  window.ZZXHooks?.emit("androidpp:ready", {
    version: "0.6.0-alpha-web"
  });
})();

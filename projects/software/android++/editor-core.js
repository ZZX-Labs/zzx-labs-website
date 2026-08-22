(() => {
  "use strict";

  const STORAGE = "zzx-androidpp-editor-v1";

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function languageFromName(name) {
    const ext = String(name || "").toLowerCase().split(".").pop();
    return ({
      js: "javascript", mjs: "javascript", cjs: "javascript",
      py: "python",
      html: "html", htm: "html",
      css: "css",
      json: "json",
      md: "markdown", markdown: "markdown",
      sh: "shell", bash: "shell", zsh: "shell",
      kt: "kotlin", kts: "kotlin",
      java: "java",
      xml: "xml"
    })[ext] || "plain";
  }

  class AndroidPPEditorCore {
    constructor(textarea, gutter) {
      this.textarea = textarea;
      this.gutter = gutter;
      this.documents = [];
      this.activeId = null;
      this.wrap = false;
      this.onChange = () => {};
      this.onState = () => {};

      this.textarea.addEventListener("input", () => {
        const doc = this.active();
        if (!doc) return;
        doc.text = this.textarea.value;
        doc.dirty = true;
        this.updateGutter();
        this.onChange(doc);
        this.onState();
        this.persist();
      });

      this.textarea.addEventListener("scroll", () => {
        this.gutter.scrollTop = this.textarea.scrollTop;
      });

      this.textarea.addEventListener("click", () => this.onState());
      this.textarea.addEventListener("keyup", () => this.onState());
      this.textarea.addEventListener("select", () => this.onState());

      this.textarea.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const start = this.textarea.selectionStart;
          const end = this.textarea.selectionEnd;
          const value = this.textarea.value;
          this.textarea.setRangeText("    ", start, end, "end");
          this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    active() {
      return this.documents.find((doc) => doc.id === this.activeId) || null;
    }

    newDocument(name = "new 1.txt", text = "", language = null) {
      let finalName = name;
      let i = 1;
      const names = new Set(this.documents.map((doc) => doc.name));
      while (names.has(finalName)) {
        i++;
        const dot = name.lastIndexOf(".");
        finalName = dot > 0
          ? `${name.slice(0, dot)} ${i}${name.slice(dot)}`
          : `${name} ${i}`;
      }

      const doc = {
        id: uid(),
        name: finalName,
        text: String(text ?? ""),
        language: language || languageFromName(finalName),
        dirty: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.documents.push(doc);
      this.activate(doc.id);
      this.persist();
      return doc;
    }

    activate(id) {
      const current = this.active();
      if (current) {
        current.text = this.textarea.value;
      }

      const next = this.documents.find((doc) => doc.id === id);
      if (!next) return null;

      this.activeId = id;
      this.textarea.value = next.text;
      this.updateGutter();
      this.onChange(next);
      this.onState();
      this.persist();
      return next;
    }

    close(id) {
      const index = this.documents.findIndex((doc) => doc.id === id);
      if (index < 0) return;

      const wasActive = this.activeId === id;
      this.documents.splice(index, 1);

      if (!this.documents.length) {
        this.activeId = null;
        this.newDocument("new 1.txt", "");
        return;
      }

      if (wasActive) {
        const next = this.documents[Math.min(index, this.documents.length - 1)];
        this.activate(next.id);
      } else {
        this.onState();
        this.persist();
      }
    }

    rename(id, name) {
      const doc = this.documents.find((d) => d.id === id);
      if (!doc) return;
      const value = String(name || "").trim();
      if (!value) throw new Error("Document name cannot be empty.");
      doc.name = value;
      doc.language = languageFromName(value);
      doc.dirty = true;
      this.onState();
      this.persist();
    }

    duplicate(id) {
      const doc = this.documents.find((d) => d.id === id);
      if (!doc) return null;
      return this.newDocument(`${doc.name}.copy`, doc.text, doc.language);
    }

    async openFiles(files) {
      const opened = [];
      for (const file of files) {
        const text = await file.text();
        const doc = this.newDocument(file.name, text, languageFromName(file.name));
        doc.dirty = false;
        opened.push(doc);
      }
      this.onState();
      this.persist();
      return opened;
    }

    setLanguage(language) {
      const doc = this.active();
      if (!doc) return;
      doc.language = language;
      this.onState();
      this.persist();
    }

    setWrap(enabled) {
      this.wrap = Boolean(enabled);
      this.textarea.classList.toggle("wrap", this.wrap);
      this.onState();
    }

    updateGutter() {
      const lines = this.textarea.value.split("\n").length;
      let output = "";
      for (let i = 1; i <= lines; i++) output += `${i}\n`;
      this.gutter.textContent = output || "1";
      this.gutter.scrollTop = this.textarea.scrollTop;
    }

    cursorInfo() {
      const value = this.textarea.value;
      const pos = this.textarea.selectionStart;
      const before = value.slice(0, pos);
      const line = before.split("\n").length;
      const lastBreak = before.lastIndexOf("\n");
      const col = pos - lastBreak;
      return {
        line,
        col,
        lines: value.split("\n").length,
        chars: value.length,
        selectionStart: this.textarea.selectionStart,
        selectionEnd: this.textarea.selectionEnd
      };
    }

    targetText() {
      const start = this.textarea.selectionStart;
      const end = this.textarea.selectionEnd;
      if (end > start) {
        return {
          text: this.textarea.value.slice(start, end),
          start,
          end,
          selection: true
        };
      }
      return {
        text: this.textarea.value,
        start: 0,
        end: this.textarea.value.length,
        selection: false
      };
    }

    replaceRange(start, end, text) {
      this.textarea.focus();
      this.textarea.setSelectionRange(start, end);
      this.textarea.setRangeText(String(text), start, end, "end");
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setText(text) {
      this.textarea.value = String(text ?? "");
      this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    currentText() {
      return this.textarea.value;
    }

    download(id = this.activeId, asName = null) {
      const doc = this.documents.find((d) => d.id === id);
      if (!doc) throw new Error("No active document.");

      if (id === this.activeId) doc.text = this.textarea.value;
      const blob = new Blob([doc.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = asName || doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      doc.dirty = false;
      this.onState();
      this.persist();
    }

    serialize() {
      const active = this.active();
      if (active) active.text = this.textarea.value;
      return {
        activeId: this.activeId,
        wrap: this.wrap,
        documents: this.documents.map((doc) => ({ ...doc }))
      };
    }

    persist() {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(this.serialize()));
      } catch {}
    }

    restore() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE) || "{}");
        if (!Array.isArray(value.documents) || !value.documents.length) return false;
        this.documents = value.documents.map((doc) => ({
          id: String(doc.id || uid()),
          name: String(doc.name || "untitled.txt"),
          text: String(doc.text || ""),
          language: doc.language || languageFromName(doc.name),
          dirty: Boolean(doc.dirty),
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || new Date().toISOString()
        }));
        this.wrap = Boolean(value.wrap);
        this.textarea.classList.toggle("wrap", this.wrap);
        const id = this.documents.some((doc) => doc.id === value.activeId)
          ? value.activeId
          : this.documents[0].id;
        this.activate(id);
        return true;
      } catch {
        return false;
      }
    }
  }

  window.AndroidPPEditorCore = AndroidPPEditorCore;
})();

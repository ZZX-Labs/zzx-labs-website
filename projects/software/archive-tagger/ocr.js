(() => {
  "use strict";

  class ArchiveTaggerOCR {
    constructor() {
      this.provider = null;
      this.name = null;

      if (window.Tesseract?.recognize) {
        this.provider = async ({ file }) => {
          const result = await window.Tesseract.recognize(file, "eng");
          return result?.data?.text || "";
        };
        this.name = "Tesseract.js";
      }
    }

    register(provider, name = "custom") {
      if (provider !== null && typeof provider !== "function") {
        throw new TypeError("OCR provider must be a function or null.");
      }
      this.provider = provider;
      this.name = provider ? name : null;
    }

    async recognize(file, context = {}) {
      if (!this.provider) {
        throw new Error("No OCR provider is available. Load Tesseract.js or register one.");
      }
      return String(await this.provider({ file, ...context }) || "");
    }
  }

  window.ArchiveTaggerOCR = ArchiveTaggerOCR;
})();

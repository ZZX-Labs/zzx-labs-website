(() => {
  "use strict";

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(bytes) {
    return AndroidPPTransforms.bytesToBase64(bytes);
  }

  function unb64(text) {
    return AndroidPPTransforms.base64ToBytes(text);
  }

  async function deriveKey(passphrase, salt, iterations) {
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  class AndroidPPCryptoVault {
    constructor() {
      this.openpgpProvider = null;
    }

    async encrypt(text, passphrase, iterations = 310000) {
      if (!crypto?.subtle) throw new Error("Web Crypto API unavailable.");
      if (!passphrase) throw new Error("Passphrase is required.");

      const rounds = Math.max(100000, Math.min(2000000, Math.round(Number(iterations) || 310000)));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(passphrase, salt, rounds);

      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key,
        enc.encode(String(text))
      );

      return {
        format: "androidpp-vault",
        version: 1,
        cipher: "AES-256-GCM",
        kdf: "PBKDF2-HMAC-SHA256",
        iterations: rounds,
        salt: b64(salt),
        iv: b64(iv),
        ciphertext: b64(new Uint8Array(ciphertext)),
        createdAt: new Date().toISOString()
      };
    }

    async decrypt(container, passphrase) {
      if (!passphrase) throw new Error("Passphrase is required.");

      const value = typeof container === "string"
        ? JSON.parse(container)
        : container;

      if (value?.format !== "androidpp-vault" || value?.version !== 1) {
        throw new Error("Unsupported Android++ vault format.");
      }

      const salt = unb64(value.salt);
      const iv = unb64(value.iv);
      const ciphertext = unb64(value.ciphertext);
      const key = await deriveKey(passphrase, salt, Number(value.iterations));

      try {
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          key,
          ciphertext
        );
        return dec.decode(plain);
      } catch {
        throw new Error("Decryption failed: wrong passphrase or modified container.");
      }
    }

    registerOpenPGPProvider(provider) {
      if (provider !== null && typeof provider !== "object" && typeof provider !== "function") {
        throw new TypeError("OpenPGP provider must be an object/function or null.");
      }
      this.openpgpProvider = provider;
    }

    async pgpEncrypt(options) {
      if (!this.openpgpProvider) throw new Error("No OpenPGP provider registered.");
      if (typeof this.openpgpProvider === "function") {
        return this.openpgpProvider({ operation: "encrypt", ...options });
      }
      if (typeof this.openpgpProvider.encrypt !== "function") {
        throw new Error("Registered OpenPGP provider has no encrypt() method.");
      }
      return this.openpgpProvider.encrypt(options);
    }

    async pgpDecrypt(options) {
      if (!this.openpgpProvider) throw new Error("No OpenPGP provider registered.");
      if (typeof this.openpgpProvider === "function") {
        return this.openpgpProvider({ operation: "decrypt", ...options });
      }
      if (typeof this.openpgpProvider.decrypt !== "function") {
        throw new Error("Registered OpenPGP provider has no decrypt() method.");
      }
      return this.openpgpProvider.decrypt(options);
    }
  }

  window.AndroidPPCryptoVault = AndroidPPCryptoVault;
})();

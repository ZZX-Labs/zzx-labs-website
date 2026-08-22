(() => {
  "use strict";

  function cleanBase(url) {
    const value = String(url || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(value)) throw new Error("Provider URL must use HTTP or HTTPS.");
    return value;
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "Accept": "application/json",
          ...(options.headers || {})
        },
        body: options.body,
        mode: "cors",
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return response.json();

      const text = await response.text();
      try { return JSON.parse(text); } catch { return text; }
    } finally {
      clearTimeout(timeout);
    }
  }

  class AIPDABEBitcoinAPI {
    constructor(baseUrl = "https://mempool.space/api") {
      this.setBaseUrl(baseUrl);
    }

    setBaseUrl(baseUrl) {
      this.baseUrl = cleanBase(baseUrl);
      return this.baseUrl;
    }

    url(path) {
      return `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    }

    getTipHeight() {
      return fetchJson(this.url("/blocks/tip/height"));
    }

    getTipHash() {
      return fetchJson(this.url("/blocks/tip/hash"));
    }

    getTransaction(txid) {
      return fetchJson(this.url(`/tx/${encodeURIComponent(txid)}`));
    }

    getTransactionStatus(txid) {
      return fetchJson(this.url(`/tx/${encodeURIComponent(txid)}/status`));
    }

    getBlock(hash) {
      return fetchJson(this.url(`/block/${encodeURIComponent(hash)}`));
    }

    getBlockHashAtHeight(height) {
      return fetchJson(this.url(`/block-height/${encodeURIComponent(String(height))}`));
    }

    async getBlockByHeight(height) {
      const hash = await this.getBlockHashAtHeight(height);
      const block = await this.getBlock(String(hash).trim());
      return { hash: String(hash).trim(), block };
    }

    getAddress(address) {
      return fetchJson(this.url(`/address/${encodeURIComponent(address)}`));
    }

    getAddressUtxos(address) {
      return fetchJson(this.url(`/address/${encodeURIComponent(address)}/utxo`));
    }

    async getAddressBundle(address) {
      const [summary, utxos] = await Promise.all([
        this.getAddress(address),
        this.getAddressUtxos(address)
      ]);
      return { address, summary, utxos };
    }

    getMempool() {
      return fetchJson(this.url("/mempool"));
    }

    getRecommendedFees() {
      return fetchJson(this.url("/v1/fees/recommended"));
    }

    async getMempoolBundle() {
      const [mempool, fees] = await Promise.all([
        this.getMempool(),
        this.getRecommendedFees()
      ]);
      return { mempool, fees };
    }

    async test() {
      const [height, hash] = await Promise.all([
        this.getTipHeight(),
        this.getTipHash()
      ]);
      return { height: Number(height), hash: String(hash).trim(), baseUrl: this.baseUrl };
    }

    static async callRpcProxy(url, method, params = []) {
      const proxy = cleanBase(url);
      if (!method || typeof method !== "string") throw new Error("RPC method is required.");

      return fetchJson(proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `aipdabe-${Date.now()}`,
          method,
          params
        })
      });
    }
  }

  window.AIPDABEBitcoinAPI = AIPDABEBitcoinAPI;
})();

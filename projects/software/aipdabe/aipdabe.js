(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_PROVIDER = "zzx-aipdabe-provider-v1";

  const state = {
    api: null,
    providerBase: "https://mempool.space/api",
    rpcProxy: "",
    current: null,
    mempool: null,
    graph: null,
    assistantProvider: null,
    history: []
  };

  function loadProviderSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PROVIDER) || "{}");
      if (saved.esplora) state.providerBase = saved.esplora;
      if (saved.rpcProxy) state.rpcProxy = saved.rpcProxy;
    } catch {}
  }

  function saveProviderSettings() {
    localStorage.setItem(STORAGE_PROVIDER, JSON.stringify({
      esplora: state.providerBase,
      rpcProxy: state.rpcProxy
    }));
  }

  function setRuntime() {
    const fetchBadge = $("status-fetch");
    const hasFetch = typeof fetch === "function";
    fetchBadge.textContent = `FETCH: ${hasFetch ? "YES" : "NO"}`;
    fetchBadge.className = `runtime-badge ${hasFetch ? "ok" : "no"}`;
  }

  function formatJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function setCurrent(type, data, meta = {}) {
    state.current = {
      type,
      data,
      provider: state.providerBase,
      loadedAt: new Date().toISOString(),
      ...meta
    };

    $("result-type").textContent = type.toUpperCase();
    $("result-provider").textContent = state.providerBase;
    $("explorer-json").textContent = formatJson(data);
    $("explorer-summary").textContent = AIPDABEAnalyst.summarize(type, data);

    const id =
      data?.txid ||
      data?.id ||
      data?.hash ||
      data?.address ||
      data?.block?.id ||
      data?.block?.hash ||
      meta.primaryId ||
      "—";

    $("result-id").textContent = String(id);
    const confirmed =
      data?.status?.confirmed ??
      data?.summary?.chain_stats != null ??
      (data?.block?.height != null ? true : null);

    $("result-confirmed").textContent =
      confirmed === true ? "YES" :
      confirmed === false ? "NO" :
      "N/A";

    renderCurrentChips();

    if (type === "tx") {
      try {
        state.graph.setTransaction(data);
        renderFlowList();
      } catch {}
    }

    window.ZZXHooks?.emit("aipdabe:current", {
      type,
      id: String(id)
    });
  }

  function renderCurrentChips() {
    const root = $("explorer-chips");
    root.replaceChildren();

    const chips = [];
    if (!state.current) return;

    const { type, data } = state.current;

    if (type === "tx") {
      chips.push(["TX", "ok"]);
      chips.push([`${data.vin?.length || 0} INPUTS`, ""]);
      chips.push([`${data.vout?.length || 0} OUTPUTS`, ""]);
      if (data.status?.confirmed) chips.push(["CONFIRMED", "ok"]);
      else chips.push(["MEMPOOL / UNCONFIRMED", "warn"]);
      if (data.vout?.some((o) => o.scriptpubkey_type === "op_return")) {
        chips.push(["OP_RETURN", "warn"]);
      }
    } else if (type === "address") {
      chips.push(["ADDRESS", "ok"]);
      chips.push([`${data.utxos?.length || 0} UTXOS`, ""]);
    } else if (type.startsWith("block")) {
      chips.push(["BLOCK", "ok"]);
      const block = data.block || data;
      if (block.height != null) chips.push([`HEIGHT ${block.height}`, ""]);
    } else if (type === "tip") {
      chips.push(["CHAIN TIP", "ok"]);
    }

    for (const [text, cls] of chips) {
      const span = document.createElement("span");
      span.className = `aipdabe-chip ${cls}`.trim();
      span.textContent = text;
      root.appendChild(span);
    }
  }

  async function runExplorer() {
    const type = $("explorer-type").value;
    const query = $("explorer-query").value.trim();

    if (!query) throw new Error("Enter a query first.");

    $("explorer-json").textContent = "Loading…";
    $("explorer-summary").textContent = "Analyzing…";

    if (type === "tx") {
      const [tx, status] = await Promise.all([
        state.api.getTransaction(query),
        state.api.getTransactionStatus(query).catch(() => null)
      ]);
      if (status && !tx.status) tx.status = status;
      setCurrent("tx", tx, { primaryId: query });
      return;
    }

    if (type === "block-height") {
      if (!/^\d+$/.test(query)) throw new Error("Block height must be an integer.");
      const bundle = await state.api.getBlockByHeight(Number(query));
      setCurrent("block-height", bundle, { primaryId: bundle.hash });
      return;
    }

    if (type === "block-hash") {
      const block = await state.api.getBlock(query);
      setCurrent("block-hash", block, { primaryId: query });
      return;
    }

    if (type === "address") {
      const bundle = await state.api.getAddressBundle(query);
      setCurrent("address", bundle, { primaryId: query });
    }
  }

  async function loadTip() {
    const [height, hash] = await Promise.all([
      state.api.getTipHeight(),
      state.api.getTipHash()
    ]);
    setCurrent("tip", { height: Number(height), hash: String(hash).trim() }, { primaryId: hash });
  }

  function clearExplorer() {
    state.current = null;
    $("explorer-query").value = "";
    $("explorer-json").textContent = "No query loaded.";
    $("explorer-summary").textContent = "A structured summary will appear here.";
    $("result-type").textContent = "—";
    $("result-id").textContent = "—";
    $("result-confirmed").textContent = "—";
    $("result-provider").textContent = "—";
    $("explorer-chips").replaceChildren();
    state.graph.clear();
    renderFlowList();
  }

  async function refreshMempool() {
    $("mempool-json").textContent = "Loading…";
    const bundle = await state.api.getMempoolBundle();
    state.mempool = bundle;

    const m = bundle.mempool || {};
    const f = bundle.fees || {};

    $("mempool-count").textContent = Number(m.count || 0).toLocaleString();
    $("mempool-vsize").textContent = Number(m.vsize || 0).toLocaleString();
    $("mempool-fees").textContent = `${((Number(m.total_fee) || 0) / 1e8).toFixed(8)} BTC`;
    $("mempool-fastest").textContent = f.fastestFee != null ? `${f.fastestFee} sat/vB` : "—";
    $("mempool-halfhour").textContent = f.halfHourFee != null ? `${f.halfHourFee} sat/vB` : "—";
    $("mempool-hour").textContent = f.hourFee != null ? `${f.hourFee} sat/vB` : "—";
    $("mempool-economy").textContent = f.economyFee != null ? `${f.economyFee} sat/vB` : "—";
    $("mempool-minimum").textContent = f.minimumFee != null ? `${f.minimumFee} sat/vB` : "—";

    $("mempool-json").textContent = formatJson(bundle);
    $("mempool-summary").textContent = AIPDABEAnalyst.summarize("mempool", bundle);

    window.ZZXHooks?.emit("aipdabe:mempool", {
      count: m.count,
      vsize: m.vsize
    });
  }

  function currentTransaction() {
    return state.current?.type === "tx" ? state.current.data : null;
  }

  function renderFlowList() {
    const root = $("flow-list");
    root.replaceChildren();

    const graph = state.graph.export();
    if (!graph) {
      const row = document.createElement("div");
      row.className = "aipdabe-flow-row";
      row.innerHTML = "<code>No transaction graph loaded.</code><span>—</span>";
      root.appendChild(row);
      return;
    }

    for (const node of graph.nodes.filter((n) => n.kind !== "transaction")) {
      const row = document.createElement("div");
      row.className = "aipdabe-flow-row";

      const code = document.createElement("code");
      code.textContent = `${node.kind.toUpperCase()} ${node.index}: ${node.address || node.label}`;

      const value = document.createElement("span");
      value.textContent = `${(node.value / 1e8).toFixed(8)} BTC`;

      row.append(code, value);
      root.appendChild(row);
    }
  }

  function graphCurrent() {
    const tx = currentTransaction();
    if (!tx) throw new Error("Load a transaction in Explorer first.");
    state.graph.setTransaction(tx);
    renderFlowList();
  }

  function downloadJson(value, name) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportGraph() {
    const graph = state.graph.export();
    if (!graph) throw new Error("No graph is loaded.");
    downloadJson(graph, `aipdabe-utxo-flow-${Date.now()}.json`);
  }

  function addAnalystTurn(role, text) {
    const root = $("analyst-log");
    const turn = document.createElement("div");
    turn.className = `aipdabe-turn ${role}`;

    const roleEl = document.createElement("span");
    roleEl.className = "aipdabe-turn-role";
    roleEl.textContent = role === "assistant" ? "AIPDABE" : "YOU";

    const body = document.createElement("pre");
    body.className = "aipdabe-turn-text";
    body.textContent = text;

    turn.append(roleEl, body);
    root.appendChild(turn);
    root.scrollTop = root.scrollHeight;

    state.history.push({ role, text, at: new Date().toISOString() });
  }

  async function askAnalyst(question) {
    const q = String(question || "").trim();
    if (!q) return;

    addAnalystTurn("user", q);

    const context = state.current || (state.mempool ? { type: "mempool", data: state.mempool } : null);
    if (!context) {
      addAnalystTurn("assistant", "Load Bitcoin data first.");
      return;
    }

    let answer;
    if (typeof state.assistantProvider === "function") {
      answer = await state.assistantProvider({
        question: q,
        context: JSON.parse(JSON.stringify(context)),
        history: [...state.history]
      });
    } else {
      answer = AIPDABEAnalyst.answer(q, context);
    }

    addAnalystTurn("assistant", String(answer));
  }

  function summarizeCurrent() {
    const context = state.current || (state.mempool ? { type: "mempool", data: state.mempool } : null);
    if (!context) throw new Error("Load data first.");
    addAnalystTurn("assistant", AIPDABEAnalyst.summarize(context.type, context.data));
  }

  function clearAnalyst() {
    state.history = [];
    $("analyst-log").innerHTML = `
      <div class="aipdabe-turn assistant">
        <span class="aipdabe-turn-role">AIPDABE</span>
        <pre class="aipdabe-turn-text">Analyst history cleared.</pre>
      </div>`;
  }

  function applyProvider() {
    const base = $("provider-esplora").value.trim();
    state.api.setBaseUrl(base);
    state.providerBase = state.api.baseUrl;
    state.rpcProxy = $("provider-rpc-proxy").value.trim();
    saveProviderSettings();

    $("status-provider").textContent = "PROVIDER: CUSTOM";
    $("status-provider").className = "runtime-badge ok";

    $("provider-output").textContent = formatJson({
      esplora: state.providerBase,
      rpcProxy: state.rpcProxy || null,
      saved: true
    });
  }

  async function testProvider() {
    applyProvider();
    $("provider-output").textContent = "Testing provider…";
    const result = await state.api.test();
    $("provider-output").textContent = formatJson({
      ok: true,
      ...result
    });
  }

  async function callRpcInfo() {
    const url = $("provider-rpc-proxy").value.trim();
    if (!url) throw new Error("Enter a read-only RPC proxy URL.");

    $("provider-output").textContent = "Calling getblockchaininfo through proxy…";
    const result = await AIPDABEBitcoinAPI.callRpcProxy(url, "getblockchaininfo", []);
    $("provider-output").textContent = formatJson(result);
  }

  function inferImportedType(value) {
    if (value?.txid && Array.isArray(value.vin) && Array.isArray(value.vout)) return "tx";
    if (value?.block?.height != null || (value?.height != null && value?.tx_count != null)) return "block";
    if (value?.summary?.chain_stats || (value?.chain_stats && value?.address)) return "address";
    if (value?.mempool && value?.fees) return "mempool";
    if (value?.height != null && value?.hash) return "tip";
    return "imported";
  }

  function loadImported(value) {
    const type = inferImportedType(value);

    if (type === "mempool") {
      state.mempool = value;
      $("mempool-json").textContent = formatJson(value);
      $("mempool-summary").textContent = AIPDABEAnalyst.summarize("mempool", value);
    }

    setCurrent(type, value, { primaryId: "imported-json" });
    $("import-output").textContent = `Loaded imported JSON as type: ${type}`;
  }

  async function importFile(file) {
    const text = await file.text();
    loadImported(JSON.parse(text));
  }

  function exportCurrent() {
    if (!state.current) throw new Error("No current object to export.");
    downloadJson(state.current, `aipdabe-current-${Date.now()}.json`);
  }

  function exportWorkspace() {
    downloadJson({
      project: "AIPDABE",
      version: "0.1.0-alpha-web",
      exportedAt: new Date().toISOString(),
      provider: {
        esplora: state.providerBase,
        rpcProxyConfigured: Boolean(state.rpcProxy)
      },
      current: state.current,
      mempool: state.mempool,
      graph: state.graph.export(),
      analystHistory: state.history
    }, `aipdabe-workspace-${Date.now()}.json`);
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
          id.includes("provider") || id.includes("rpc") ? $("provider-output") :
          id.includes("import") ? $("import-output") :
          id.includes("mempool") ? $("mempool-json") :
          $("explorer-summary");

        if (target) target.textContent = `ERROR: ${error.message}`;
      }
    });
  }

  function bindEvents() {
    bind("explorer-run", "click", runExplorer);
    bind("explorer-tip", "click", loadTip);
    bind("explorer-clear", "click", clearExplorer);

    bind("explorer-query", "keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runExplorer().catch((error) => {
          $("explorer-summary").textContent = `ERROR: ${error.message}`;
        });
      }
    });

    bind("mempool-refresh", "click", refreshMempool);

    bind("flow-from-current", "click", graphCurrent);
    bind("flow-fit", "click", () => state.graph.fit());
    bind("flow-export", "click", exportGraph);

    bind("analyst-ask", "click", () => {
      const q = $("analyst-question").value;
      $("analyst-question").value = "";
      return askAnalyst(q);
    });
    bind("analyst-summary", "click", summarizeCurrent);
    bind("analyst-clear", "click", clearAnalyst);

    bind("provider-apply", "click", applyProvider);
    bind("provider-test", "click", testProvider);
    bind("rpc-getblockchaininfo", "click", callRpcInfo);

    bind("import-file", "change", async () => {
      const file = $("import-file").files?.[0];
      if (file) await importFile(file);
    });

    bind("import-paste", "click", () => {
      const text = $("import-json").value.trim();
      if (!text) throw new Error("Paste JSON first.");
      loadImported(JSON.parse(text));
    });

    bind("export-current", "click", exportCurrent);
    bind("export-workspace", "click", exportWorkspace);
  }

  function exposeApi() {
    window.AIPDABE = Object.freeze({
      version: "0.1.0-alpha-web",

      setEsploraBase(url) {
        state.api.setBaseUrl(url);
        state.providerBase = state.api.baseUrl;
        $("provider-esplora").value = state.providerBase;
        saveProviderSettings();
        return state.providerBase;
      },

      getTransaction: (txid) => state.api.getTransaction(txid),
      getBlock: (hash) => state.api.getBlock(hash),
      getBlockByHeight: (height) => state.api.getBlockByHeight(height),
      getAddress: (address) => state.api.getAddressBundle(address),
      getMempool: () => state.api.getMempoolBundle(),

      analyze(type, data) {
        return AIPDABEAnalyst.summarize(type, data);
      },

      ask(question) {
        const context = state.current || (state.mempool ? { type: "mempool", data: state.mempool } : null);
        return AIPDABEAnalyst.answer(question, context);
      },

      registerAssistantProvider(provider) {
        if (provider !== null && typeof provider !== "function") {
          throw new TypeError("Assistant provider must be a function or null.");
        }
        state.assistantProvider = provider;
      },

      graphTransaction(tx) {
        return state.graph.setTransaction(tx);
      },

      getState() {
        return {
          provider: state.providerBase,
          currentType: state.current?.type || null,
          hasMempool: Boolean(state.mempool),
          hasGraph: Boolean(state.graph.export()),
          assistantProvider: state.assistantProvider ? "custom" : "local"
        };
      }
    });
  }

  loadProviderSettings();
  setRuntime();

  state.api = new AIPDABEBitcoinAPI(state.providerBase);
  state.graph = new AIPDABEUTXOGraph($("aipdabe-graph"));

  $("provider-esplora").value = state.providerBase;
  $("provider-rpc-proxy").value = state.rpcProxy;

  bindEvents();
  renderFlowList();
  exposeApi();

  window.ZZXHooks?.emit("aipdabe:ready", {
    version: "0.1.0-alpha-web",
    provider: state.providerBase
  });
})();

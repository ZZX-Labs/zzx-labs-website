(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_PROGRESS = "zzx-alexberossusgpt-progress-v1";

  const state = {
    corpus: new AlexBerossusCorpus(),
    tutor: null,
    quizEngine: new AlexBerossusQuiz(),
    review: new AlexBerossusReview(),
    plan: null,
    questions: [],
    quizIndex: 0,
    quizResponses: [],
    cards: [],
    progress: {
      plansBuilt: 0,
      quizAttempts: 0,
      correctAnswers: 0,
      totalQuestions: 0,
      reviewEvents: 0
    },
    model: {
      kind: "local",
      name: "Local retrieval"
    }
  };

  state.tutor = new AlexBerossusTutor(state.corpus);

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PROGRESS) || "{}");
      state.progress = { ...state.progress, ...saved };
    } catch {}
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(state.progress));
  }

  function escText(value) {
    return String(value ?? "");
  }

  function downloadJson(value, filename) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function currentSubject() {
    return $("learn-subject").value.trim() || "the selected subject";
  }

  function rebuildCorpus() {
    const chunkSize = Number($("source-chunk-size").value) || 900;
    state.corpus.rebuild(chunkSize);
    renderSources();
    renderMetrics();
  }

  function renderMetrics() {
    const stats = state.corpus.stats();
    $("learn-docs").textContent = String(stats.documents);
    $("learn-chunks").textContent = String(stats.chunks);
    $("learn-cards").textContent = String(state.cards.length);
    $("learn-due").textContent = String(state.review.due().length);

    $("review-due").textContent = String(state.review.due().length);
    $("review-total").textContent = String(state.review.items.length);
    $("review-today").textContent = String(state.review.reviewedToday());

    $("progress-plans").textContent = String(state.progress.plansBuilt);
    $("progress-quizzes").textContent = String(state.progress.quizAttempts);
    $("progress-correct").textContent = String(state.progress.correctAnswers);
    $("progress-reviews").textContent = String(state.review.events.length);

    const accuracy = state.progress.totalQuestions
      ? state.progress.correctAnswers / state.progress.totalQuestions
      : 0;

    $("progress-bar").style.width = `${Math.round(accuracy * 100)}%`;
    $("progress-output").textContent = JSON.stringify({
      corpus: stats,
      flashcardsGenerated: state.cards.length,
      review: {
        scheduled: state.review.items.length,
        due: state.review.due().length,
        events: state.review.events.length,
        reviewedToday: state.review.reviewedToday()
      },
      progress: state.progress,
      quizAccuracy: `${(accuracy * 100).toFixed(1)}%`,
      modelProvider: state.model
    }, null, 2);
  }

  function renderSources() {
    const root = $("source-list");
    root.replaceChildren();

    if (!state.corpus.documents.length) {
      const item = document.createElement("div");
      item.className = "abg-source";
      item.innerHTML = "<p>No study sources loaded.</p>";
      root.appendChild(item);
      return;
    }

    for (const doc of state.corpus.documents) {
      const el = document.createElement("div");
      el.className = "abg-source";

      const head = document.createElement("div");
      head.className = "abg-source-head";

      const title = document.createElement("strong");
      title.textContent = doc.title;

      const meta = document.createElement("span");
      meta.textContent = `${doc.text.length.toLocaleString()} chars`;

      head.append(title, meta);

      const preview = document.createElement("p");
      preview.textContent = doc.text.slice(0, 260) + (doc.text.length > 260 ? "…" : "");

      const actions = document.createElement("div");
      actions.className = "abg-inline-actions";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "REMOVE";
      remove.addEventListener("click", () => {
        state.corpus.removeDocument(doc.id);
        rebuildCorpus();
      });

      actions.append(remove);
      el.append(head, preview, actions);
      root.appendChild(el);
    }
  }

  function renderPlan(plan) {
    const root = $("study-plan");
    root.replaceChildren();

    if (!plan) return;

    for (const unit of plan.units) {
      const el = document.createElement("article");
      el.className = "abg-plan-unit";

      const h = document.createElement("h3");
      h.textContent = `${String(unit.number).padStart(2, "0")} · ${unit.title}`;

      const p = document.createElement("p");
      p.textContent = unit.objective;

      const ul = document.createElement("ul");
      for (const activity of unit.activities) {
        const li = document.createElement("li");
        li.textContent = activity;
        ul.appendChild(li);
      }

      el.append(h, p, ul);
      root.appendChild(el);
    }
  }

  function buildPlan(useSources = true) {
    state.plan = state.tutor.buildPlan({
      subject: $("learn-subject").value,
      level: $("learn-level").value,
      depth: $("learn-depth").value,
      goal: $("learn-goal").value,
      units: $("learn-units").value,
      useSources
    });

    state.progress.plansBuilt += 1;
    saveProgress();
    renderPlan(state.plan);
    renderMetrics();
  }

  async function addSourceFiles(files) {
    for (const file of files) {
      const source = await AlexBerossusCorpus.readFile(file);
      state.corpus.addDocument(source);
    }
    rebuildCorpus();
  }

  function addPastedSource() {
    const text = $("source-text").value.trim();
    if (!text) throw new Error("Paste source material first.");

    state.corpus.addDocument({
      title: $("source-title").value.trim() || "Pasted study source",
      text,
      source: "manual"
    });

    $("source-text").value = "";
    $("source-title").value = "";
    rebuildCorpus();
  }

  function addChatTurn(role, text) {
    const root = $("tutor-chat");
    const turn = document.createElement("div");
    turn.className = `abg-turn ${role}`;

    const roleEl = document.createElement("span");
    roleEl.className = "abg-turn-role";
    roleEl.textContent = role === "assistant" ? "AlexBerossusGPT" : "YOU";

    const body = document.createElement("pre");
    body.className = "abg-turn-text";
    body.textContent = text;

    turn.append(roleEl, body);
    root.appendChild(turn);
    root.scrollTop = root.scrollHeight;
  }

  async function askTutor(question) {
    const q = String(question || "").trim();
    if (!q) return;

    addChatTurn("user", q);

    const result = await state.tutor.answer(q, {
      subject: currentSubject(),
      level: $("learn-level").value,
      goal: $("learn-goal").value
    });

    let text = result.answer;
    if (result.sources?.length) {
      text += "\n\nSources retrieved:\n" +
        result.sources.map((s, i) =>
          `[${i + 1}] ${s.documentTitle} · score ${s.score.toFixed(3)}`
        ).join("\n");
    }

    addChatTurn("assistant", text);
  }

  function clearTutor() {
    $("tutor-chat").innerHTML = `
      <div class="abg-turn assistant">
        <span class="abg-turn-role">AlexBerossusGPT</span>
        <pre class="abg-turn-text">Tutor history cleared.</pre>
      </div>`;
  }

  function renderQuiz() {
    const root = $("quiz-root");
    root.replaceChildren();

    if (!state.questions.length) {
      root.textContent = "";
      return;
    }

    if (state.quizIndex >= state.questions.length) {
      const correct = state.quizResponses.filter((r) => r.correct).length;
      const summary = document.createElement("div");
      summary.className = "abg-quiz-card";
      summary.innerHTML = `
        <span class="abg-question-number">COMPLETE</span>
        <p class="abg-question"></p>
        <div class="abg-feedback correct"></div>`;
      summary.querySelector(".abg-question").textContent =
        `Score: ${correct}/${state.questions.length} (${((correct/state.questions.length)*100).toFixed(1)}%)`;
      summary.querySelector(".abg-feedback").textContent =
        "Review incorrect items, then convert weak concepts into flashcards and spaced review.";
      root.appendChild(summary);
      return;
    }

    const q = state.questions[state.quizIndex];
    const card = document.createElement("div");
    card.className = "abg-quiz-card";

    const num = document.createElement("span");
    num.className = "abg-question-number";
    num.textContent = `QUESTION ${state.quizIndex + 1}/${state.questions.length}`;

    const question = document.createElement("pre");
    question.className = "abg-question";
    question.textContent = q.question;

    const label = document.createElement("label");
    label.textContent = "Your answer";

    const input = document.createElement("textarea");
    input.id = "quiz-answer";
    input.rows = 4;
    label.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.style.justifyContent = "flex-start";

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "btn";
    submit.textContent = "CHECK ANSWER";

    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "btn ghost";
    reveal.textContent = "REVEAL";

    const feedback = document.createElement("div");
    feedback.className = "abg-feedback";
    feedback.hidden = true;

    submit.addEventListener("click", () => {
      const result = state.quizEngine.grade(q, input.value);
      feedback.hidden = false;
      feedback.className = `abg-feedback ${result.correct ? "correct" : "partial"}`;
      feedback.textContent = result.feedback;

      state.quizResponses.push({
        questionId: q.id,
        response: input.value,
        ...result
      });

      state.progress.totalQuestions += 1;
      if (result.correct) state.progress.correctAnswers += 1;
      saveProgress();
      renderMetrics();

      submit.disabled = true;
      reveal.disabled = true;

      const next = document.createElement("button");
      next.type = "button";
      next.className = "btn ghost";
      next.textContent = "NEXT";
      next.addEventListener("click", () => {
        state.quizIndex += 1;
        renderQuiz();
      });
      actions.appendChild(next);
    });

    reveal.addEventListener("click", () => {
      feedback.hidden = false;
      feedback.className = "abg-feedback partial";
      feedback.textContent = `Answer: ${q.answer}\nSource: ${q.explanation}`;
    });

    actions.append(submit, reveal);
    card.append(num, question, label, actions, feedback);
    root.appendChild(card);
  }

  function generateQuiz() {
    state.questions = state.quizEngine.generate(
      state.corpus,
      $("quiz-count").value,
      $("quiz-mode").value
    );
    state.quizIndex = 0;
    state.quizResponses = [];
    state.progress.quizAttempts += 1;
    saveProgress();
    renderQuiz();
    renderMetrics();
  }

  function resetQuiz() {
    state.questions = [];
    state.quizIndex = 0;
    state.quizResponses = [];
    renderQuiz();
  }

  function renderCards() {
    const root = $("flashcard-list");
    root.replaceChildren();

    if (!state.cards.length) {
      const item = document.createElement("div");
      item.className = "abg-flashcard";
      item.innerHTML = "<p>No flashcards generated.</p>";
      root.appendChild(item);
      return;
    }

    for (const card of state.cards) {
      const el = document.createElement("div");
      el.className = "abg-flashcard";

      const head = document.createElement("div");
      head.className = "abg-card-head";

      const title = document.createElement("strong");
      title.textContent = card.front;

      const source = document.createElement("span");
      source.textContent = card.sourceTitle || "source";

      head.append(title, source);

      const back = document.createElement("p");
      back.textContent = card.back;

      const actions = document.createElement("div");
      actions.className = "abg-inline-actions";

      const review = document.createElement("button");
      review.type = "button";
      review.textContent = "ADD TO REVIEW";
      review.addEventListener("click", () => {
        state.review.addCard(card);
        renderReview();
        renderMetrics();
      });

      actions.append(review);
      el.append(head, back, actions);
      root.appendChild(el);
    }
  }

  function generateCards() {
    state.cards = state.quizEngine.flashcards(state.corpus, 32);
    renderCards();
    renderMetrics();
  }

  function addAllCards() {
    state.review.addCards(state.cards);
    renderReview();
    renderMetrics();
  }

  function renderReview() {
    const root = $("review-list");
    root.replaceChildren();

    const due = state.review.due();

    if (!due.length) {
      const item = document.createElement("div");
      item.className = "abg-review-item";
      item.innerHTML = "<p>No cards are due right now.</p>";
      root.appendChild(item);
      renderMetrics();
      return;
    }

    for (const item of due) {
      const el = document.createElement("div");
      el.className = "abg-review-item";

      const head = document.createElement("div");
      head.className = "abg-review-head";

      const front = document.createElement("strong");
      front.textContent = item.front;

      const dueAt = document.createElement("span");
      dueAt.textContent = `due ${new Date(item.dueAt).toLocaleString()}`;

      head.append(front, dueAt);

      const back = document.createElement("p");
      back.textContent = item.back;

      const actions = document.createElement("div");
      actions.className = "abg-inline-actions";

      for (let q = 0; q <= 5; q++) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(q);
        button.title = `Recall quality ${q}/5`;
        button.addEventListener("click", () => {
          state.review.grade(item.id, q);
          state.progress.reviewEvents += 1;
          saveProgress();
          renderReview();
          renderMetrics();
        });
        actions.appendChild(button);
      }

      el.append(head, back, actions);
      root.appendChild(el);
    }

    renderMetrics();
  }

  function workspaceExport() {
    return {
      schema: "zzx.alexberossusgpt.workspace.v1",
      exportedAt: new Date().toISOString(),
      subject: {
        name: $("learn-subject").value,
        level: $("learn-level").value,
        depth: $("learn-depth").value,
        goal: $("learn-goal").value,
        units: Number($("learn-units").value)
      },
      plan: state.plan,
      corpus: state.corpus.export(),
      cards: state.cards,
      review: state.review.export(),
      progress: state.progress
    };
  }

  async function importWorkspace(file) {
    const value = JSON.parse(await file.text());
    if (value.schema !== "zzx.alexberossusgpt.workspace.v1") {
      throw new Error("Unsupported workspace schema.");
    }

    if (value.subject) {
      $("learn-subject").value = value.subject.name || "";
      $("learn-level").value = value.subject.level || "beginner";
      $("learn-depth").value = value.subject.depth || "standard";
      $("learn-goal").value = value.subject.goal || "";
      $("learn-units").value = String(value.subject.units || 8);
    }

    if (value.corpus) state.corpus.import(value.corpus);
    state.plan = value.plan || null;
    state.cards = Array.isArray(value.cards) ? value.cards : [];
    if (value.review) state.review.import(value.review);
    state.progress = { ...state.progress, ...(value.progress || {}) };

    saveProgress();
    renderPlan(state.plan);
    renderSources();
    renderCards();
    renderReview();
    renderMetrics();
  }

  function resetProgress() {
    state.progress = {
      plansBuilt: 0,
      quizAttempts: 0,
      correctAnswers: 0,
      totalQuestions: 0,
      reviewEvents: 0
    };
    saveProgress();
    renderMetrics();
  }

  async function ollamaRequest({ question, subject, level, goal, retrieved }) {
    const base = $("ollama-base").value.trim().replace(/\/+$/, "");
    const model = $("ollama-model").value.trim();
    if (!base || !model) throw new Error("Ollama base URL and model are required.");

    const context = retrieved.length
      ? retrieved.map((r, i) => `[${i+1}] ${r.title}\n${r.text}`).join("\n\n")
      : "(no local source passages retrieved)";

    const prompt =
      `You are AlexBerossusGPT, a teaching assistant.\n` +
      `Subject: ${subject}\nLevel: ${level}\nGoal: ${goal || "(not specified)"}\n\n` +
      `Use the supplied study context when relevant. Clearly distinguish what comes from it.\n\n` +
      `Study context:\n${context}\n\nQuestion:\n${question}`;

    const response = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false })
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return data.response || JSON.stringify(data);
  }

  async function proxyRequest({ question, subject, level, goal, retrieved }) {
    const url = $("proxy-url").value.trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter a valid proxy URL.");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        subject,
        level,
        goal,
        context: retrieved
      })
    });

    if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
    const data = await response.json();
    return data.answer || data.response || data.text || JSON.stringify(data);
  }

  async function testOllama() {
    const base = $("ollama-base").value.trim().replace(/\/+$/, "");
    const response = await fetch(`${base}/api/tags`);
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    $("model-output").textContent = JSON.stringify({
      ok: true,
      models: data.models?.map((m) => m.name) || []
    }, null, 2);
  }

  function setModel(kind) {
    if (kind === "ollama") {
      state.tutor.setProvider(ollamaRequest, "ollama");
      state.model = { kind: "ollama", name: $("ollama-model").value.trim() || "ollama" };
      $("status-model").textContent = "MODEL: OLLAMA";
      $("status-model").className = "runtime-badge ok";
    } else if (kind === "proxy") {
      state.tutor.setProvider(proxyRequest, "proxy");
      state.model = { kind: "proxy", name: "server proxy" };
      $("status-model").textContent = "MODEL: PROXY";
      $("status-model").className = "runtime-badge ok";
    } else {
      state.tutor.setProvider(null);
      state.model = { kind: "local", name: "Local retrieval" };
      $("status-model").textContent = "MODEL: LOCAL";
      $("status-model").className = "runtime-badge partial";
    }

    $("model-output").textContent = JSON.stringify(state.model, null, 2);
    renderMetrics();
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
          id.includes("model") || id.includes("ollama") || id.includes("proxy")
            ? $("model-output")
            : id.includes("progress") || id.includes("workspace")
              ? $("progress-output")
              : null;

        if (target) target.textContent = `ERROR: ${error.message}`;
        else alert(error.message);
      }
    });
  }

  function bindEvents() {
    bind("build-plan", "click", () => buildPlan(false));
    bind("plan-from-sources", "click", () => buildPlan(true));
    bind("clear-plan", "click", () => {
      state.plan = null;
      renderPlan(null);
    });

    bind("source-files", "change", async () => {
      const files = [...($("source-files").files || [])];
      if (files.length) await addSourceFiles(files);
      $("source-files").value = "";
    });

    bind("add-source-text", "click", addPastedSource);
    bind("export-corpus", "click", () =>
      downloadJson(state.corpus.export(), `alexberossusgpt-corpus-${Date.now()}.json`)
    );
    bind("clear-corpus", "click", () => {
      state.corpus.clear();
      renderSources();
      renderMetrics();
    });

    bind("tutor-ask", "click", async () => {
      const q = $("tutor-question").value.trim();
      $("tutor-question").value = "";
      await askTutor(q);
    });

    bind("tutor-explain", "click", () =>
      askTutor(`Explain the essential structure of ${currentSubject()} at my current level.`)
    );

    bind("tutor-socratic", "click", () =>
      addChatTurn("assistant", state.tutor.socraticPrompt(currentSubject()))
    );

    bind("tutor-clear", "click", clearTutor);

    bind("generate-quiz", "click", generateQuiz);
    bind("reset-quiz", "click", resetQuiz);

    bind("generate-cards", "click", generateCards);
    bind("cards-to-review", "click", addAllCards);
    bind("clear-cards", "click", () => {
      state.cards = [];
      renderCards();
      renderMetrics();
    });

    bind("export-workspace", "click", () =>
      downloadJson(workspaceExport(), `alexberossusgpt-workspace-${Date.now()}.json`)
    );

    bind("import-workspace", "change", async () => {
      const file = $("import-workspace").files?.[0];
      if (file) await importWorkspace(file);
      $("import-workspace").value = "";
    });

    bind("reset-progress", "click", resetProgress);

    bind("ollama-test", "click", testOllama);
    bind("ollama-use", "click", () => setModel("ollama"));
    bind("proxy-use", "click", () => setModel("proxy"));
    bind("model-local", "click", () => setModel("local"));
  }

  function exposeApi() {
    window.AlexBerossusGPT = Object.freeze({
      version: "0.1.0-alpha-web",

      addSource(title, text) {
        const doc = state.corpus.addDocument({ title, text, source: "api" });
        rebuildCorpus();
        return doc.id;
      },

      search(query, limit = 6) {
        return state.corpus.search(query, limit);
      },

      buildPlan(options) {
        return state.tutor.buildPlan(options);
      },

      ask(question) {
        return state.tutor.answer(question, {
          subject: currentSubject(),
          level: $("learn-level").value,
          goal: $("learn-goal").value
        });
      },

      generateQuiz(count = 10, mode = "mixed") {
        return state.quizEngine.generate(state.corpus, count, mode);
      },

      generateFlashcards(limit = 24) {
        return state.quizEngine.flashcards(state.corpus, limit);
      },

      addReviewCards(cards) {
        return state.review.addCards(cards);
      },

      getDueReviews() {
        return state.review.due();
      },

      setTutorProvider(provider, name = "custom") {
        state.tutor.setProvider(provider, name);
      },

      exportWorkspace: workspaceExport,

      getState() {
        return {
          corpus: state.corpus.stats(),
          cards: state.cards.length,
          reviewScheduled: state.review.items.length,
          reviewDue: state.review.due().length,
          progress: { ...state.progress },
          model: { ...state.model }
        };
      }
    });
  }

  loadProgress();
  bindEvents();
  renderSources();
  renderCards();
  renderReview();
  renderMetrics();
  exposeApi();

  window.ZZXHooks?.emit("alexberossusgpt:ready", {
    version: "0.1.0-alpha-web"
  });
})();

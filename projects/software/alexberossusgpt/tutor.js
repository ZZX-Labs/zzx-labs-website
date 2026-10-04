(() => {
  "use strict";

  function titleCase(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function truncate(text, n = 450) {
    const value = String(text || "").trim();
    return value.length > n ? `${value.slice(0, n).trim()}…` : value;
  }

  const UNIT_TEMPLATES = [
    ["Foundations", "Define the field, core vocabulary, scope, and the questions the subject tries to answer."],
    ["Core Concepts", "Identify the central ideas and relationships that everything else depends on."],
    ["Methods", "Learn the main methods, procedures, evidence standards, or problem-solving techniques."],
    ["Worked Examples", "Study representative examples and explain each step or inference."],
    ["Connections", "Relate the subject to adjacent concepts, disciplines, historical context, or applications."],
    ["Common Errors", "Identify misconceptions, failure modes, confusing distinctions, and how to correct them."],
    ["Practice", "Use active recall, exercises, comparison, explanation, and retrieval without notes."],
    ["Synthesis", "Integrate the material into a coherent mental model and explain it in your own words."],
    ["Advanced Structure", "Explore deeper models, edge cases, competing frameworks, and specialist vocabulary."],
    ["Review", "Revisit weak areas using spaced repetition and cumulative retrieval."],
    ["Assessment", "Test transfer: solve unfamiliar problems or explain the subject to another person."],
    ["Next Directions", "Identify what to study next and how to deepen mastery."]
  ];

  class AlexBerossusTutor {
    constructor(corpus) {
      this.corpus = corpus;
      this.provider = null;
      this.providerName = "local";
    }

    setProvider(provider, name = "custom") {
      if (provider !== null && typeof provider !== "function") {
        throw new TypeError("Provider must be a function or null.");
      }
      this.provider = provider;
      this.providerName = provider ? name : "local";
    }

    buildPlan({ subject, level = "beginner", depth = "standard", goal = "", units = 8, useSources = true }) {
      const cleanSubject = titleCase(subject || "Selected Subject");
      const n = Math.max(3, Math.min(24, Number(units) || 8));
      const relevant = useSources && this.corpus.chunks.length
        ? this.corpus.search(cleanSubject + " " + goal, Math.min(n, 10))
        : [];

      const sourceTopics = relevant.map((result) => {
        const firstSentence = result.text.match(/[^.!?]+[.!?]/)?.[0] || result.text;
        return {
          title: result.documentTitle,
          summary: truncate(firstSentence, 180),
          source: result.documentTitle
        };
      });

      const plan = [];

      for (let i = 0; i < n; i++) {
        const template = UNIT_TEMPLATES[i % UNIT_TEMPLATES.length];
        const source = sourceTopics[i % Math.max(1, sourceTopics.length)];

        plan.push({
          number: i + 1,
          title: source && i > 0
            ? `${template[0]} — ${truncate(source.title, 55)}`
            : `${template[0]} of ${cleanSubject}`,
          objective: source && i > 0
            ? `${template[1]} Use the indexed source "${source.title}" as one reference point.`
            : template[1],
          activities: [
            `Explain the unit aloud at a ${level} level without reading.`,
            depth === "exam"
              ? "Answer timed recall questions and record any uncertain points."
              : "Write 3–5 retrieval questions before reviewing notes.",
            source
              ? `Review the relevant passage from "${source.title}".`
              : "Add a source or example that anchors the unit in evidence."
          ]
        });
      }

      return {
        subject: cleanSubject,
        level,
        depth,
        goal: String(goal || "").trim(),
        units: plan,
        sourceGrounded: Boolean(sourceTopics.length),
        createdAt: new Date().toISOString()
      };
    }

    retrieve(question, limit = 5) {
      return this.corpus.search(question, limit);
    }

    localAnswer(question, options = {}) {
      const hits = this.retrieve(question, options.limit || 5);

      if (!hits.length) {
        return {
          answer:
            "I do not have enough source material in the local corpus to answer that question reliably.\n\n" +
            "Add relevant notes/documents, or connect an optional model provider for broader instruction.",
          sources: []
        };
      }

      const excerpts = hits.map((hit, index) =>
        `[${index + 1}] ${hit.documentTitle}\n${truncate(hit.text, 720)}`
      );

      return {
        answer:
          `Based on the indexed study sources, the most relevant material is:\n\n` +
          excerpts.join("\n\n") +
          `\n\nStudy move: compare these passages, state the answer in your own words, then test yourself without looking.`,
        sources: hits
      };
    }

    async answer(question, context = {}) {
      const local = this.localAnswer(question);

      if (!this.provider) return local;

      const response = await this.provider({
        question,
        subject: context.subject || "",
        level: context.level || "",
        goal: context.goal || "",
        retrieved: local.sources.map((hit) => ({
          title: hit.documentTitle,
          text: hit.text,
          score: hit.score
        }))
      });

      return {
        answer: String(response),
        sources: local.sources,
        provider: this.providerName
      };
    }

    socraticPrompt(subject = "the subject") {
      const prompts = [
        `What do you currently believe is the central idea in ${subject}, and what evidence would change your mind?`,
        `Which part of ${subject} can you explain without notes, and where does your explanation become vague?`,
        `What is one concept in ${subject} that looks similar to another concept but is importantly different?`,
        `If you had to teach ${subject} in five minutes, what would you include first and why?`,
        `What example would prove that you understand ${subject} rather than merely recognize its vocabulary?`
      ];

      return prompts[Math.floor(Math.random() * prompts.length)];
    }
  }

  window.AlexBerossusTutor = AlexBerossusTutor;
})();

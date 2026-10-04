(() => {
  "use strict";

  const COMMON = new Set(
    "about after again also because before between could every first from have into more most other over should some such than that their there these they this those through under very were what when where which while with would".split(" ")
  );

  function tokenize(text) {
    return window.AlexBerossusText.tokenize(text);
  }

  function sentences(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter((s) => s.length > 35) || [];
  }

  function keywords(sentence) {
    const tokens = tokenize(sentence)
      .filter((t) => t.length >= 5 && !COMMON.has(t) && !/^\d+$/.test(t));

    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map(([token]) => token);
  }

  function replaceWordPreservingCase(sentence, word) {
    const rx = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return sentence.replace(rx, "_____");
  }

  function similarity(a, b) {
    const A = new Set(tokenize(a));
    const B = new Set(tokenize(b));
    if (!A.size || !B.size) return 0;

    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / Math.max(A.size, B.size);
  }

  function generateCloze(chunk, id) {
    const candidates = sentences(chunk.text);
    for (const sentence of candidates) {
      const keys = keywords(sentence);
      if (!keys.length) continue;
      const answer = keys[0];
      const prompt = replaceWordPreservingCase(sentence, answer);
      if (prompt === sentence) continue;

      return {
        id,
        type: "cloze",
        question: `Fill the missing term:\n${prompt}`,
        answer,
        explanation: sentence,
        sourceTitle: chunk.documentTitle,
        sourceChunkId: chunk.chunkId || chunk.id
      };
    }
    return null;
  }

  function generateShort(chunk, id) {
    const candidates = sentences(chunk.text);
    for (const sentence of candidates) {
      const match = sentence.match(/^(.{2,80}?)\s+(?:is|are|refers to|means|describes)\s+(.{12,220})[.!?]$/i);
      if (match) {
        return {
          id,
          type: "short",
          question: `What is ${match[1].trim()}?`,
          answer: match[2].trim(),
          explanation: sentence,
          sourceTitle: chunk.documentTitle,
          sourceChunkId: chunk.chunkId || chunk.id
        };
      }
    }

    const sentence = candidates[0];
    if (!sentence) return null;
    return {
      id,
      type: "short",
      question: `Explain this idea from "${chunk.documentTitle}" in your own words:\n${sentence}`,
      answer: sentence,
      explanation: sentence,
      sourceTitle: chunk.documentTitle,
      sourceChunkId: chunk.chunkId || chunk.id
    };
  }

  class AlexBerossusQuiz {
    generate(corpus, count = 10, mode = "mixed") {
      if (!corpus.chunks.length) throw new Error("Add study sources before generating a quiz.");

      const target = Math.max(3, Math.min(30, Number(count) || 10));
      const pool = [...corpus.chunks].sort(() => Math.random() - .5);
      const questions = [];
      let cursor = 0;
      let guard = 0;

      while (questions.length < target && guard < pool.length * 4) {
        guard++;
        const chunk = pool[cursor % pool.length];
        cursor++;

        const type = mode === "mixed"
          ? (questions.length % 2 ? "short" : "cloze")
          : mode;

        const question = type === "short"
          ? generateShort(chunk, `q-${questions.length + 1}`)
          : generateCloze(chunk, `q-${questions.length + 1}`);

        if (question) questions.push(question);
      }

      return questions;
    }

    grade(question, response) {
      const answer = String(response || "").trim();
      if (!answer) return { score: 0, correct: false, feedback: "No answer entered." };

      if (question.type === "cloze") {
        const expected = String(question.answer || "").toLowerCase();
        const actual = answer.toLowerCase();
        const correct = actual === expected || actual.includes(expected);
        return {
          score: correct ? 1 : 0,
          correct,
          feedback: correct
            ? `Correct. Source wording: ${question.explanation}`
            : `Expected term: ${question.answer}\nSource wording: ${question.explanation}`
        };
      }

      const score = similarity(answer, question.answer);
      const correct = score >= .42;
      return {
        score,
        correct,
        feedback:
          `${correct ? "Good overlap with the source answer." : "Your answer differs substantially from the source wording."}\n` +
          `Source answer: ${question.answer}`
      };
    }

    flashcards(corpus, limit = 24) {
      if (!corpus.chunks.length) return [];

      const cards = [];
      let id = 0;

      for (const chunk of corpus.chunks) {
        for (const sentence of sentences(chunk.text)) {
          if (cards.length >= limit) return cards;

          const def = sentence.match(/^(.{2,80}?)\s+(?:is|are|refers to|means|describes)\s+(.{12,240})[.!?]$/i);
          if (def) {
            cards.push({
              id: `card-${++id}`,
              front: def[1].trim(),
              back: def[2].trim(),
              sourceTitle: chunk.documentTitle
            });
            continue;
          }

          const keys = keywords(sentence);
          if (keys.length && sentence.length < 260) {
            cards.push({
              id: `card-${++id}`,
              front: `Explain: ${keys[0]}`,
              back: sentence,
              sourceTitle: chunk.documentTitle
            });
          }
        }
      }

      return cards.slice(0, limit);
    }
  }

  window.AlexBerossusQuiz = AlexBerossusQuiz;
})();

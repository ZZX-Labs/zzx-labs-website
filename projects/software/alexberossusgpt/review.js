(() => {
  "use strict";

  const STORAGE = "zzx-alexberossusgpt-review-v1";

  function nowIso() {
    return new Date().toISOString();
  }

  function dueIso(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  class AlexBerossusReview {
    constructor() {
      this.items = [];
      this.events = [];
      this.load();
    }

    load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE) || "{}");
        this.items = Array.isArray(parsed.items) ? parsed.items : [];
        this.events = Array.isArray(parsed.events) ? parsed.events : [];
      } catch {
        this.items = [];
        this.events = [];
      }
    }

    save() {
      localStorage.setItem(STORAGE, JSON.stringify({
        items: this.items,
        events: this.events
      }));
    }

    addCard(card) {
      if (!card?.front || !card?.back) return null;

      const existing = this.items.find((item) =>
        item.front === card.front && item.back === card.back
      );
      if (existing) return existing;

      const item = {
        id: card.id || (crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}-${Math.random()}`),
        front: String(card.front),
        back: String(card.back),
        sourceTitle: card.sourceTitle || null,
        repetitions: 0,
        intervalDays: 0,
        ease: 2.5,
        dueAt: nowIso(),
        lastReviewedAt: null
      };

      this.items.push(item);
      this.save();
      return item;
    }

    addCards(cards) {
      return (cards || []).map((card) => this.addCard(card)).filter(Boolean);
    }

    grade(id, quality) {
      const item = this.items.find((x) => x.id === id);
      if (!item) throw new Error("Review card not found.");

      const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));

      if (q < 3) {
        item.repetitions = 0;
        item.intervalDays = 1;
      } else {
        if (item.repetitions === 0) item.intervalDays = 1;
        else if (item.repetitions === 1) item.intervalDays = 6;
        else item.intervalDays = Math.max(1, Math.round(item.intervalDays * item.ease));

        item.repetitions += 1;
      }

      item.ease = Math.max(
        1.3,
        item.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      );

      item.lastReviewedAt = nowIso();
      item.dueAt = dueIso(item.intervalDays);

      this.events.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `e-${Date.now()}-${Math.random()}`,
        cardId: item.id,
        quality: q,
        reviewedAt: item.lastReviewedAt,
        intervalDays: item.intervalDays,
        ease: item.ease
      });

      this.save();
      return item;
    }

    due(now = new Date()) {
      const t = now.getTime();
      return this.items
        .filter((item) => new Date(item.dueAt).getTime() <= t)
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    }

    reviewedToday() {
      const day = new Date().toISOString().slice(0, 10);
      return this.events.filter((event) => String(event.reviewedAt).slice(0, 10) === day).length;
    }

    clear() {
      this.items = [];
      this.events = [];
      this.save();
    }

    export() {
      return {
        schema: "zzx.alexberossusgpt.review.v1",
        items: this.items,
        events: this.events
      };
    }

    import(value) {
      if (!value || !Array.isArray(value.items)) throw new Error("Invalid review data.");
      this.items = value.items;
      this.events = Array.isArray(value.events) ? value.events : [];
      this.save();
    }
  }

  window.AlexBerossusReview = AlexBerossusReview;
})();

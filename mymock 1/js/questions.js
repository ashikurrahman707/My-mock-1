// ============================================================
// My-Mock — question bank + mock test generation
// ============================================================

const Questions = {
  _cache: null,

  async loadAll() {
    if (this._cache) return this._cache;
    const res = await fetch("data/questions.json");
    this._cache = await res.json();
    return this._cache;
  },

  async getPart(part) {
    const all = await this.loadAll();
    return all[`part${part}`];
  },

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },

  // Builds a fixed 10-question mock test: 5x Part1 + 1x Part2 + 4x Part3
  // (Part3 matched to the chosen Part2 cue card's topic where possible).
  async generateMockTest(userId) {
    const all = await this.loadAll();

    const part1Pool = this.shuffle(all.part1).slice(0, 5);
    const part2Card = this.shuffle(all.part2)[0];

    let part3Pool = all.part3.filter((q) => q.topic === part2Card.topic);
    if (part3Pool.length < 4) {
      // Not enough topic-matched questions — fall back to General/mixed
      // rather than failing the mock test, per spec.
      const extra = all.part3.filter((q) => q.topic !== part2Card.topic);
      part3Pool = [...part3Pool, ...this.shuffle(extra)];
    }
    const part3Questions = this.shuffle(part3Pool).slice(0, 4);

    const questionSequence = [
      ...part1Pool.map((q) => ({ ...q, part: 1 })),
      { ...part2Card, part: 2 },
      ...part3Questions.map((q) => ({ ...q, part: 3 })),
    ];

    const session = {
      id: crypto.randomUUID(),
      userId,
      type: "mock_test",
      status: "in_progress",
      currentIndex: 0,
      questions: questionSequence,
      answers: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    window.MyMock.PracticeStore.saveSession(session);
    return session;
  },

  async getOrResumeMockTest(userId) {
    const sessions = window.MyMock.PracticeStore.getSessionsForUser(userId);
    const active = sessions.find((s) => s.type === "mock_test" && s.status === "in_progress");
    return active || null;
  },
};

window.MyMock = window.MyMock || {};
window.MyMock.Questions = Questions;

import { describe, it, expect } from "vitest";
import {
  buildTasteProfile,
  describeTasteProfile,
} from "../../src/engine/taste.js";
import { makeEntry } from "../fixtures.js";

describe("buildTasteProfile", () => {
  it("returns empty profile when fewer than 5 scored entries", () => {
    const entries = [makeEntry({ score: 8 }), makeEntry({ score: 7 })];
    const profile = buildTasteProfile(entries);

    expect(profile.genres).toEqual([]);
    expect(profile.tags).toEqual([]);
    expect(profile.totalCompleted).toBe(2);
  });

  it("ignores unscored entries (score 0)", () => {
    // 4 scored + 2 unscored = only 4 usable, below minimum
    const entries = [
      makeEntry({ score: 9, id: 1 }),
      makeEntry({ score: 8, id: 2 }),
      makeEntry({ score: 7, id: 3 }),
      makeEntry({ score: 6, id: 4 }),
      makeEntry({ score: 0, id: 5 }),
      makeEntry({ score: 0, id: 6 }),
    ];
    const profile = buildTasteProfile(entries);

    expect(profile.genres).toEqual([]);
    expect(profile.totalCompleted).toBe(6);
  });

  it("weights genres by score - higher-scored genres rank first", () => {
    const entries = [
      makeEntry({ score: 10, genres: ["Action", "Thriller"], id: 1 }),
      makeEntry({ score: 10, genres: ["Action", "Thriller"], id: 2 }),
      makeEntry({ score: 5, genres: ["Comedy"], id: 3 }),
      makeEntry({ score: 5, genres: ["Comedy"], id: 4 }),
      makeEntry({ score: 5, genres: ["Comedy"], id: 5 }),
    ];
    const profile = buildTasteProfile(entries);

    // Action: 2 entries at 10/10 = weight 2.0
    // Comedy: 3 entries at 5/10 = weight 1.5
    const action = profile.genres.find((g) => g.name === "Action");
    const comedy = profile.genres.find((g) => g.name === "Comedy");
    if (!action || !comedy) throw new Error("Expected Action and Comedy in genres");

    expect(action.weight).toBeGreaterThan(comedy.weight);
    expect(profile.genres[0].name).toBe("Action");
  });

  it("skips spoiler tags in tag weights", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        score: 9,
        id: i + 1,
        tags: [
          { name: "Time Travel", rank: 90, isMediaSpoiler: false },
          { name: "Plot Twist", rank: 70, isMediaSpoiler: true },
        ],
      }),
    );
    const profile = buildTasteProfile(entries);
    const tagNames = profile.tags.map((t) => t.name);

    expect(tagNames).toContain("Time Travel");
    expect(tagNames).not.toContain("Plot Twist");
  });

  it("weights tags by score * relevance", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        score: 9,
        id: i + 1,
        tags: [
          { name: "Time Travel", rank: 90, isMediaSpoiler: false },
          { name: "Male Protagonist", rank: 50, isMediaSpoiler: false },
        ],
      }),
    );
    const profile = buildTasteProfile(entries);

    const tt = profile.tags.find((t) => t.name === "Time Travel");
    const mp = profile.tags.find((t) => t.name === "Male Protagonist");
    if (!tt || !mp) throw new Error("Expected Time Travel and Male Protagonist in tags");

    expect(tt.weight).toBeGreaterThan(mp.weight);
  });

  it("classifies high scorers (mean >= 7.5)", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ score: 9, id: i + 1 }),
    );
    const profile = buildTasteProfile(entries);

    expect(profile.scoring.tendency).toBe("high");
    expect(profile.scoring.meanScore).toBe(9);
  });

  it("classifies low scorers (mean <= 6.5)", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ score: 5, id: i + 1 }),
    );
    const profile = buildTasteProfile(entries);

    expect(profile.scoring.tendency).toBe("low");
  });

  it("classifies average scorers", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ score: 7, id: i + 1 }),
    );
    const profile = buildTasteProfile(entries);

    expect(profile.scoring.tendency).toBe("balanced");
  });

  it("uses UNKNOWN for null format in breakdown", () => {
    const entries = Array.from({ length: 5 }, (_, i) => {
      const e = makeEntry({ id: i + 1, score: 8 });
      e.media.format = null;
      return e;
    });
    const profile = buildTasteProfile(entries);

    const unknown = profile.formats.find((f) => f.format === "UNKNOWN");
    expect(unknown).toBeDefined();
    expect(unknown?.percent).toBe(100);
  });

  it("computes format breakdown as percentages", () => {
    const entries = [
      makeEntry({ format: "TV", id: 1, score: 8 }),
      makeEntry({ format: "TV", id: 2, score: 8 }),
      makeEntry({ format: "TV", id: 3, score: 8 }),
      makeEntry({ format: "MOVIE", id: 4, score: 8 }),
      makeEntry({ format: "MOVIE", id: 5, score: 7 }),
    ];
    const profile = buildTasteProfile(entries);

    const tv = profile.formats.find((f) => f.format === "TV");
    const movie = profile.formats.find((f) => f.format === "MOVIE");

    expect(tv?.percent).toBe(60);
    expect(movie?.percent).toBe(40);
  });

  it("weighs recent completions more heavily than old ones", () => {
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    const recent = makeEntry({
      score: 8,
      genres: ["Action"],
      id: 1,
      completedAt: { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
      updatedAt: Math.floor(now.getTime() / 1000),
    });
    const old = makeEntry({
      score: 8,
      genres: ["Comedy"],
      id: 2,
      completedAt: { year: fiveYearsAgo.getFullYear(), month: 1, day: 1 },
      updatedAt: Math.floor(fiveYearsAgo.getTime() / 1000),
    });
    const filler = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ score: 7, genres: ["Drama"], id: i + 10 }),
    );
    const profile = buildTasteProfile([recent, old, ...filler]);

    const action = profile.genres.find((g) => g.name === "Action");
    const comedy = profile.genres.find((g) => g.name === "Comedy");
    if (!action || !comedy) throw new Error("Expected Action and Comedy");

    expect(action.weight).toBeGreaterThan(comedy.weight);
  });

  it("falls back to updatedAt when completedAt has no year", () => {
    const noCompletion = makeEntry({
      score: 9,
      genres: ["Fantasy"],
      id: 1,
      completedAt: { year: null, month: null, day: null },
      updatedAt: Math.floor(Date.now() / 1000) - 86400, // yesterday - minimal decay
    });
    const filler = Array.from({ length: 4 }, (_, i) =>
      makeEntry({ score: 7, genres: ["Drama"], id: i + 10 }),
    );
    const profile = buildTasteProfile([noCompletion, ...filler]);

    const fantasy = profile.genres.find((g) => g.name === "Fantasy");
    if (!fantasy) throw new Error("Expected Fantasy in genres");
    expect(fantasy.weight).toBeGreaterThan(0.5);
  });

  it("Bayesian smoothing prevents single high-score entries from dominating", () => {
    // Use current date so decay doesn't interfere with this test
    const d = new Date();
    const recent = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    const now = Math.floor(d.getTime() / 1000);
    const entries = [
      makeEntry({ score: 10, genres: ["Niche"], id: 1, completedAt: recent, updatedAt: now }),
      ...Array.from({ length: 6 }, (_, i) =>
        makeEntry({ score: 8, genres: ["Mainstream"], id: i + 10, completedAt: recent, updatedAt: now }),
      ),
    ];
    const profile = buildTasteProfile(entries);

    const niche = profile.genres.find((g) => g.name === "Niche");
    const mainstream = profile.genres.find((g) => g.name === "Mainstream");
    if (!niche || !mainstream) throw new Error("Expected Niche and Mainstream");

    // Mainstream should rank higher despite lower per-entry score
    expect(mainstream.weight).toBeGreaterThan(niche.weight);
  });

  it("computes correct score distribution histogram", () => {
    const entries = [
      makeEntry({ score: 10, id: 1 }),
      makeEntry({ score: 10, id: 2 }),
      makeEntry({ score: 8, id: 3 }),
      makeEntry({ score: 7, id: 4 }),
      makeEntry({ score: 7, id: 5 }),
    ];
    const profile = buildTasteProfile(entries);

    expect(profile.scoring.distribution[10]).toBe(2);
    expect(profile.scoring.distribution[8]).toBe(1);
    expect(profile.scoring.distribution[7]).toBe(2);
  });
});

describe("describeTasteProfile", () => {
  it("returns low-data message when profile has no genres", () => {
    const entries = [makeEntry({ score: 8 })];
    const profile = buildTasteProfile(entries);
    const desc = describeTasteProfile(profile, "testuser");

    expect(desc).toContain("testuser");
    expect(desc).toContain("not enough have scores");
  });

  it("describes low scoring tendency", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ score: 5, id: i + 1, genres: ["Action"] }),
    );
    const profile = buildTasteProfile(entries);
    const desc = describeTasteProfile(profile, "harshuser");

    expect(desc).toContain("low");
  });

  it("describes average scoring tendency", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ score: 7, id: i + 1, genres: ["Action"] }),
    );
    const profile = buildTasteProfile(entries);
    const desc = describeTasteProfile(profile, "avguser");

    expect(desc).toContain("near average");
  });

  it("includes genres, themes, scoring tendency, and total", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({
        score: 9,
        id: i + 1,
        genres: ["Action", "Sci-Fi"],
        tags: [{ name: "Time Travel", rank: 90, isMediaSpoiler: false }],
      }),
    );
    const profile = buildTasteProfile(entries);
    const desc = describeTasteProfile(profile, "testuser");

    expect(desc).toContain("Action");
    expect(desc).toContain("Time Travel");
    expect(desc).toContain("high");
    expect(desc).toContain("Total completed: 6");
  });
});

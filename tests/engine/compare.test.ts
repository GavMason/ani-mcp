import { describe, it, expect } from "vitest";
import {
  computeCompatibility,
  computeGenreDivergences,
  findCrossRecs,
} from "../../src/engine/compare.js";
import { buildTasteProfile } from "../../src/engine/taste.js";
import { makeEntry } from "../fixtures.js";

describe("computeCompatibility", () => {
  it("returns 0 when fewer than 3 shared scored entries", () => {
    const shared = [
      { score1: 8, score2: 7 },
      { score1: 9, score2: 8 },
    ];
    expect(computeCompatibility(shared)).toBe(0);
  });

  it("returns 0 when entries exist but fewer than 3 have both scores > 0", () => {
    const shared = [
      { score1: 8, score2: 0 },
      { score1: 0, score2: 7 },
      { score1: 9, score2: 8 },
      { score1: 7, score2: 6 },
    ];
    expect(computeCompatibility(shared)).toBe(0);
  });

  it("returns 50 when all scores are identical (zero variance)", () => {
    const shared = [
      { score1: 7, score2: 7 },
      { score1: 7, score2: 7 },
      { score1: 7, score2: 7 },
    ];
    expect(computeCompatibility(shared)).toBe(50);
  });

  it("returns high score for positively correlated scores", () => {
    const shared = [
      { score1: 10, score2: 9 },
      { score1: 8, score2: 7 },
      { score1: 5, score2: 4 },
      { score1: 3, score2: 2 },
    ];
    const result = computeCompatibility(shared);
    expect(result).toBeGreaterThan(90);
  });

  it("returns low score for negatively correlated scores", () => {
    const shared = [
      { score1: 10, score2: 2 },
      { score1: 8, score2: 4 },
      { score1: 3, score2: 9 },
      { score1: 2, score2: 10 },
    ];
    const result = computeCompatibility(shared);
    expect(result).toBeLessThan(20);
  });

  it("result is bounded between 0 and 100", () => {
    const shared = [
      { score1: 10, score2: 1 },
      { score1: 1, score2: 10 },
      { score1: 10, score2: 1 },
    ];
    const result = computeCompatibility(shared);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe("computeGenreDivergences", () => {
  it("flags genre in one user's top 5 but absent from the other", () => {
    // User 1 loves Horror (top genre), User 2 has no Horror at all
    const entries1 = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ score: 10, genres: ["Horror"], id: i + 1 }),
    );
    const entries2 = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ score: 10, genres: ["Comedy"], id: i + 100 }),
    );

    const p1 = buildTasteProfile(entries1);
    const p2 = buildTasteProfile(entries2);
    const divergences = computeGenreDivergences(p1, p2, "Alice", "Bob");

    expect(divergences.some((d) => d.includes("Horror"))).toBe(true);
    expect(divergences.some((d) => d.includes("Alice"))).toBe(true);
    expect(divergences.some((d) => d.includes("Bob"))).toBe(true);
  });

  it("returns empty when both users share similar genre rankings", () => {
    const makeGenreEntries = (startId: number) =>
      Array.from({ length: 5 }, (_, i) =>
        makeEntry({ score: 9, genres: ["Action", "Sci-Fi"], id: startId + i }),
      );

    const p1 = buildTasteProfile(makeGenreEntries(1));
    const p2 = buildTasteProfile(makeGenreEntries(100));
    const divergences = computeGenreDivergences(p1, p2);

    expect(divergences).toEqual([]);
  });

  it("returns at most 5 divergences", () => {
    // Create profiles with many distinct genres
    const genres1 = ["A", "B", "C", "D", "E", "F", "G"];
    const genres2 = ["H", "I", "J", "K", "L", "M", "N"];

    const entries1 = genres1.map((g, i) =>
      makeEntry({ score: 10, genres: [g], id: i + 1 }),
    );
    const entries2 = genres2.map((g, i) =>
      makeEntry({ score: 10, genres: [g], id: i + 100 }),
    );

    const p1 = buildTasteProfile(entries1);
    const p2 = buildTasteProfile(entries2);
    const divergences = computeGenreDivergences(p1, p2);

    expect(divergences.length).toBeLessThanOrEqual(5);
  });
});

describe("findCrossRecs", () => {
  it("returns titles rated 8+ by source that target hasn't seen", () => {
    const source = [
      makeEntry({ score: 9, id: 1 }),
      makeEntry({ score: 8, id: 2 }),
      makeEntry({ score: 5, id: 3 }),
    ];
    const target = [makeEntry({ score: 7, id: 3 })];

    const recs = findCrossRecs(source, target, "Alice");

    expect(recs.length).toBe(2);
    expect(recs[0]).toContain("Alice rated 9/10");
    expect(recs[1]).toContain("Alice rated 8/10");
  });

  it("excludes titles the target has already seen", () => {
    const source = [makeEntry({ score: 10, id: 1 })];
    const target = [makeEntry({ score: 5, id: 1 })];

    const recs = findCrossRecs(source, target, "Bob");
    expect(recs).toEqual([]);
  });

  it("returns at most 5 recommendations sorted by score", () => {
    const source = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ score: 10 - (i % 3), id: i + 1 }),
    );
    const target: typeof source = [];

    const recs = findCrossRecs(source, target, "Charlie");
    expect(recs.length).toBeLessThanOrEqual(5);
    // First rec should have highest score
    expect(recs[0]).toContain("10/10");
  });

  it("returns empty when no source entries score 8+", () => {
    const source = [
      makeEntry({ score: 7, id: 1 }),
      makeEntry({ score: 6, id: 2 }),
    ];
    const target: typeof source = [];

    const recs = findCrossRecs(source, target, "Dave");
    expect(recs).toEqual([]);
  });
});

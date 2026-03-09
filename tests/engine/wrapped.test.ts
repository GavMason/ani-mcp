/** Unit tests for year-in-review stats computation */

import { describe, it, expect } from "vitest";
import { computeWrappedStats } from "../../src/engine/wrapped.js";
import { makeEntry, makeMangaEntry } from "../fixtures.js";

describe("computeWrappedStats", () => {
  it("counts anime and manga separately", () => {
    const entries = [
      makeEntry({ id: 1, score: 8 }),
      makeEntry({ id: 2, score: 7 }),
      makeMangaEntry({ id: 3, score: 9, chapters: 50 }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.year).toBe(2025);
    expect(stats.animeCount).toBe(2);
    expect(stats.mangaCount).toBe(1);
  });

  it("computes average score from scored entries", () => {
    const entries = [
      makeEntry({ id: 1, score: 8 }),
      makeEntry({ id: 2, score: 6 }),
      makeEntry({ id: 3, score: 0 }), // unscored
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.avgScore).toBe(7);
    expect(stats.scoredCount).toBe(2);
  });

  it("finds top rated title", () => {
    const entries = [
      makeEntry({ id: 1, score: 7 }),
      makeEntry({ id: 2, score: 10 }),
      makeEntry({ id: 3, score: 8 }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.topRated).not.toBeNull();
    expect(stats.topRated?.score).toBe(10);
  });

  it("finds controversial pick", () => {
    const entries = [
      makeEntry({ id: 1, score: 9, meanScore: 50 }), // 90 vs 50 = 40 gap
      makeEntry({ id: 2, score: 7, meanScore: 75 }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.controversial).not.toBeNull();
    expect(stats.controversial?.direction).toBe("above");
    expect(stats.controversial?.gap).toBe(40);
  });

  it("returns null controversial when gap is small", () => {
    const entries = [
      makeEntry({ id: 1, score: 7, meanScore: 75 }),
      makeEntry({ id: 2, score: 8, meanScore: 78 }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.controversial).toBeNull();
  });

  it("tallies episodes and chapters", () => {
    const entries = [
      makeEntry({ id: 1, episodes: 24 }),
      makeEntry({ id: 2, episodes: 12 }),
      makeMangaEntry({ id: 3, chapters: 100 }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.totalEpisodes).toBe(36);
    expect(stats.totalChapters).toBe(100);
  });

  it("ranks genres by frequency", () => {
    const entries = [
      makeEntry({ id: 1, genres: ["Action", "Drama"] }),
      makeEntry({ id: 2, genres: ["Action", "Comedy"] }),
      makeEntry({ id: 3, genres: ["Drama", "Romance"] }),
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.topGenres[0].name).toBe("Action");
    expect(stats.topGenres[0].count).toBe(2);
    expect(stats.topGenres[1].name).toBe("Drama");
  });

  it("builds score distribution", () => {
    const entries = [
      makeEntry({ id: 1, score: 8 }),
      makeEntry({ id: 2, score: 8 }),
      makeEntry({ id: 3, score: 7 }),
      makeEntry({ id: 4, score: 0 }), // unscored
    ];

    const stats = computeWrappedStats(entries, 2025);

    expect(stats.scoreDistribution[8]).toBe(2);
    expect(stats.scoreDistribution[7]).toBe(1);
    expect(stats.scoreDistribution[0]).toBeUndefined();
  });

  it("handles empty entries", () => {
    const stats = computeWrappedStats([], 2025);

    expect(stats.animeCount).toBe(0);
    expect(stats.mangaCount).toBe(0);
    expect(stats.avgScore).toBe(0);
    expect(stats.topRated).toBeNull();
    expect(stats.controversial).toBeNull();
    expect(stats.topGenres).toEqual([]);
  });
});

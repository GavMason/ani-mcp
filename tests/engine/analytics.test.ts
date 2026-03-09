import { describe, it, expect } from "vitest";
import {
  computeCalibration,
  analyzeDrops,
  computeGenreEvolution,
} from "../../src/engine/analytics.js";
import { makeEntry } from "../fixtures.js";

// === computeCalibration ===

describe("computeCalibration", () => {
  it("returns empty result for no entries", () => {
    const result = computeCalibration([]);
    expect(result.totalScored).toBe(0);
    expect(result.tendency).toBe("balanced");
    expect(result.genreCalibrations).toEqual([]);
  });

  it("returns empty result when all entries are unscored", () => {
    const entries = [
      makeEntry({ score: 0, genres: ["Action"] }),
      makeEntry({ score: 0, genres: ["Drama"] }),
    ];
    const result = computeCalibration(entries);
    expect(result.totalScored).toBe(0);
  });

  it("skips entries with null meanScore", () => {
    const entries = [
      makeEntry({ score: 8, genres: ["Action"], meanScore: 0 }),
      makeEntry({ score: 7, genres: ["Action"], meanScore: 75 }),
    ];
    const result = computeCalibration(entries);
    // Only the entry with meanScore 75 counts
    expect(result.totalScored).toBe(1);
  });

  it("computes positive overall delta for high scorer", () => {
    // User scores 9, community is 60/10=6.0 -> delta = +3.0
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: i + 1,
        score: 9,
        genres: ["Action"],
        meanScore: 60,
      }),
    );
    const result = computeCalibration(entries);
    expect(result.overallDelta).toBeCloseTo(3.0, 1);
    expect(result.tendency).toBe("high");
  });

  it("computes negative overall delta for low scorer", () => {
    // User scores 5, community is 80/10=8.0 -> delta = -3.0
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: i + 1,
        score: 5,
        genres: ["Romance"],
        meanScore: 80,
      }),
    );
    const result = computeCalibration(entries);
    expect(result.overallDelta).toBeCloseTo(-3.0, 1);
    expect(result.tendency).toBe("low");
  });

  it("classifies average tendency for small delta", () => {
    // User scores 7.5, community is 75/10=7.5 -> delta = 0
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: i + 1,
        score: 7,
        genres: ["Comedy"],
        meanScore: 70,
      }),
    );
    const result = computeCalibration(entries);
    expect(result.tendency).toBe("balanced");
  });

  it("requires min 3 entries per genre for calibration", () => {
    const entries = [
      makeEntry({ id: 1, score: 9, genres: ["Action"], meanScore: 60 }),
      makeEntry({ id: 2, score: 9, genres: ["Action"], meanScore: 60 }),
      // Only 2 Action entries - below threshold
      makeEntry({ id: 3, score: 5, genres: ["Drama"], meanScore: 80 }),
      makeEntry({ id: 4, score: 5, genres: ["Drama"], meanScore: 80 }),
      makeEntry({ id: 5, score: 5, genres: ["Drama"], meanScore: 80 }),
    ];
    const result = computeCalibration(entries);
    // Action should be excluded (only 2), Drama should be included (3)
    expect(result.genreCalibrations.length).toBe(1);
    expect(result.genreCalibrations[0].genre).toBe("Drama");
  });

  it("sorts genres by absolute delta descending", () => {
    const entries = [
      // Action: user 9, community 6 -> delta +3
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({ id: i + 1, score: 9, genres: ["Action"], meanScore: 60 }),
      ),
      // Drama: user 7, community 7 -> delta 0
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({ id: i + 10, score: 7, genres: ["Drama"], meanScore: 70 }),
      ),
      // Horror: user 4, community 7 -> delta -3
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({ id: i + 20, score: 4, genres: ["Horror"], meanScore: 70 }),
      ),
    ];
    const result = computeCalibration(entries);
    // Action (+3) and Horror (-3) should be first (tied in abs), Drama (0) last
    expect(result.genreCalibrations.length).toBe(3);
    expect(Math.abs(result.genreCalibrations[0].delta)).toBeGreaterThanOrEqual(
      Math.abs(result.genreCalibrations[2].delta),
    );
  });

  it("handles multi-genre entries correctly", () => {
    // Each entry has both Action and Drama
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        id: i + 1,
        score: 8,
        genres: ["Action", "Drama"],
        meanScore: 70,
      }),
    );
    const result = computeCalibration(entries);
    // Both genres should appear with count 3
    expect(result.genreCalibrations.length).toBe(2);
    expect(result.genreCalibrations[0].count).toBe(3);
  });
});

// === analyzeDrops ===

describe("analyzeDrops", () => {
  it("returns empty analysis for no drops", () => {
    const result = analyzeDrops([], []);
    expect(result.totalDropped).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  it("computes genre drop rates against total entries", () => {
    // 3 dropped + 7 completed = 10 total Action entries -> 30% drop rate
    const dropped = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 3,
        genres: ["Action"],
        episodes: 12,
      }),
    );
    const all = [
      ...dropped,
      ...Array.from({ length: 7 }, (_, i) =>
        makeEntry({
          id: i + 10,
          status: "COMPLETED",
          genres: ["Action"],
          episodes: 12,
        }),
      ),
    ];

    const result = analyzeDrops(dropped, all);
    expect(result.totalDropped).toBe(3);
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].label).toBe("Action");
    expect(result.clusters[0].dropRate).toBeCloseTo(0.3, 2);
  });

  it("detects early drops (< 25% progress)", () => {
    const dropped = Array.from({ length: 4 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: i < 3 ? 2 : 10, // 3 early drops (2/24 < 25%), 1 late
        genres: ["Action"],
        episodes: 24,
      }),
    );
    const result = analyzeDrops(dropped, dropped);
    expect(result.earlyDrops).toBe(3);
  });

  it("computes median drop point", () => {
    // Drop points: 25%, 50%, 75% -> median = 50%
    const dropped = [
      makeEntry({ id: 1, status: "DROPPED", progress: 3, genres: ["Action"], episodes: 12 }),
      makeEntry({ id: 2, status: "DROPPED", progress: 6, genres: ["Action"], episodes: 12 }),
      makeEntry({ id: 3, status: "DROPPED", progress: 9, genres: ["Action"], episodes: 12 }),
    ];
    const result = analyzeDrops(dropped, dropped);
    const actionCluster = result.clusters.find((c) => c.label === "Action");
    expect(actionCluster).toBeDefined();
    expect(actionCluster?.medianDropPoint).toBeCloseTo(0.5, 2);
  });

  it("requires min 3 drops per cluster", () => {
    const dropped = [
      makeEntry({ id: 1, status: "DROPPED", genres: ["Action"], episodes: 12 }),
      makeEntry({ id: 2, status: "DROPPED", genres: ["Action"], episodes: 12 }),
      // Only 2 Action drops - below threshold
    ];
    const result = analyzeDrops(dropped, dropped);
    expect(result.clusters.length).toBe(0);
  });

  it("computes average drop progress", () => {
    // Drop at 50% and 100% (weird but valid) -> avg 75%
    const dropped = [
      makeEntry({ id: 1, status: "DROPPED", progress: 6, genres: ["Action"], episodes: 12 }),
      makeEntry({ id: 2, status: "DROPPED", progress: 12, genres: ["Action"], episodes: 12 }),
      makeEntry({ id: 3, status: "DROPPED", progress: 6, genres: ["Action"], episodes: 12 }),
    ];
    const result = analyzeDrops(dropped, dropped);
    // (0.5 + 1.0 + 0.5) / 3 = 0.667
    expect(result.avgDropProgress).toBeCloseTo(0.667, 2);
  });

  it("handles entries without total episodes", () => {
    const dropped = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 5,
        genres: ["Action"],
        episodes: 0, // unknown total
      }),
    );
    const result = analyzeDrops(dropped, dropped);
    expect(result.totalDropped).toBe(3);
    // No early drops since total is unknown
    expect(result.earlyDrops).toBe(0);
  });

  it("includes tag clusters with enough drops", () => {
    const tag = { name: "Isekai", rank: 80, isMediaSpoiler: false };
    const dropped = Array.from({ length: 4 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 3,
        genres: ["Action"],
        tags: [tag],
        episodes: 12,
      }),
    );
    const result = analyzeDrops(dropped, dropped);
    const isekaiCluster = result.clusters.find(
      (c) => c.label === "Isekai" && c.type === "tag",
    );
    expect(isekaiCluster).toBeDefined();
    expect(isekaiCluster?.dropCount).toBe(4);
  });

  it("excludes spoiler tags from clusters", () => {
    const tag = { name: "Plot Twist", rank: 90, isMediaSpoiler: true };
    const dropped = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 3,
        genres: ["Action"],
        tags: [tag],
        episodes: 12,
      }),
    );
    const result = analyzeDrops(dropped, dropped);
    const spoilerCluster = result.clusters.find(
      (c) => c.label === "Plot Twist",
    );
    expect(spoilerCluster).toBeUndefined();
  });
});

// === computeGenreEvolution ===

describe("computeGenreEvolution", () => {
  it("returns empty result for no entries", () => {
    const result = computeGenreEvolution([]);
    expect(result.eras).toEqual([]);
    expect(result.shifts).toEqual([]);
  });

  it("excludes entries without completion dates", () => {
    const entries = [
      makeEntry({
        id: 1,
        genres: ["Action"],
        completedAt: { year: null, month: null, day: null },
      }),
    ];
    const result = computeGenreEvolution(entries);
    expect(result.eras).toEqual([]);
  });

  it("uses 1-year windows for narrow spans", () => {
    const entries = [
      makeEntry({ id: 1, genres: ["Action"], completedAt: { year: 2023, month: 1, day: 1 } }),
      makeEntry({ id: 2, genres: ["Drama"], completedAt: { year: 2024, month: 1, day: 1 } }),
    ];
    const result = computeGenreEvolution(entries);
    // Span is 2 years (< 4), should use 1-year windows
    expect(result.eras.length).toBe(2);
    expect(result.eras[0].period).toBe("2023");
    expect(result.eras[1].period).toBe("2024");
  });

  it("uses 2-year windows for wider spans", () => {
    const entries = [
      makeEntry({ id: 1, genres: ["Action"], completedAt: { year: 2018, month: 1, day: 1 } }),
      makeEntry({ id: 2, genres: ["Drama"], completedAt: { year: 2020, month: 1, day: 1 } }),
      makeEntry({ id: 3, genres: ["Comedy"], completedAt: { year: 2022, month: 1, day: 1 } }),
    ];
    const result = computeGenreEvolution(entries);
    // Span is 5 years (>= 4), should use 2-year windows
    expect(result.eras[0].period).toBe("2018-2019");
  });

  it("shows top 5 genres per era", () => {
    const genres = ["Action", "Drama", "Comedy", "Romance", "Horror", "Sci-Fi"];
    const entries = genres.flatMap((g, i) =>
      Array.from({ length: 5 - i }, (_, j) =>
        makeEntry({
          id: i * 10 + j + 1,
          genres: [g],
          completedAt: { year: 2023, month: 1, day: 1 },
        }),
      ),
    );
    const result = computeGenreEvolution(entries);
    // Only top 5 genres should appear
    expect(result.eras[0].topGenres.length).toBeLessThanOrEqual(5);
    expect(result.eras[0].topGenres[0]).toBe("Action");
  });

  it("generates shift descriptions", () => {
    // 2018-2019: Action dominant, 2020-2021: Romance dominant
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 1,
          genres: ["Action"],
          completedAt: { year: 2018, month: 1, day: 1 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 10,
          genres: ["Romance"],
          completedAt: { year: 2020, month: 1, day: 1 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 20,
          genres: ["Comedy"],
          completedAt: { year: 2022, month: 1, day: 1 },
        }),
      ),
    ];
    const result = computeGenreEvolution(entries);
    expect(result.shifts.length).toBeGreaterThan(0);
    // Should mention genres rising or dropping
    const shiftText = result.shifts.join(" ");
    expect(shiftText).toContain("rose into top genres");
  });

  it("counts titles per era", () => {
    const entries = [
      makeEntry({ id: 1, genres: ["Action"], completedAt: { year: 2023, month: 1, day: 1 } }),
      makeEntry({ id: 2, genres: ["Drama"], completedAt: { year: 2023, month: 6, day: 1 } }),
      makeEntry({ id: 3, genres: ["Comedy"], completedAt: { year: 2024, month: 1, day: 1 } }),
    ];
    const result = computeGenreEvolution(entries);
    expect(result.eras[0].count).toBe(2); // 2023
    expect(result.eras[1].count).toBe(1); // 2024
  });

  it("accepts custom window size", () => {
    const entries = [
      makeEntry({ id: 1, genres: ["Action"], completedAt: { year: 2018, month: 1, day: 1 } }),
      makeEntry({ id: 2, genres: ["Drama"], completedAt: { year: 2021, month: 1, day: 1 } }),
      makeEntry({ id: 3, genres: ["Comedy"], completedAt: { year: 2024, month: 1, day: 1 } }),
    ];
    const result = computeGenreEvolution(entries, 3);
    // 7-year span with 3-year windows
    expect(result.eras[0].period).toBe("2018-2020");
  });
});

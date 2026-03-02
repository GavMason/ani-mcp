import { describe, it, expect } from "vitest";
import { rankSimilar } from "../../src/engine/similar.js";
import { makeMedia } from "../fixtures.js";

describe("rankSimilar", () => {
  it("ranks genre-overlapping titles higher", () => {
    const source = makeMedia({ genres: ["Action", "Thriller"], id: 1 });
    const candidates = [
      makeMedia({ genres: ["Comedy", "Romance"], id: 2 }),
      makeMedia({ genres: ["Action", "Thriller", "Drama"], id: 3 }),
    ];
    const results = rankSimilar(source, candidates, new Map());

    expect(results[0].media.id).toBe(3);
    expect(results[0].similarityScore).toBeGreaterThan(
      results[1].similarityScore,
    );
  });

  it("boosts titles with community recommendation ratings", () => {
    const source = makeMedia({ genres: ["Action"], id: 1 });
    const candidates = [
      makeMedia({ genres: ["Action"], id: 2 }),
      makeMedia({ genres: ["Action"], id: 3 }),
    ];
    const recRatings = new Map([[3, 20]]);
    const results = rankSimilar(source, candidates, recRatings);

    expect(results[0].media.id).toBe(3);
  });

  it("includes genre overlap in reasons", () => {
    const source = makeMedia({ genres: ["Sci-Fi", "Thriller"], id: 1 });
    const candidates = [
      makeMedia({ genres: ["Sci-Fi", "Drama"], id: 2 }),
    ];
    const results = rankSimilar(source, candidates, new Map());
    const reasons = results[0].reasons.join(" ");

    expect(reasons).toContain("Sci-Fi");
  });

  it("includes tag overlap in reasons", () => {
    const source = makeMedia({
      genres: ["Sci-Fi"],
      tags: [{ name: "Time Travel", rank: 90, isMediaSpoiler: false }],
      id: 1,
    });
    const candidates = [
      makeMedia({
        genres: ["Sci-Fi"],
        tags: [{ name: "Time Travel", rank: 85, isMediaSpoiler: false }],
        id: 2,
      }),
    ];
    const results = rankSimilar(source, candidates, new Map());
    const reasons = results[0].reasons.join(" ");

    expect(reasons).toContain("Time Travel");
  });

  it("returns empty array for no candidates", () => {
    const source = makeMedia({ id: 1 });
    const results = rankSimilar(source, [], new Map());
    expect(results).toEqual([]);
  });

  it("skips spoiler tags in overlap", () => {
    const source = makeMedia({
      genres: ["Drama"],
      tags: [{ name: "Plot Twist", rank: 90, isMediaSpoiler: true }],
      id: 1,
    });
    const candidates = [
      makeMedia({
        genres: ["Drama"],
        tags: [{ name: "Plot Twist", rank: 85, isMediaSpoiler: true }],
        id: 2,
      }),
    ];
    const results = rankSimilar(source, candidates, new Map());
    const reasons = results[0].reasons.join(" ");

    expect(reasons).not.toContain("Plot Twist");
  });

  it("returns scores on 0-100 scale", () => {
    const source = makeMedia({ genres: ["Action", "Drama"], id: 1 });
    const candidates = [
      makeMedia({ genres: ["Action", "Drama"], id: 2 }),
    ];
    const results = rankSimilar(source, candidates, new Map());

    expect(results[0].similarityScore).toBeGreaterThanOrEqual(0);
    expect(results[0].similarityScore).toBeLessThanOrEqual(100);
  });

  it("sorts results by similarity score descending", () => {
    const source = makeMedia({
      genres: ["Action", "Drama", "Thriller"],
      id: 1,
    });
    const candidates = [
      makeMedia({ genres: ["Comedy"], id: 2 }),
      makeMedia({ genres: ["Action", "Drama"], id: 3 }),
      makeMedia({ genres: ["Action"], id: 4 }),
    ];
    const results = rankSimilar(source, candidates, new Map());

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarityScore).toBeGreaterThanOrEqual(
        results[i].similarityScore,
      );
    }
  });
});

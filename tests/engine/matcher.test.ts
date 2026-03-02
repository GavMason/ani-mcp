import { describe, it, expect } from "vitest";
import { matchCandidates, explainMatch } from "../../src/engine/matcher.js";
import { buildTasteProfile } from "../../src/engine/taste.js";
import { parseMood } from "../../src/engine/mood.js";
import { makeEntry, makeMedia } from "../fixtures.js";

// Profile from a user who loves psychological thrillers
function makeThrillerProfile() {
  const entries = [
    makeEntry({ score: 10, genres: ["Psychological", "Thriller"], id: 1 }),
    makeEntry({ score: 9, genres: ["Psychological", "Thriller"], id: 2 }),
    makeEntry({ score: 9, genres: ["Psychological", "Drama"], id: 3 }),
    makeEntry({ score: 8, genres: ["Sci-Fi", "Thriller"], id: 4 }),
    makeEntry({ score: 6, genres: ["Comedy", "Romance"], id: 5 }),
  ];
  return buildTasteProfile(entries);
}

describe("matchCandidates", () => {
  it("ranks candidates matching user preferences higher", () => {
    const profile = makeThrillerProfile();

    const candidates = [
      makeMedia({ genres: ["Comedy", "Romance"], id: 201 }),
      makeMedia({ genres: ["Psychological", "Thriller"], id: 202 }),
      makeMedia({ genres: ["Action", "Sci-Fi"], id: 203 }),
    ];

    const results = matchCandidates(candidates, profile);

    expect(results[0].media.id).toBe(202);
    expect(results[0].reasons.length).toBeGreaterThan(0);
  });

  it("filters out titles with low community scores", () => {
    const profile = makeThrillerProfile();

    const candidates = [
      makeMedia({ genres: ["Psychological", "Thriller"], meanScore: 40, id: 301 }),
      makeMedia({ genres: ["Psychological", "Thriller"], meanScore: 80, id: 302 }),
    ];

    const results = matchCandidates(candidates, profile);

    expect(results.length).toBe(1);
    expect(results[0].media.id).toBe(302);
  });

  it("boosts results when mood matches genres", () => {
    const profile = makeThrillerProfile();
    const mood = parseMood("something dark and intense");

    const candidates = [
      makeMedia({ genres: ["Psychological", "Thriller"], id: 401 }),
      makeMedia({ genres: ["Comedy", "Romance"], id: 402 }),
    ];

    const withMood = matchCandidates(candidates, profile, mood);
    const withoutMood = matchCandidates(candidates, profile);

    const thrillerWithMood = withMood.find((r) => r.media.id === 401);
    const thrillerWithout = withoutMood.find((r) => r.media.id === 401);
    if (!thrillerWithMood || !thrillerWithout) throw new Error("Expected thriller in results");

    expect(thrillerWithMood.score).toBeGreaterThan(thrillerWithout.score);
    expect(thrillerWithMood.moodFit).toBe("Strong mood match");
  });

  it("returns empty array when no candidates pass filters", () => {
    const profile = makeThrillerProfile();

    const candidates = [
      makeMedia({ genres: ["Action"], meanScore: 30, id: 501 }),
    ];

    const results = matchCandidates(candidates, profile);
    expect(results).toEqual([]);
  });

  it("scores niche titles slightly higher than equally-matching popular titles", () => {
    const profile = makeThrillerProfile();

    const candidates = [
      makeMedia({ genres: ["Psychological", "Thriller"], id: 701, popularity: 200000 }),
      makeMedia({ genres: ["Psychological", "Thriller"], id: 702, popularity: 500 }),
    ];

    const results = matchCandidates(candidates, profile);
    const popular = results.find((r) => r.media.id === 701);
    const niche = results.find((r) => r.media.id === 702);
    if (!popular || !niche) throw new Error("Expected both results");

    expect(niche.score).toBeGreaterThan(popular.score);
  });

  it("penalizes results when mood penalty genres dominate", () => {
    const profile = makeThrillerProfile();
    // "chill" penalizes Horror, Action, Thriller
    const mood = parseMood("chill");

    const candidates = [
      makeMedia({ genres: ["Horror", "Thriller"], id: 801 }),
      makeMedia({ genres: ["Slice of Life", "Iyashikei"], id: 802 }),
    ];

    const withMood = matchCandidates(candidates, profile, mood);
    const withoutMood = matchCandidates(candidates, profile);

    const horrorWith = withMood.find((r) => r.media.id === 801);
    const horrorWithout = withoutMood.find((r) => r.media.id === 801);

    if (horrorWith && horrorWithout) {
      expect(horrorWith.score).toBeLessThan(horrorWithout.score);
    }
  });

  it("skips spoiler tags in mood matching", () => {
    const profile = makeThrillerProfile();
    // "dark" boosts Psychological, Thriller, etc.
    const mood = parseMood("dark");

    // Boost tags are spoilers, so mood matching should ignore them
    const candidates = [
      makeMedia({
        genres: ["Comedy"],
        tags: [
          { name: "Psychological", rank: 90, isMediaSpoiler: true },
          { name: "Thriller", rank: 80, isMediaSpoiler: true },
        ],
        id: 901,
      }),
    ];

    const withMood = matchCandidates(candidates, profile, mood);
    const withoutMood = matchCandidates(candidates, profile);

    const withResult = withMood.find((r) => r.media.id === 901);
    const withoutResult = withoutMood.find((r) => r.media.id === 901);

    // Spoiler tags shouldn't trigger boost
    if (withResult && withoutResult) {
      expect(withResult.score).toBe(withoutResult.score);
    }
  });

  it("includes tag-based reasons when tags overlap", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        score: 9,
        genres: ["Sci-Fi"],
        tags: [
          { name: "Time Travel", rank: 90, isMediaSpoiler: false },
          { name: "Mind Games", rank: 80, isMediaSpoiler: false },
        ],
        id: i + 1,
      }),
    );
    const profile = buildTasteProfile(entries);

    const candidates = [
      makeMedia({
        genres: ["Sci-Fi"],
        tags: [
          { name: "Time Travel", rank: 85, isMediaSpoiler: false },
          { name: "Mind Games", rank: 75, isMediaSpoiler: false },
        ],
        id: 601,
      }),
    ];

    const results = matchCandidates(candidates, profile);
    const reasons = results[0].reasons.join(" ");

    expect(reasons).toContain("Time Travel");
  });
});

describe("explainMatch", () => {
  it("returns a detailed breakdown for a matching title", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({ genres: ["Psychological", "Thriller"], id: 200 });
    const result = explainMatch(media, profile);

    expect(result.breakdown.finalScore).toBeGreaterThan(50);
    expect(result.matchedGenres).toContain("Psychological");
    expect(result.matchedGenres).toContain("Thriller");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("shows low score for a non-matching title", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({ genres: ["Sports", "Music"], id: 201 });
    const result = explainMatch(media, profile);

    expect(result.breakdown.finalScore).toBeLessThan(50);
    expect(result.unmatchedGenres).toContain("Sports");
    expect(result.unmatchedGenres).toContain("Music");
  });

  it("does not filter low community score titles", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({
      genres: ["Psychological"],
      meanScore: 30,
      id: 202,
    });
    const result = explainMatch(media, profile);

    expect(result.media.id).toBe(202);
    expect(result.breakdown.communityScore).toBeLessThan(0.5);
  });

  it("applies mood modifier to breakdown", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({ genres: ["Psychological", "Thriller"], id: 203 });
    const mood = parseMood("dark and intense");
    const result = explainMatch(media, profile, mood);

    expect(result.breakdown.moodMultiplier).toBeGreaterThan(1);
    expect(result.moodFit).toBe("Strong mood match");
  });

  it("tracks unmatched tags", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({
      genres: ["Action"],
      tags: [
        { name: "Robots", rank: 80, isMediaSpoiler: false },
        { name: "Space", rank: 70, isMediaSpoiler: false },
      ],
      id: 204,
    });
    const result = explainMatch(media, profile);

    expect(result.unmatchedTags).toContain("Robots");
    expect(result.unmatchedTags).toContain("Space");
  });

  it("excludes spoiler tags from unmatched list", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({
      genres: ["Action"],
      tags: [{ name: "Secret Plot", rank: 90, isMediaSpoiler: true }],
      id: 205,
    });
    const result = explainMatch(media, profile);

    expect(result.unmatchedTags).not.toContain("Secret Plot");
  });

  it("has popularity factor less than 1 for popular titles", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({
      genres: ["Psychological"],
      popularity: 200000,
      id: 206,
    });
    const result = explainMatch(media, profile);

    expect(result.breakdown.popularityFactor).toBeLessThan(1);
  });

  it("returns score on 0-100 scale", () => {
    const profile = makeThrillerProfile();
    const media = makeMedia({ genres: ["Psychological", "Thriller"], id: 207 });
    const result = explainMatch(media, profile);

    expect(result.breakdown.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.finalScore).toBeLessThanOrEqual(100);
  });
});

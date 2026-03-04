import { describe, it, expect, vi } from "vitest";
import {
  parseMood,
  hasMoodMatch,
  seasonalMoodSuggestions,
  parseMoodFilters,
  loadCustomMoods,
} from "../../src/engine/mood.js";

describe("parseMood", () => {
  it("parses single keyword", () => {
    const mood = parseMood("dark");
    expect(mood.boostGenres.has("Psychological")).toBe(true);
    expect(mood.boostGenres.has("Thriller")).toBe(true);
    expect(mood.penalizeGenres.has("Comedy")).toBe(true);
  });

  it("merges multiple keywords", () => {
    const mood = parseMood("dark and brainy");
    // dark boosts
    expect(mood.boostGenres.has("Thriller")).toBe(true);
    // brainy boosts
    expect(mood.boostGenres.has("Mystery")).toBe(true);
    expect(mood.boostGenres.has("Philosophy")).toBe(true);
  });

  it("ignores unknown words", () => {
    const mood = parseMood("something completely random xyz");
    expect(mood.boostGenres.size).toBe(0);
    expect(mood.penalizeGenres.size).toBe(0);
  });

  it("strips punctuation before matching", () => {
    const mood = parseMood("dark, chill, romantic!");
    expect(mood.boostGenres.has("Thriller")).toBe(true); // dark
    expect(mood.boostGenres.has("Slice of Life")).toBe(true); // chill
    expect(mood.boostGenres.has("Romance")).toBe(true); // romantic
  });

  it("resolves synonyms to base mood rules", () => {
    const grim = parseMood("grim");
    const dark = parseMood("dark");
    expect(grim.boostGenres).toEqual(dark.boostGenres);
    expect(grim.penalizeGenres).toEqual(dark.penalizeGenres);
  });

  it("supports the trippy/surreal mood category", () => {
    const mood = parseMood("trippy");
    expect(mood.boostTags.has("Avant Garde")).toBe(true);
    expect(mood.boostTags.has("Surreal")).toBe(true);
  });

  it("handles mixed synonyms across categories", () => {
    const mood = parseMood("cozy and cerebral");
    expect(mood.boostGenres.has("Slice of Life")).toBe(true);
    expect(mood.boostGenres.has("Mystery")).toBe(true);
  });

  it("populates both genre and tag sets", () => {
    const mood = parseMood("dark");
    expect(mood.boostTags.has("Psychological")).toBe(true);
    expect(mood.penalizeTags.has("Comedy")).toBe(true);
  });
});

describe("hasMoodMatch", () => {
  it("returns true when mood contains a known keyword", () => {
    expect(hasMoodMatch("something dark")).toBe(true);
    expect(hasMoodMatch("chill vibes")).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(hasMoodMatch("something completely random")).toBe(false);
    expect(hasMoodMatch("xyz")).toBe(false);
  });

  it("handles punctuation in mood string", () => {
    expect(hasMoodMatch("dark!")).toBe(true);
    expect(hasMoodMatch("chill, romantic")).toBe(true);
  });

  it("recognizes synonym keywords", () => {
    expect(hasMoodMatch("grim")).toBe(true);
    expect(hasMoodMatch("cozy")).toBe(true);
    expect(hasMoodMatch("cerebral")).toBe(true);
    expect(hasMoodMatch("surreal")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasMoodMatch("DARK")).toBe(true);
    expect(hasMoodMatch("Dark and Scary")).toBe(true);
  });
});

describe("new mood keywords", () => {
  it("parses nostalgic mood", () => {
    const mood = parseMood("nostalgic");
    expect(mood.boostTags.has("Coming of Age")).toBe(true);
    expect(mood.boostTags.has("School")).toBe(true);
    expect(mood.penalizeTags.has("Isekai")).toBe(true);
  });

  it("parses artistic mood", () => {
    const mood = parseMood("artistic");
    expect(mood.boostTags.has("Avant Garde")).toBe(true);
    expect(mood.boostTags.has("Visual Arts")).toBe(true);
    expect(mood.penalizeTags.has("Shounen")).toBe(true);
  });

  it("parses competitive mood", () => {
    const mood = parseMood("competitive");
    expect(mood.boostGenres.has("Sports")).toBe(true);
    expect(mood.boostTags.has("Tournament")).toBe(true);
    expect(mood.penalizeTags.has("Slice of Life")).toBe(true);
  });

  it("resolves new synonyms", () => {
    expect(parseMood("retro").boostTags).toEqual(parseMood("nostalgic").boostTags);
    expect(parseMood("artsy").boostTags).toEqual(parseMood("artistic").boostTags);
    expect(parseMood("rivalry").boostTags).toEqual(
      parseMood("competitive").boostTags,
    );
  });

  it("combines new moods with existing moods", () => {
    const mood = parseMood("nostalgic and romantic");
    expect(mood.boostTags.has("Coming of Age")).toBe(true);
    expect(mood.boostGenres.has("Romance")).toBe(true);
  });

  it("recognizes new synonyms via hasMoodMatch", () => {
    expect(hasMoodMatch("retro")).toBe(true);
    expect(hasMoodMatch("artsy")).toBe(true);
    expect(hasMoodMatch("tournament")).toBe(true);
    expect(hasMoodMatch("aesthetic")).toBe(true);
  });
});

describe("parseMoodFilters", () => {
  it("returns genre and tag arrays from mood string", () => {
    const filters = parseMoodFilters("dark");
    // AniList genres
    expect(filters.genres).toContain("Psychological");
    expect(filters.genres).toContain("Thriller");
    // AniList tags
    expect(filters.tags).toContain("Tragedy");
    expect(filters.tags).not.toContain("Psychological");
  });

  it("merges multiple keywords into combined arrays", () => {
    const filters = parseMoodFilters("dark and romantic");
    expect(filters.genres).toContain("Thriller");
    expect(filters.genres).toContain("Romance");
  });

  it("returns empty arrays for unrecognized input", () => {
    const filters = parseMoodFilters("xyz nonsense");
    expect(filters.genres).toHaveLength(0);
    expect(filters.tags).toHaveLength(0);
  });

  it("deduplicates entries", () => {
    const filters = parseMoodFilters("dark grim moody");
    const unique = new Set(filters.genres);
    expect(filters.genres.length).toBe(unique.size);
  });
});

describe("natural language synonyms", () => {
  it("maps psychological to brainy", () => {
    expect(hasMoodMatch("psychological")).toBe(true);
    const mood = parseMood("psychological");
    expect(mood.boostGenres.has("Psychological")).toBe(true);
    expect(mood.boostGenres.has("Mystery")).toBe(true);
  });

  it("maps battle/fighting to action", () => {
    expect(hasMoodMatch("battle")).toBe(true);
    expect(hasMoodMatch("fighting")).toBe(true);
    const mood = parseMood("battle");
    expect(mood.boostGenres.has("Action")).toBe(true);
  });

  it("maps heartfelt/touching to sad", () => {
    const mood = parseMood("heartfelt");
    expect(mood.boostGenres.has("Drama")).toBe(true);
    expect(mood.boostGenres.has("Tragedy")).toBe(true);
  });

  it("maps lighthearted/feels to wholesome", () => {
    const mood = parseMood("lighthearted");
    expect(mood.boostGenres.has("Slice of Life")).toBe(true);
    expect(mood.boostGenres.has("Comedy")).toBe(true);
  });

  it("maps suspense/suspenseful to intense", () => {
    const mood = parseMood("suspenseful");
    expect(mood.boostGenres.has("Thriller")).toBe(true);
    expect(mood.boostGenres.has("Action")).toBe(true);
  });
});

describe("custom mood config", () => {
  it("overrides existing mood via ANILIST_MOOD_CONFIG", () => {
    // Use a unique keyword to avoid polluting other tests
    process.env.ANILIST_MOOD_CONFIG = JSON.stringify({
      testmood: { boost: ["Iyashikei", "Custom Tag"], penalize: [] },
    });
    loadCustomMoods();
    delete process.env.ANILIST_MOOD_CONFIG;

    expect(hasMoodMatch("testmood")).toBe(true);
    const mood = parseMood("testmood");
    expect(mood.boostTags.has("Custom Tag")).toBe(true);
  });

  it("adds new custom keywords", () => {
    process.env.ANILIST_MOOD_CONFIG = JSON.stringify({
      testcustom: { boost: ["Sci-Fi", "Cyberpunk"], penalize: ["Fantasy"] },
    });
    loadCustomMoods();
    delete process.env.ANILIST_MOOD_CONFIG;

    expect(hasMoodMatch("testcustom")).toBe(true);
    const mood = parseMood("testcustom");
    expect(mood.boostGenres.has("Sci-Fi")).toBe(true);
    expect(mood.penalizeGenres.has("Fantasy")).toBe(true);
  });

  it("ignores malformed JSON gracefully", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.ANILIST_MOOD_CONFIG = "not valid json{";
    loadCustomMoods();
    delete process.env.ANILIST_MOOD_CONFIG;

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Invalid ANILIST_MOOD_CONFIG"),
    );
    warn.mockRestore();
  });
});

describe("seasonalMoodSuggestions", () => {
  it("returns season and mood suggestions", () => {
    const result = seasonalMoodSuggestions();
    expect(result.season).toMatch(/^(WINTER|SPRING|SUMMER|FALL)$/);
    expect(result.moods.length).toBeGreaterThan(0);
  });

  it("all suggestions are recognized mood keywords", () => {
    const { moods } = seasonalMoodSuggestions();
    for (const m of moods) {
      expect(hasMoodMatch(m)).toBe(true);
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  parseMood,
  hasMoodMatch,
  seasonalMoodSuggestions,
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

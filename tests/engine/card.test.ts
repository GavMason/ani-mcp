/** Unit tests for shareable card SVG generation */

import { describe, it, expect } from "vitest";
import {
  buildTasteCardSvg,
  buildCompatCardSvg,
  svgToPng,
  type CompatCardData,
} from "../../src/engine/card.js";
import type { TasteProfile } from "../../src/engine/taste.js";

function makeProfile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    genres: [
      { name: "Action", weight: 0.85, count: 40 },
      { name: "Drama", weight: 0.72, count: 30 },
      { name: "Comedy", weight: 0.65, count: 25 },
    ],
    tags: [
      { name: "Male Protagonist", weight: 0.6, count: 20 },
      { name: "Ensemble Cast", weight: 0.5, count: 15 },
    ],
    themes: [
      { name: "Coming of Age", weight: 0.6, count: 18 },
      { name: "Revenge", weight: 0.5, count: 12 },
    ],
    scoring: {
      meanScore: 7.2,
      median: 7,
      totalScored: 100,
      distribution: { 5: 5, 6: 10, 7: 30, 8: 35, 9: 15, 10: 5 },
      tendency: "balanced",
    },
    formats: [
      { format: "TV", count: 80, percent: 60 },
      { format: "MOVIE", count: 30, percent: 22 },
      { format: "OVA", count: 24, percent: 18 },
    ],
    totalCompleted: 134,
    ...overrides,
  };
}

describe("buildTasteCardSvg", () => {
  it("produces valid SVG with username and genres", () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile());

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("TestUser");
    expect(svg).toContain("Action");
    expect(svg).toContain("Drama");
    expect(svg).toContain("Comedy");
  });

  it("includes score distribution and format breakdown", () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile());

    expect(svg).toContain("Scores");
    expect(svg).toContain("Formats");
    expect(svg).toContain("TV");
  });

  it("includes themes section", () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile());

    expect(svg).toContain("Top Themes");
    expect(svg).toContain("Coming of Age");
  });

  it("handles empty themes gracefully", () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile({ themes: [] }));

    expect(svg).toContain("<svg");
    expect(svg).toContain("Top Themes");
  });

  it("escapes XML characters in username", () => {
    const svg = buildTasteCardSvg("User<Script>", makeProfile());

    expect(svg).not.toContain("<Script>");
    expect(svg).toContain("&lt;Script&gt;");
  });

  it("shows stats badges", () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile());

    expect(svg).toContain("Completed");
    expect(svg).toContain("134");
    expect(svg).toContain("Mean Score");
    expect(svg).toContain("7.2");
  });
});

describe("buildCompatCardSvg", () => {
  const baseData: CompatCardData = {
    user1: "Alice",
    user2: "Bob",
    compatibility: 72,
    sharedCount: 45,
    sharedFavorites: [
      { title: "Steins;Gate", score1: 10, score2: 9 },
      { title: "Attack on Titan", score1: 8, score2: 8 },
    ],
    divergences: ["Alice loves Romance, Bob doesn't"],
    profile1: makeProfile(),
    profile2: makeProfile({
      genres: [
        { name: "Romance", weight: 0.9, count: 50 },
        { name: "Slice of Life", weight: 0.7, count: 30 },
      ],
    }),
  };

  it("produces valid SVG with both usernames", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Alice");
    expect(svg).toContain("Bob");
  });

  it("shows compatibility percentage", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("72%");
    expect(svg).toContain("compatibility");
  });

  it("includes shared titles count", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("45 shared titles");
  });

  it("shows shared favorites", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("Steins;Gate");
    expect(svg).toContain("Shared Favorites");
  });

  it("shows divergences", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("Key Differences");
    expect(svg).toContain("Romance");
  });

  it("handles zero compatibility", () => {
    const svg = buildCompatCardSvg({ ...baseData, compatibility: 0 });

    expect(svg).toContain("0%");
  });

  it("handles no shared favorites", () => {
    const svg = buildCompatCardSvg({ ...baseData, sharedFavorites: [] });

    expect(svg).toContain("No shared 8+ favorites");
  });

  it("handles no divergences", () => {
    const svg = buildCompatCardSvg({ ...baseData, divergences: [] });

    expect(svg).toContain("No major differences");
  });
});

// sharp loads native binaries on first call
const SHARP_TIMEOUT = 15_000;

describe("svgToPng", () => {
  it("converts SVG to PNG buffer", { timeout: SHARP_TIMEOUT }, async () => {
    const svg = buildTasteCardSvg("TestUser", makeProfile());
    const png = await svgToPng(svg);

    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });
});

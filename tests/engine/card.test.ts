/** Unit tests for shareable card SVG generation */

import { describe, it, expect } from "vitest";
import {
  buildTasteCardSvg,
  buildCompatCardSvg,
  buildWrappedCardSvg,
  buildSeasonalRecapCardSvg,
  svgToPng,
  type CompatCardData,
  type WrappedCardData,
  type SeasonalRecapData,
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

  it("includes score distributions for both users", () => {
    const svg = buildCompatCardSvg(baseData);

    expect(svg).toContain("Alice Scores");
    expect(svg).toContain("Bob Scores");
  });
});

describe("buildWrappedCardSvg", () => {
  const baseData: WrappedCardData = {
    username: "TestUser",
    avatarB64: null,
    stats: {
      year: 2025,
      animeCount: 30,
      mangaCount: 10,
      totalEpisodes: 360,
      totalChapters: 500,
      avgScore: 7.5,
      scoredCount: 35,
      topRated: { title: "Steins;Gate", score: 10, coverUrl: null },
      controversial: {
        title: "Sword Art Online",
        userScore: 9,
        communityScore: 65,
        gap: 25,
        direction: "above",
        coverUrl: null,
      },
      topGenres: [
        { name: "Action", count: 20 },
        { name: "Drama", count: 15 },
        { name: "Comedy", count: 10 },
      ],
      scoreDistribution: { 7: 10, 8: 12, 9: 8, 10: 5 },
    },
  };

  it("produces valid SVG with username and year", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("TestUser");
    expect(svg).toContain("2025 Wrapped");
  });

  it("shows stat badges", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).toContain("30"); // anime count
    expect(svg).toContain("Anime");
    expect(svg).toContain("7.5"); // avg score
  });

  it("shows top genres", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).toContain("Top Genres");
    expect(svg).toContain("Action");
    expect(svg).toContain("Drama");
  });

  it("shows highlights", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).toContain("Highest Rated");
    expect(svg).toContain("Most Controversial");
    expect(svg).toContain("Steins;Gate");
  });

  it("shows consumption stats", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).toContain("Consumption");
    expect(svg).toContain("360");
    expect(svg).toContain("500");
  });

  it("fills all 4 stat badges for anime-only wrapped", () => {
    const data: WrappedCardData = {
      ...baseData,
      stats: {
        ...baseData.stats,
        mangaCount: 0,
        totalChapters: 0,
      },
    };
    const svg = buildWrappedCardSvg(data);

    // Should show Scored instead of empty badge
    expect(svg).toContain("Scored");
    expect(svg).toContain("35");
    // No blank badge boxes
    expect(svg).not.toMatch(/<rect[^>]*fill="#1e3044"[^>]*>[^<]*<rect[^>]*>[^<]*<text[^>]*><\/text>/);
  });

  it("handles no controversial pick", () => {
    const data = {
      ...baseData,
      stats: { ...baseData.stats, controversial: null },
    };
    const svg = buildWrappedCardSvg(data);

    expect(svg).toContain("No controversial picks");
  });

  it("renders cover art thumbnails when provided", () => {
    const fakeCover = "data:image/png;base64,AAAA";
    const data: WrappedCardData = {
      ...baseData,
      topRatedCoverB64: fakeCover,
      controversialCoverB64: fakeCover,
    };
    const svg = buildWrappedCardSvg(data);

    // Cover images rendered via clipPath + image elements
    const clipMatches = svg.match(/clipPath id="cover-/g);
    expect(clipMatches).toHaveLength(2);
    expect(svg).toContain(`href="${fakeCover}"`);
  });

  it("omits cover art when B64 is null", () => {
    const svg = buildWrappedCardSvg(baseData);

    expect(svg).not.toContain("clipPath id=\"cover-");
  });
});

describe("buildSeasonalRecapCardSvg", () => {
  const baseData: SeasonalRecapData = {
    username: "TestUser",
    season: "FALL",
    year: 2025,
    avatarB64: null,
    picked: 12,
    finished: 8,
    dropped: 2,
    watching: 2,
    avgScore: 7.8,
    topPicks: [
      { title: "Chainsaw Man", score: 9 },
      { title: "Spy x Family", score: 8 },
    ],
  };

  it("produces valid SVG with season label", () => {
    const svg = buildSeasonalRecapCardSvg(baseData);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("TestUser");
    expect(svg).toContain("Fall 2025 Recap");
  });

  it("shows stat badges", () => {
    const svg = buildSeasonalRecapCardSvg(baseData);

    expect(svg).toContain("Picked Up");
    expect(svg).toContain("12");
    expect(svg).toContain("Finished");
    expect(svg).toContain("8");
    expect(svg).toContain("Hit Rate");
  });

  it("shows top picks", () => {
    const svg = buildSeasonalRecapCardSvg(baseData);

    expect(svg).toContain("Top Picks");
    expect(svg).toContain("Chainsaw Man");
    expect(svg).toContain("9/10");
  });

  it("shows season average", () => {
    const svg = buildSeasonalRecapCardSvg(baseData);

    expect(svg).toContain("Season Average");
    expect(svg).toContain("7.8");
  });

  it("handles no top picks", () => {
    const data = { ...baseData, topPicks: [] };
    const svg = buildSeasonalRecapCardSvg(data);

    expect(svg).toContain("No scored titles");
  });

  it("handles zero entries", () => {
    const data = {
      ...baseData,
      picked: 0,
      finished: 0,
      dropped: 0,
      watching: 0,
      avgScore: 0,
    };
    const svg = buildSeasonalRecapCardSvg(data);

    expect(svg).toContain("<svg");
    expect(svg).toContain("No data");
  });

  it("renders cover art in top picks when provided", () => {
    const fakeCover = "data:image/png;base64,BBBB";
    const data: SeasonalRecapData = {
      ...baseData,
      topPicks: [
        { title: "Chainsaw Man", score: 9, coverB64: fakeCover },
        { title: "Spy x Family", score: 8 },
      ],
    };
    const svg = buildSeasonalRecapCardSvg(data);

    // First pick has cover, second does not
    const clipMatches = svg.match(/clipPath id="cover-/g);
    expect(clipMatches).toHaveLength(1);
    expect(svg).toContain(`href="${fakeCover}"`);
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

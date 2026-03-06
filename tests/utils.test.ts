/** Unit tests for shared utility functions */

import { describe, it, expect, afterEach } from "vitest";
import {
  getTitle,
  truncateDescription,
  getDefaultUsername,
  throwToolError,
  formatMediaSummary,
  isNsfwEnabled,
  resolveAlias,
  formatScore,
  detectScoreFormat,
  paginationFooter,
  resolveSeasonYear,
} from "../src/utils.js";
import { makeMedia } from "./fixtures.js";

describe("getTitle", () => {
  it("prefers English title", () => {
    expect(
      getTitle({ english: "Attack on Titan", romaji: "Shingeki", native: null }),
    ).toBe("Attack on Titan");
  });

  it("falls back to romaji when no English", () => {
    expect(
      getTitle({ english: null, romaji: "Shingeki no Kyojin", native: null }),
    ).toBe("Shingeki no Kyojin");
  });

  it("falls back to native when no English or romaji", () => {
    expect(getTitle({ english: null, romaji: null, native: "進撃の巨人" })).toBe(
      "進撃の巨人",
    );
  });

  it('returns "Unknown Title" when all null', () => {
    expect(getTitle({ english: null, romaji: null, native: null })).toBe(
      "Unknown Title",
    );
  });
});

describe("truncateDescription", () => {
  it('returns "No description available." for null', () => {
    expect(truncateDescription(null)).toBe("No description available.");
  });

  it('returns "No description available." for empty string', () => {
    expect(truncateDescription("")).toBe("No description available.");
  });

  it("returns text as-is when under maxLength", () => {
    expect(truncateDescription("A short description.", 500)).toBe(
      "A short description.",
    );
  });

  it("truncates at word boundary when space is near the end", () => {
    const text = "a ".repeat(300).trim(); // 599 chars of "a a a..."
    const result = truncateDescription(text, 100);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
  });

  it("hard-cuts when no space near the end", () => {
    // Single word longer than maxLength
    const text = "a".repeat(600);
    const result = truncateDescription(text, 100);
    expect(result).toBe("a".repeat(100) + "...");
  });

  it("strips HTML tags from description", () => {
    const html = "Hello <b>world</b> and <i>more</i>.";
    expect(truncateDescription(html)).toBe("Hello world and more.");
  });

  it("converts <br> tags to newlines", () => {
    const html = "Line one<br>Line two<br/>Line three";
    expect(truncateDescription(html)).toBe("Line one\nLine two\nLine three");
  });

  it("returns exact-length text without truncation", () => {
    const text = "x".repeat(500);
    expect(truncateDescription(text, 500)).toBe(text);
  });
});

describe("getDefaultUsername", () => {
  afterEach(() => {
    delete process.env.ANILIST_USERNAME;
  });

  it("returns provided username", () => {
    expect(getDefaultUsername("alice")).toBe("alice");
  });

  it("falls back to ANILIST_USERNAME env", () => {
    process.env.ANILIST_USERNAME = "envuser";
    expect(getDefaultUsername()).toBe("envuser");
  });

  it("prefers provided over env", () => {
    process.env.ANILIST_USERNAME = "envuser";
    expect(getDefaultUsername("explicit")).toBe("explicit");
  });

  it("throws when neither provided nor env set", () => {
    delete process.env.ANILIST_USERNAME;
    expect(() => getDefaultUsername()).toThrow("No username provided");
  });
});

describe("throwToolError", () => {
  it("throws UserError with message for Error instances", () => {
    const err = new Error("something broke");
    expect(() => throwToolError(err, "searching")).toThrow(
      "Error searching: something broke",
    );
  });

  it("throws UserError with generic message for non-Error values", () => {
    expect(() => throwToolError("string error", "fetching")).toThrow(
      "Unexpected error while fetching. Please try again.",
    );
  });

  it("throws UserError with generic message for null", () => {
    expect(() => throwToolError(null, "loading")).toThrow(
      "Unexpected error while loading. Please try again.",
    );
  });
});

describe("formatMediaSummary", () => {
  it("formats anime with episodes", () => {
    const result = formatMediaSummary(makeMedia({ episodes: 24 }));
    expect(result).toContain("24 episodes");
    expect(result).toContain("Test Anime");
    expect(result).toContain("URL:");
  });

  it("formats manga with chapters and volumes", () => {
    const media = {
      ...makeMedia(),
      episodes: null,
      chapters: 100,
      volumes: 10,
    };
    const result = formatMediaSummary(media);
    expect(result).toContain("100 chapters");
    expect(result).toContain("10 volumes");
  });

  it("shows [18+] for adult content", () => {
    const media = { ...makeMedia(), isAdult: true };
    expect(formatMediaSummary(media)).toContain("[18+]");
  });

  it("shows no [18+] for non-adult content", () => {
    expect(formatMediaSummary(makeMedia())).not.toContain("[18+]");
  });

  it('shows "No score" when meanScore is null', () => {
    const media = { ...makeMedia(), meanScore: null };
    expect(formatMediaSummary(media)).toContain("No score");
  });

  it('shows "No genres listed" when genres array is empty', () => {
    const media = makeMedia({ genres: [] });
    expect(formatMediaSummary(media)).toContain("No genres listed");
  });

  it("omits studio line when no studios", () => {
    const media = { ...makeMedia(), studios: { nodes: [] } };
    expect(formatMediaSummary(media)).not.toContain("Studio:");
  });

  it("omits length line when no episodes or chapters", () => {
    const media = { ...makeMedia(), episodes: null, chapters: null };
    expect(formatMediaSummary(media)).not.toContain("Length:");
  });

  it('shows "Unknown format" when format is null', () => {
    const media = { ...makeMedia(), format: null };
    expect(formatMediaSummary(media)).toContain("Unknown format");
  });

  it('shows "?" for year when no season or start date', () => {
    const media = {
      ...makeMedia(),
      seasonYear: null,
      startDate: { year: null, month: null, day: null },
    };
    expect(formatMediaSummary(media)).toContain("?");
  });
});

describe("getTitle - language preference", () => {
  afterEach(() => {
    delete process.env.ANILIST_TITLE_LANGUAGE;
  });

  const title = { english: "Attack on Titan", romaji: "Shingeki no Kyojin", native: "進撃の巨人" };

  it("defaults to English", () => {
    expect(getTitle(title)).toBe("Attack on Titan");
  });

  it("respects romaji preference", () => {
    process.env.ANILIST_TITLE_LANGUAGE = "romaji";
    expect(getTitle(title)).toBe("Shingeki no Kyojin");
  });

  it("respects native preference", () => {
    process.env.ANILIST_TITLE_LANGUAGE = "native";
    expect(getTitle(title)).toBe("進撃の巨人");
  });

  it("falls through when preferred is null", () => {
    process.env.ANILIST_TITLE_LANGUAGE = "romaji";
    expect(getTitle({ english: "Test", romaji: null, native: null })).toBe("Test");
  });

  it("is case insensitive", () => {
    process.env.ANILIST_TITLE_LANGUAGE = "ROMAJI";
    expect(getTitle(title)).toBe("Shingeki no Kyojin");
  });
});

describe("isNsfwEnabled", () => {
  afterEach(() => {
    delete process.env.ANILIST_NSFW;
  });

  it("returns false by default", () => {
    expect(isNsfwEnabled()).toBe(false);
  });

  it('returns true when set to "true"', () => {
    process.env.ANILIST_NSFW = "true";
    expect(isNsfwEnabled()).toBe(true);
  });

  it('returns true when set to "1"', () => {
    process.env.ANILIST_NSFW = "1";
    expect(isNsfwEnabled()).toBe(true);
  });

  it("returns false for other values", () => {
    process.env.ANILIST_NSFW = "yes";
    expect(isNsfwEnabled()).toBe(false);
  });
});

describe("resolveAlias", () => {
  it("resolves known abbreviation", () => {
    expect(resolveAlias("aot")).toBe("Attack on Titan");
  });

  it("is case insensitive", () => {
    expect(resolveAlias("JJK")).toBe("Jujutsu Kaisen");
  });

  it("returns original query for unknown alias", () => {
    expect(resolveAlias("some random query")).toBe("some random query");
  });

  it("resolves multiple aliases to correct titles", () => {
    expect(resolveAlias("csm")).toBe("Chainsaw Man");
    expect(resolveAlias("hxh")).toBe("Hunter x Hunter");
    expect(resolveAlias("mha")).toBe("My Hero Academia");
  });
});

describe("detectScoreFormat", () => {
  afterEach(() => {
    delete process.env.ANILIST_SCORE_FORMAT;
  });

  it("returns env override when set", async () => {
    process.env.ANILIST_SCORE_FORMAT = "POINT_100";
    const result = await detectScoreFormat(async () => "POINT_5");
    expect(result).toBe("POINT_100");
  });

  it("calls fetcher when no env override", async () => {
    const result = await detectScoreFormat(async () => "POINT_5");
    expect(result).toBe("POINT_5");
  });

  it("falls back to POINT_10 when fetcher throws", async () => {
    const result = await detectScoreFormat(async () => {
      throw new Error("API error");
    });
    expect(result).toBe("POINT_10");
  });

  it("skips fetcher when env override is set", async () => {
    process.env.ANILIST_SCORE_FORMAT = "POINT_3";
    let called = false;
    await detectScoreFormat(async () => {
      called = true;
      return "POINT_5";
    });
    expect(called).toBe(false);
  });
});

describe("formatScore", () => {
  it("shows Unscored for zero", () => {
    expect(formatScore(0, "POINT_10")).toBe("Unscored");
  });

  it("formats POINT_100", () => {
    expect(formatScore(8.5, "POINT_100")).toBe("85/100");
  });

  it("formats POINT_10_DECIMAL", () => {
    expect(formatScore(8.5, "POINT_10_DECIMAL")).toBe("8.5/10");
  });

  it("formats POINT_10", () => {
    expect(formatScore(8.5, "POINT_10")).toBe("9/10");
  });

  it("formats POINT_5 as stars", () => {
    expect(formatScore(8, "POINT_5")).toBe("★★★★☆");
  });

  it("formats POINT_3 high score", () => {
    expect(formatScore(9, "POINT_3")).toBe(":)");
  });

  it("formats POINT_3 mid score", () => {
    expect(formatScore(5, "POINT_3")).toBe(":|");
  });

  it("formats POINT_3 low score", () => {
    expect(formatScore(2, "POINT_3")).toBe(":(");
  });
});

describe("paginationFooter", () => {
  it("returns empty string for single page", () => {
    expect(paginationFooter(1, 10, 5, false)).toBe("");
  });

  it("shows page info with next hint", () => {
    const result = paginationFooter(1, 10, 25, true);
    expect(result).toContain("Page 1 of 3");
    expect(result).toContain("25 total");
    expect(result).toContain("Use page: 2 for more.");
  });

  it("omits next hint on last page", () => {
    const result = paginationFooter(3, 10, 25, false);
    expect(result).toContain("Page 3 of 3");
    expect(result).not.toContain("for more");
  });

  it("handles exact page boundary", () => {
    const result = paginationFooter(1, 10, 20, true);
    expect(result).toContain("Page 1 of 2");
  });
});

describe("resolveSeasonYear", () => {
  it("returns provided season and year", () => {
    expect(resolveSeasonYear("SUMMER", 2024)).toEqual({ season: "SUMMER", year: 2024 });
  });

  it("defaults year to current when only season given", () => {
    const result = resolveSeasonYear("FALL");
    expect(result.season).toBe("FALL");
    expect(result.year).toBe(new Date().getFullYear());
  });

  it("derives season from month when not provided", () => {
    const result = resolveSeasonYear(undefined, 2025);
    expect(result.year).toBe(2025);
    expect(result.season).toMatch(/^(WINTER|SPRING|SUMMER|FALL)$/);
  });

  it("defaults both to current when no args", () => {
    const result = resolveSeasonYear();
    expect(result.year).toBe(new Date().getFullYear());
    expect(result.season).toMatch(/^(WINTER|SPRING|SUMMER|FALL)$/);
  });
});

/** Unit tests for shared utility functions */

import { describe, it, expect, afterEach } from "vitest";
import {
  getTitle,
  truncateDescription,
  getDefaultUsername,
  formatToolError,
  formatMediaSummary,
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

describe("formatToolError", () => {
  it("formats Error instances with message", () => {
    const err = new Error("something broke");
    expect(formatToolError(err, "searching")).toBe(
      "Error searching: something broke",
    );
  });

  it("formats non-Error values with generic message", () => {
    expect(formatToolError("string error", "fetching")).toBe(
      "Unexpected error while fetching. Please try again.",
    );
  });

  it("formats null with generic message", () => {
    expect(formatToolError(null, "loading")).toBe(
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

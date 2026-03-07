/** Integration tests for discover tools (trending, genre browse, genre list) */

import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { trendingHandler, genreBrowseHandler, genreTagHandler } from "../helpers/handlers.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("anilist_trending", () => {
  it("returns trending results with ranking", async () => {
    const result = await callTool("anilist_trending", {
      type: "ANIME",
      limit: 10,
    });

    expect(result).toContain("Trending ANIME");
    expect(result).toContain("Test Anime");
    expect(result).toContain("1.");
  });

  it("shows empty message when no results", async () => {
    mswServer.use(trendingHandler([]));

    const result = await callTool("anilist_trending", {
      type: "ANIME",
      limit: 10,
    });

    expect(result).toContain("No trending anime found");
  });

  it("supports manga type", async () => {
    const result = await callTool("anilist_trending", {
      type: "MANGA",
      limit: 5,
    });

    expect(result).toContain("MANGA");
  });
});

describe("anilist_genres", () => {
  it("returns results for a genre", async () => {
    const result = await callTool("anilist_genres", {
      genre: "Action",
      type: "ANIME",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Action");
    expect(result).toContain("ANIME");
    expect(result).toContain("Test Anime");
  });

  it("shows filter details in header", async () => {
    const result = await callTool("anilist_genres", {
      genre: "Romance",
      type: "ANIME",
      year: 2024,
      status: "FINISHED",
      sort: "POPULARITY",
      limit: 10,
    });

    expect(result).toContain("Romance");
    expect(result).toContain("2024");
    expect(result).toContain("FINISHED");
  });

  it("shows empty message when no results", async () => {
    mswServer.use(genreBrowseHandler([]));

    const result = await callTool("anilist_genres", {
      genre: "Horror",
      type: "ANIME",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain('No anime found in genre "Horror"');
  });
});

describe("anilist_genre_list", () => {
  const savedNsfw = process.env.ANILIST_NSFW;

  afterEach(() => {
    if (savedNsfw === undefined) delete process.env.ANILIST_NSFW;
    else process.env.ANILIST_NSFW = savedNsfw;
  });

  it("returns genres and tags", async () => {
    const result = await callTool("anilist_genre_list", {});

    expect(result).toContain("AniList Genres");
    expect(result).toContain("Action");
    expect(result).toContain("Romance");
    expect(result).toContain("Content Tags");
    expect(result).toContain("Mecha");
    expect(result).toContain("Isekai");
  });

  it("filters adult tags by default", async () => {
    const result = await callTool("anilist_genre_list", {});

    expect(result).not.toContain("AdultTag");
  });

  it("includes adult tags when requested", async () => {
    const result = await callTool("anilist_genre_list", {
      includeAdultTags: true,
    });

    expect(result).toContain("AdultTag");
  });

  it("groups tags by category", async () => {
    const result = await callTool("anilist_genre_list", {});

    expect(result).toContain("## Theme");
  });

  it("handles empty collection", async () => {
    mswServer.use(genreTagHandler([], []));

    const result = await callTool("anilist_genre_list", {});

    expect(result).toContain("AniList Genres");
    expect(result).toContain("Content Tags");
  });

  it("filters to genres only", async () => {
    const result = await callTool("anilist_genre_list", { filter: "genres" });

    expect(result).toContain("AniList Genres");
    expect(result).toContain("Action");
    expect(result).not.toContain("Content Tags");
    expect(result).not.toContain("Mecha");
  });

  it("filters to tags only", async () => {
    const result = await callTool("anilist_genre_list", { filter: "tags" });

    expect(result).not.toContain("AniList Genres");
    expect(result).toContain("Content Tags");
    expect(result).toContain("Mecha");
  });

  it("filters tags by category", async () => {
    mswServer.use(
      genreTagHandler(
        ["Action"],
        [
          { name: "Mecha", description: "Giant robots", category: "Theme", isAdult: false },
          { name: "School", description: "Set in school", category: "Setting", isAdult: false },
        ],
      ),
    );

    const result = await callTool("anilist_genre_list", { category: "Theme" });

    expect(result).toContain("Mecha");
    expect(result).not.toContain("School");
    expect(result).not.toContain("Setting");
  });
});

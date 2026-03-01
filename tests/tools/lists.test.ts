/** Integration tests for list and stats tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { listHandler, statsHandler } from "../helpers/handlers.js";
import { makeEntry } from "../fixtures.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("anilist_list", () => {
  it("returns formatted entries with score and progress", async () => {
    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("testuser");
    expect(result).toContain("COMPLETED");
    expect(result).toContain("Test Anime");
    expect(result).toContain("Progress:");
  });

  it("shows empty message for empty list", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "PLANNING",
      sort: "UPDATED",
      limit: 10,
    });

    expect(result).toContain("no anime");
  });

  it("shows all entries when status is ALL", async () => {
    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "ALL",
      sort: "UPDATED",
      limit: 10,
    });

    expect(result).toContain("testuser");
    expect(result).toContain("ANIME list");
  });

  it("shows unscored entries correctly", async () => {
    const entries = [{ ...makeEntry({ id: 1 }), score: 0 }];
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Unscored");
  });

  it("truncates long notes with ellipsis", async () => {
    const longNote = "x".repeat(150);
    const entries = [{ ...makeEntry({ id: 1, score: 8 }), notes: longNote }];
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Notes:");
    expect(result).toContain("...");
    // Should contain first 100 chars but not all 150
    expect(result).not.toContain(longNote);
  });

  it("shows 'showing N' when list exceeds limit", async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: i + 1, score: 8 }),
    );
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "SCORE",
      limit: 3,
    });

    expect(result).toContain("5 entries");
    expect(result).toContain("showing 3");
  });

  it("shows empty message for ALL with empty list", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "ALL",
      sort: "UPDATED",
      limit: 10,
    });

    expect(result).toContain("list is empty");
  });

  it("sorts by TITLE alphabetically", async () => {
    const entries = [
      { ...makeEntry({ id: 1, score: 8 }), media: { ...makeEntry().media, title: { romaji: "Zelda", english: "Zelda", native: null } } },
      { ...makeEntry({ id: 2, score: 8 }), media: { ...makeEntry().media, title: { romaji: "Alpha", english: "Alpha", native: null } } },
    ];
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "TITLE",
      limit: 10,
    });

    const alphaPos = result.indexOf("Alpha");
    const zeldaPos = result.indexOf("Zelda");
    expect(alphaPos).toBeLessThan(zeldaPos);
  });

  it("sorts by PROGRESS descending", async () => {
    const entries = [
      { ...makeEntry({ id: 1, score: 8 }), progress: 3 },
      { ...makeEntry({ id: 2, score: 8 }), progress: 50 },
    ];
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "PROGRESS",
      limit: 10,
    });

    // Higher progress should appear first
    const pos50 = result.indexOf("50/");
    const pos3 = result.indexOf("3/");
    expect(pos50).toBeLessThan(pos3);
  });

  it("includes notes when present", async () => {
    const entries = [
      {
        ...makeEntry({ id: 1, score: 9 }),
        notes: "This was amazing!",
      },
    ];
    mswServer.use(listHandler(entries as never));

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "COMPLETED",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Notes:");
    expect(result).toContain("This was amazing!");
  });
});

describe("anilist_stats", () => {
  it("renders anime stats", async () => {
    const result = await callTool("anilist_stats", { username: "testuser" });

    expect(result).toContain("Stats for testuser");
    expect(result).toContain("Anime");
    expect(result).toContain("50 titles");
    expect(result).toContain("600 episodes");
    expect(result).toContain("Top Genres:");
    expect(result).toContain("Action");
    expect(result).toContain("Score Distribution:");
  });

  it("renders manga stats alongside anime", async () => {
    const result = await callTool("anilist_stats", { username: "testuser" });

    expect(result).toContain("Manga");
    expect(result).toContain("10 titles");
    expect(result).toContain("500 chapters");
  });

  it("renders manga-only user stats", async () => {
    mswServer.use(
      statsHandler({
        User: {
          id: 1,
          name: "mangafan",
          statistics: {
            anime: {
              count: 0,
              meanScore: 0,
              genres: [],
              scores: [],
              formats: [],
            },
            manga: {
              count: 30,
              meanScore: 7.5,
              chaptersRead: 3000,
              volumesRead: 200,
              genres: [
                { genre: "Drama", count: 15, meanScore: 8.0, chaptersRead: 1500 },
              ],
              scores: [{ score: 8, count: 10 }],
              formats: [{ format: "MANGA", count: 30 }],
            },
          },
        },
      }),
    );

    const result = await callTool("anilist_stats", { username: "mangafan" });
    expect(result).toContain("Manga");
    expect(result).toContain("3,000 chapters");
    expect(result).toContain("200 volumes");
    expect(result).not.toContain("## Anime");
  });

  it("handles user with no data", async () => {
    mswServer.use(
      statsHandler({
        User: {
          id: 1,
          name: "emptyuser",
          statistics: {
            anime: {
              count: 0,
              meanScore: 0,
              genres: [],
              scores: [],
              formats: [],
            },
            manga: {
              count: 0,
              meanScore: 0,
              genres: [],
              scores: [],
              formats: [],
            },
          },
        },
      }),
    );

    const result = await callTool("anilist_stats", { username: "emptyuser" });
    expect(result).toContain("no anime or manga statistics");
  });
});

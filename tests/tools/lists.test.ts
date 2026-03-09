/** Integration tests for list and stats tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { listHandler, listGroupsHandler, statsHandler, listLookupHandler } from "../helpers/handlers.js";
import { makeEntry } from "../fixtures.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

// Skip the parallel UserStats call in detectScoreFormat
const savedScoreFormat = process.env.ANILIST_SCORE_FORMAT;
beforeAll(async () => {
  process.env.ANILIST_SCORE_FORMAT = "POINT_10";
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => {
  if (savedScoreFormat === undefined) delete process.env.ANILIST_SCORE_FORMAT;
  else process.env.ANILIST_SCORE_FORMAT = savedScoreFormat;
  await cleanup();
});

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

// === Custom Lists ===

describe("anilist_list with CUSTOM status", () => {
  it("returns custom list entries", async () => {
    mswServer.use(
      listGroupsHandler([
        {
          name: "Completed",
          status: "COMPLETED",
          isCustomList: false,
          entries: [makeEntry({ id: 1, score: 9 })],
        },
        {
          name: "Favourites",
          status: "COMPLETED",
          isCustomList: true,
          entries: [makeEntry({ id: 2, score: 10 })],
        },
      ]),
    );

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "CUSTOM",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("custom lists");
    expect(result).toContain("Test Anime");
  });

  it("filters by custom list name", async () => {
    mswServer.use(
      listGroupsHandler([
        {
          name: "Top Picks",
          status: "COMPLETED",
          isCustomList: true,
          entries: [makeEntry({ id: 1, score: 10 })],
        },
        {
          name: "Rewatching",
          status: "CURRENT",
          isCustomList: true,
          entries: [makeEntry({ id: 2, score: 8 })],
        },
      ]),
    );

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "CUSTOM",
      customListName: "Top Picks",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Top Picks");
    expect(result).toContain("1 entries");
  });

  it("shows error when named custom list not found", async () => {
    mswServer.use(
      listGroupsHandler([
        {
          name: "Favourites",
          status: "COMPLETED",
          isCustomList: true,
          entries: [makeEntry({ id: 1 })],
        },
      ]),
    );

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "CUSTOM",
      customListName: "Nonexistent",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("not found");
    expect(result).toContain("Favourites");
  });

  it("shows empty message when custom list has no entries", async () => {
    mswServer.use(
      listGroupsHandler([
        {
          name: "Empty List",
          status: "COMPLETED",
          isCustomList: true,
          entries: [],
        },
      ]),
    );

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "CUSTOM",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("no entries");
  });

  it("shows empty message when no custom lists exist", async () => {
    mswServer.use(
      listGroupsHandler([
        {
          name: "Completed",
          status: "COMPLETED",
          isCustomList: false,
          entries: [makeEntry({ id: 1 })],
        },
      ]),
    );

    const result = await callTool("anilist_list", {
      username: "testuser",
      type: "ANIME",
      status: "CUSTOM",
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("no custom");
  });
});

// === Single-Entry Lookup ===

describe("anilist_lookup", () => {
  it("returns entry details when title is on the list", async () => {
    const entry = makeEntry({
      id: 42,
      score: 9,
      progress: 12,
      status: "COMPLETED",
    });
    mswServer.use(listLookupHandler(entry));

    const result = await callTool("anilist_lookup", {
      mediaId: 100,
      username: "testuser",
    });

    expect(result).toContain("Test Anime");
    expect(result).toContain("COMPLETED");
    expect(result).toContain("9/10");
    expect(result).toContain("12/12 ep");
    expect(result).toContain("Entry ID: 42");
  });

  it("shows not-on-list message when entry is missing", async () => {
    mswServer.use(listLookupHandler(null));

    const result = await callTool("anilist_lookup", {
      mediaId: 999,
      username: "testuser",
    });

    expect(result).toContain("not on testuser's list");
  });

  it("resolves title to media ID via search", async () => {
    const result = await callTool("anilist_lookup", {
      title: "Test Anime",
      username: "testuser",
    });

    expect(result).toContain("Test Anime");
    expect(result).toContain("Status:");
  });
});

// === Export Tool ===

describe("anilist_export", () => {
  it("returns CSV with header row", async () => {
    mswServer.use(listHandler([makeEntry({ id: 1 })]));

    const result = await callTool("anilist_export", {
      username: "testuser",
      type: "ANIME",
      format: "csv",
    });

    expect(result).toContain("title,type,format,status,score,progress");
    const lines = result.split("\n");
    expect(lines.length).toBe(2); // header + 1 row
  });

  it("returns valid JSON array", async () => {
    mswServer.use(listHandler([makeEntry({ id: 1 }), makeEntry({ id: 2 })]));

    const result = await callTool("anilist_export", {
      username: "testuser",
      type: "ANIME",
      format: "json",
    });

    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty("title");
    expect(parsed[0]).toHaveProperty("status");
    expect(parsed[0]).toHaveProperty("anilist_id");
  });

  it("returns message for empty list", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_export", {
      username: "emptyuser",
      type: "ANIME",
    });

    expect(result).toContain("no anime entries");
  });

  it("escapes commas in CSV titles", async () => {
    const entry = makeEntry({ id: 1 });
    entry.media.title.english = "Title, With Comma";
    mswServer.use(listHandler([entry]));

    const result = await callTool("anilist_export", {
      username: "testuser",
      type: "ANIME",
      format: "csv",
    });

    // Comma in title should be wrapped in quotes
    expect(result).toContain('"Title, With Comma"');
  });
});

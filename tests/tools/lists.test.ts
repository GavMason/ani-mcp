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

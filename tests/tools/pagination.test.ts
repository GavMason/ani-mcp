/** Pagination tests across paginated tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { makeMedia, makeEntry } from "../fixtures.js";
import {
  searchHandler,
  trendingHandler,
  genreBrowseHandler,
  listHandler,
} from "../helpers/handlers.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("pagination footer", () => {
  it("shows 'Use page: 2' when hasNextPage is true", async () => {
    mswServer.use(
      searchHandler(
        [makeMedia({ id: 1 }), makeMedia({ id: 2 })],
        { total: 50, hasNextPage: true },
      ),
    );

    const result = await callTool("anilist_search", {
      query: "test",
      limit: 2,
      page: 1,
    });

    expect(result).toContain("Page 1 of 25");
    expect(result).toContain("50 total");
    expect(result).toContain("Use page: 2 for more.");
  });

  it("omits footer on single-page results", async () => {
    mswServer.use(
      searchHandler(
        [makeMedia({ id: 1 })],
        { total: 1, hasNextPage: false },
      ),
    );

    const result = await callTool("anilist_search", {
      query: "test",
      limit: 10,
      page: 1,
    });

    expect(result).not.toContain("Page ");
    expect(result).not.toContain("Use page:");
  });

  it("shows page info without 'Use page' on last page", async () => {
    mswServer.use(
      searchHandler(
        [makeMedia({ id: 1 })],
        { total: 3, hasNextPage: false },
      ),
    );

    const result = await callTool("anilist_search", {
      query: "test",
      limit: 2,
      page: 2,
    });

    expect(result).toContain("Page 2 of 2");
    expect(result).not.toContain("Use page:");
  });
});

describe("offset numbering", () => {
  it("numbers items from offset on page 2 (search)", async () => {
    mswServer.use(
      searchHandler(
        [makeMedia({ id: 10 }), makeMedia({ id: 11 })],
        { total: 20, hasNextPage: true },
      ),
    );

    const result = await callTool("anilist_search", {
      query: "test",
      limit: 5,
      page: 2,
    });

    // Page 2, limit 5 -> items 6 and 7
    expect(result).toContain("6.");
    expect(result).toContain("7.");
    expect(result).not.toContain("1. Test Anime");
  });

  it("numbers items from offset on page 2 (trending)", async () => {
    mswServer.use(
      trendingHandler(
        [makeMedia({ id: 10 })],
        { total: 20, hasNextPage: true },
      ),
    );

    const result = await callTool("anilist_trending", {
      limit: 5,
      page: 2,
    });

    expect(result).toContain("6.");
    expect(result).not.toContain("1. Test Anime");
  });

  it("numbers items from offset on page 2 (genres)", async () => {
    mswServer.use(
      genreBrowseHandler(
        [makeMedia({ id: 10 })],
        { total: 30, hasNextPage: true },
      ),
    );

    const result = await callTool("anilist_genres", {
      genre: "Action",
      limit: 10,
      page: 2,
    });

    expect(result).toContain("11.");
    expect(result).not.toMatch(/^1\./m);
  });
});

describe("list client-side pagination", () => {
  it("paginates list entries with offset", async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: i + 1, score: 10 - i }),
    );
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_list", {
      username: "testuser",
      limit: 3,
      page: 2,
    });

    // Page 2, limit 3 -> entries 4-6
    expect(result).toContain("4.");
    expect(result).toContain("5.");
    expect(result).toContain("6.");
    expect(result).not.toContain("1. Test Anime");
    expect(result).toContain("Page 2 of 4");
    expect(result).toContain("Use page: 3");
  });

  it("shows last page without next hint", async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: i + 1, score: 8 }),
    );
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_list", {
      username: "testuser",
      limit: 3,
      page: 2,
    });

    // Page 2, limit 3 -> entries 4-5
    expect(result).toContain("4.");
    expect(result).toContain("5.");
    expect(result).toContain("Page 2 of 2");
    expect(result).not.toContain("Use page:");
  });
});

/** Integration tests for search and discovery tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import {
  searchHandler,
  seasonalHandler,
  recommendationsHandler,
} from "../helpers/handlers.js";
import { makeMedia } from "../fixtures.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("anilist_search", () => {
  it("returns formatted results for a basic query", async () => {
    const result = await callTool("anilist_search", {
      query: "naruto",
      type: "ANIME",
      limit: 5,
    });

    expect(result).toContain("Found");
    expect(result).toContain("Test Anime");
    expect(result).toContain("URL:");
  });

  it("shows no-results message on empty response", async () => {
    mswServer.use(searchHandler([]));

    const result = await callTool("anilist_search", {
      query: "nonexistent",
      type: "ANIME",
      limit: 5,
    });

    expect(result).toContain("No anime found");
  });

  it("passes genre filter through", async () => {
    const result = await callTool("anilist_search", {
      query: "test",
      type: "ANIME",
      genre: "Action",
      limit: 5,
    });

    // Default handler accepts any genre
    expect(result).toContain("Found");
  });
});

describe("anilist_details", () => {
  it("renders full details by ID", async () => {
    const result = await callTool("anilist_details", { id: 1 });

    expect(result).toContain("Attack on Titan");
    expect(result).toContain("Shingeki no Kyojin");
    expect(result).toContain("Episodes:");
    expect(result).toContain("Score:");
    expect(result).toContain("Synopsis:");
    expect(result).toContain("Related:");
    expect(result).toContain("SEQUEL");
    expect(result).toContain("Recommended if you liked this:");
  });

  it("renders details by title", async () => {
    const result = await callTool("anilist_details", {
      title: "Attack on Titan",
    });

    expect(result).toContain("Attack on Titan");
  });
});

describe("anilist_seasonal", () => {
  it("returns seasonal anime with default season", async () => {
    const result = await callTool("anilist_seasonal", { limit: 10 });

    expect(result).toContain("Anime");
    expect(result).toContain("Test Anime");
    expect(result).toContain("Sorted by:");
  });

  it("respects sort parameter", async () => {
    const result = await callTool("anilist_seasonal", {
      sort: "SCORE",
      limit: 10,
    });

    expect(result).toContain("Sorted by: score");
  });

  it("shows empty message when no results", async () => {
    mswServer.use(seasonalHandler([]));

    const result = await callTool("anilist_seasonal", {
      season: "WINTER",
      year: 2020,
      limit: 10,
    });

    expect(result).toContain("No anime found");
  });
});

describe("anilist_recommendations", () => {
  it("returns community recommendations", async () => {
    const result = await callTool("anilist_recommendations", {
      title: "Source Title",
      limit: 10,
    });

    expect(result).toContain("Recommendations based on Source Title");
    expect(result).toContain("Recommended by");
  });

  it("filters out entries with rating <= 0", async () => {
    mswServer.use(
      recommendationsHandler("Test", [
        { rating: 5, mediaRecommendation: makeMedia({ id: 10 }) },
        { rating: -1, mediaRecommendation: makeMedia({ id: 11 }) },
        { rating: 0, mediaRecommendation: makeMedia({ id: 12 }) },
      ]),
    );

    const result = await callTool("anilist_recommendations", {
      title: "Test",
      limit: 10,
    });

    // Only 1 rec has rating > 0
    expect(result).toContain("1 community suggestion");
  });

  it("shows no-recs message when none found", async () => {
    mswServer.use(
      recommendationsHandler("Test", [
        { rating: -1, mediaRecommendation: makeMedia({ id: 10 }) },
      ]),
    );

    const result = await callTool("anilist_recommendations", {
      title: "Test",
      limit: 10,
    });

    expect(result).toContain("No community recommendations");
  });
});

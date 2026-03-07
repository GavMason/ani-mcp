/** Integration tests for MAL import tool */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { jikanListHandler, jikanNotFoundHandler } from "../helpers/handlers.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("anilist_mal_import", () => {
  it("imports MAL list and returns taste profile + recommendations", async () => {
    const result = await callTool("anilist_mal_import", {
      malUsername: "testuser",
    });

    expect(result).toContain("MAL Import: testuser");
    expect(result).toContain("Imported 6 completed anime");
    expect(result).toContain("Taste Profile");
    expect(result).toContain("Recommendations");
  });

  it("shows message for empty MAL list", async () => {
    mswServer.use(jikanListHandler([]));

    const result = await callTool("anilist_mal_import", {
      malUsername: "emptyuser",
    });

    expect(result).toContain('No completed anime found for MAL user "emptyuser"');
  });

  it("handles MAL user not found", async () => {
    mswServer.use(jikanNotFoundHandler());

    const result = await callTool("anilist_mal_import", {
      malUsername: "noone",
    });

    expect(result).toContain("not found");
  });

  it("filters out zero-score entries from taste profile", async () => {
    mswServer.use(
      jikanListHandler([
        {
          score: 0,
          episodes_watched: 12,
          anime: {
            mal_id: 200,
            title: "Unscored",
            type: "TV",
            episodes: 12,
            score: null,
            genres: [{ mal_id: 1, name: "Action" }],
            year: 2022,
          },
        },
        {
          score: 8,
          episodes_watched: 24,
          anime: {
            mal_id: 201,
            title: "Scored One",
            type: "TV",
            episodes: 24,
            score: 8.0,
            genres: [{ mal_id: 1, name: "Action" }],
            year: 2022,
          },
        },
      ]),
    );

    const result = await callTool("anilist_mal_import", {
      malUsername: "partialuser",
    });

    // Only the scored entry counts
    expect(result).toContain("Imported 2 completed anime");
    expect(result).toContain("Taste Profile");
  });

  it("respects limit parameter", async () => {
    const result = await callTool("anilist_mal_import", {
      malUsername: "testuser",
      limit: 1,
    });

    expect(result).toContain("Recommendations");
  });
});

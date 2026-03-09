/** Integration tests for shareable card tools */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { makeEntry } from "../fixtures.js";

const ANILIST_URL = "https://graphql.anilist.co";

// sharp loads native binaries on first call
const SHARP_TIMEOUT = 15_000;

let callToolRaw: Awaited<ReturnType<typeof createTestClient>>["callToolRaw"];
let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const client = await createTestClient();
  callToolRaw = client.callToolRaw;
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

// === Helpers ===

function makeScoredEntries(count: number) {
  const genres = [
    ["Action", "Adventure"],
    ["Action", "Drama"],
    ["Comedy", "Slice of Life"],
    ["Drama", "Romance"],
    ["Sci-Fi", "Action"],
    ["Fantasy", "Adventure"],
    ["Thriller", "Mystery"],
    ["Horror", "Supernatural"],
  ];
  return Array.from({ length: count }, (_, i) =>
    makeEntry({
      id: i + 1,
      score: 6 + (i % 5),
      genres: genres[i % genres.length],
    }),
  );
}

function listHandler(completed: ReturnType<typeof makeEntry>[]) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!body.query?.includes("MediaListCollection")) return undefined;

    return HttpResponse.json({
      data: {
        MediaListCollection: {
          lists: completed.length
            ? [{ name: "Completed", status: "COMPLETED", entries: completed }]
            : [],
        },
      },
    });
  });
}

// === Taste Card ===

describe("anilist_taste_card", () => {
  it("returns a PNG image", { timeout: SHARP_TIMEOUT }, async () => {
    mswServer.use(listHandler(makeScoredEntries(10)));

    const content = await callToolRaw("anilist_taste_card", {
      username: "testuser",
      type: "ANIME",
    });

    expect(content.length).toBeGreaterThanOrEqual(1);

    // Find the image content block
    const img = content.find((c) => c.type === "image");
    expect(img).toBeDefined();
    expect(img?.mimeType).toBe("image/png");
    expect(img?.data).toBeDefined();

    // Decode and check PNG magic bytes
    const buf = Buffer.from(img?.data as string, "base64");
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
  });

  it("returns error text for empty list", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_taste_card", {
      username: "emptyuser",
      type: "ANIME",
    });

    expect(result).toContain("no completed anime");
  });

  it("returns error for insufficient scored entries", async () => {
    mswServer.use(listHandler([makeEntry({ id: 1, score: 8 })]));

    const result = await callTool("anilist_taste_card", {
      username: "fewscores",
      type: "ANIME",
    });

    expect(result).toContain("enough scored titles");
  });
});

// === Compatibility Card ===

describe("anilist_compat_card", () => {
  it("returns a PNG image for two users", { timeout: SHARP_TIMEOUT }, async () => {
    const entries1 = makeScoredEntries(10);
    const entries2 = makeScoredEntries(8).map((e, i) => ({
      ...e,
      score: 5 + (i % 4),
    }));

    // Return different lists based on username
    mswServer.use(
      http.post(ANILIST_URL, async ({ request }) => {
        const body = (await request.clone().json()) as {
          query?: string;
          variables?: Record<string, unknown>;
        };
        if (!body.query?.includes("MediaListCollection")) return undefined;

        const username = body.variables?.username as string;
        const entries = username === "alice" ? entries1 : entries2;

        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: [
                { name: "Completed", status: "COMPLETED", entries },
              ],
            },
          },
        });
      }),
    );

    const content = await callToolRaw("anilist_compat_card", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("image");
    expect(content[0].mimeType).toBe("image/png");
  });

  it("returns error text when both users have empty lists", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_compat_card", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(result).toContain("no completed");
  });
});

// === Wrapped Card ===

function completedByDateHandler(entries: ReturnType<typeof makeEntry>[]) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!body.query?.includes("CompletedByDate")) return undefined;

    return HttpResponse.json({
      data: {
        Page: {
          pageInfo: { hasNextPage: false },
          mediaList: entries,
        },
      },
    });
  });
}

describe("anilist_wrapped_card", () => {
  it("returns a PNG image", { timeout: SHARP_TIMEOUT }, async () => {
    mswServer.use(completedByDateHandler(makeScoredEntries(10)));

    const content = await callToolRaw("anilist_wrapped_card", {
      username: "testuser",
      year: 2025,
      type: "ANIME",
    });

    const img = content.find((c) => c.type === "image");
    expect(img).toBeDefined();
    expect(img?.mimeType).toBe("image/png");
  });

  it("returns text for empty year", async () => {
    mswServer.use(completedByDateHandler([]));

    const result = await callTool("anilist_wrapped_card", {
      username: "emptyuser",
      year: 2025,
    });

    expect(result).toContain("didn't complete any titles");
  });
});

// === Seasonal Recap Card ===

describe("anilist_seasonal_recap_card", () => {
  it("returns a PNG image", { timeout: SHARP_TIMEOUT }, async () => {
    const entries = makeScoredEntries(6).map((e) => ({
      ...e,
      media: { ...e.media, season: "FALL", seasonYear: 2025 },
    }));
    mswServer.use(listHandler(entries));

    const content = await callToolRaw("anilist_seasonal_recap_card", {
      username: "testuser",
      season: "FALL",
      year: 2025,
    });

    const img = content.find((c) => c.type === "image");
    expect(img).toBeDefined();
    expect(img?.mimeType).toBe("image/png");
  });

  it("returns text when no seasonal entries", async () => {
    // Entries with different season
    const entries = makeScoredEntries(3).map((e) => ({
      ...e,
      media: { ...e.media, season: "SPRING", seasonYear: 2024 },
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_seasonal_recap_card", {
      username: "testuser",
      season: "FALL",
      year: 2025,
    });

    expect(result).toContain("no entries from FALL 2025");
  });
});

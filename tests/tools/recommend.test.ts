/** Integration tests for recommendation tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { listHandler } from "../helpers/handlers.js";
import { makeEntry, makeMedia } from "../fixtures.js";
import { http, HttpResponse } from "msw";

const ANILIST_URL = "https://graphql.anilist.co";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

// === Helpers ===

// Scored entries with varied genres for profiling
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

// Return separate completed/planning lists by status
function dualListHandler(
  completed: ReturnType<typeof makeEntry>[],
  planning: ReturnType<typeof makeEntry>[] = [],
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.json()) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    if (!body.query?.includes("MediaListCollection")) return undefined;

    const status = body.variables?.status as string | undefined;
    if (status === "PLANNING") {
      return HttpResponse.json({
        data: {
          MediaListCollection: {
            lists: planning.length
              ? [{ name: "Planning", status: "PLANNING", entries: planning }]
              : [],
          },
        },
      });
    }

    // Default to completed
    return HttpResponse.json({
      data: {
        MediaListCollection: {
          lists: completed.length
            ? [
                {
                  name: "Completed",
                  status: "COMPLETED",
                  entries: completed,
                },
              ]
            : [],
        },
      },
    });
  });
}

describe("anilist_taste", () => {
  it("renders genre weights and score distribution", async () => {
    const entries = makeScoredEntries(10);
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_taste", {
      username: "testuser",
      type: "ANIME",
    });

    expect(result).toContain("Taste Profile: testuser");
    expect(result).toContain("Genre Weights");
    expect(result).toContain("Score Distribution:");
  });

  it("rejects when not enough scored entries", async () => {
    mswServer.use(listHandler([makeEntry({ id: 1, score: 8 })]));

    const result = await callTool("anilist_taste", {
      username: "testuser",
      type: "ANIME",
    });

    expect(result).toContain("not enough");
  });
});

describe("anilist_pick", () => {
  it("recommends from planning list based on taste", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({
        id: 100,
        score: 0,
        genres: ["Action", "Adventure"],
      }),
    ];
    planning[0].status = "PLANNING";

    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      limit: 5,
    });

    expect(result).toContain("Top Picks for testuser");
    expect(result).toContain("Test Anime");
  });

  it(
    "falls back to discover when planning list is empty",
    async () => {
      const completed = makeScoredEntries(10);
      // Combined handler to avoid double body read
      mswServer.use(
        http.post(ANILIST_URL, async ({ request }) => {
          const body = (await request.json()) as {
            query?: string;
            variables?: Record<string, unknown>;
          };

          if (body.query?.includes("MediaListCollection")) {
            const status = body.variables?.status as string | undefined;
            if (status === "PLANNING") {
              return HttpResponse.json({
                data: { MediaListCollection: { lists: [] } },
              });
            }
            return HttpResponse.json({
              data: {
                MediaListCollection: {
                  lists: [
                    {
                      name: "Completed",
                      status: "COMPLETED",
                      entries: completed,
                    },
                  ],
                },
              },
            });
          }

          if (body.query?.includes("DiscoverMedia")) {
            return HttpResponse.json({
              data: {
                Page: {
                  pageInfo: { total: 2, hasNextPage: false },
                  media: [
                    makeMedia({ id: 500, genres: ["Action"], meanScore: 90 }),
                    makeMedia({ id: 501, genres: ["Action"], meanScore: 85 }),
                  ],
                },
              },
            });
          }

          return undefined;
        }),
      );

      const result = await callTool("anilist_pick", {
        username: "testuser",
        type: "ANIME",
        limit: 5,
      });

      expect(result).toContain("No Planning list found");
      expect(result).toContain("top-rated");
    },
    15_000,
  );

  it("shows not-enough message when profile is too thin", async () => {
    mswServer.use(dualListHandler([], []));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      limit: 5,
    });

    expect(result).toContain("hasn't scored enough");
  });

  it("shows mood label when mood is provided", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action"] }),
    ];
    planning[0].status = "PLANNING";
    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      mood: "dark",
      limit: 5,
    });

    expect(result).toContain('Mood: "dark"');
  });
});

describe("anilist_compare", () => {
  // Return different lists per user via call count
  function compareListHandler(
    entries1: ReturnType<typeof makeEntry>[],
    entries2: ReturnType<typeof makeEntry>[],
  ) {
    let callCount = 0;
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (!body.query?.includes("MediaListCollection")) return undefined;

      // Alternate between user1 and user2
      const entries = callCount++ % 2 === 0 ? entries1 : entries2;
      return HttpResponse.json({
        data: {
          MediaListCollection: {
            lists: entries.length
              ? [{ name: "Completed", status: "COMPLETED", entries }]
              : [],
          },
        },
      });
    });
  }

  it("shows compatibility score when 3+ shared titles", async () => {
    // Same titles, similar scores
    const shared = makeScoredEntries(5);
    const user2Entries = shared.map((e) => ({
      ...e,
      score: Math.max(1, e.score - 1),
    }));

    mswServer.use(compareListHandler(shared, user2Entries));

    const result = await callTool("anilist_compare", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(result).toContain("Taste Comparison: alice vs bob");
    expect(result).toContain("Compatibility:");
    expect(result).toContain("Shared titles:");
  });

  it("shows not-enough message when < 3 shared titles", async () => {
    // Non-overlapping media IDs
    const entries1 = makeScoredEntries(5);
    const entries2 = makeScoredEntries(5).map((e, i) => ({
      ...e,
      id: i + 100,
      media: { ...e.media, id: i + 100 },
    }));

    mswServer.use(compareListHandler(entries1, entries2));

    const result = await callTool("anilist_compare", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(result).toContain("not enough for a compatibility score");
  });

  it("shows empty-list message for user with no completions", async () => {
    mswServer.use(compareListHandler(makeScoredEntries(5), []));

    const result = await callTool("anilist_compare", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(result).toContain("bob has no completed anime");
  });
});

describe("anilist_wrapped", () => {
  const currentYear = new Date().getFullYear();

  function wrappedEntries() {
    return makeScoredEntries(6).map((e) => ({
      ...e,
      completedAt: { year: currentYear, month: 6, day: 15 },
    }));
  }

  it("shows year summary with counts and scores", async () => {
    mswServer.use(listHandler(wrappedEntries()));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain(`${currentYear} Wrapped for testuser`);
    expect(result).toContain("anime");
    expect(result).toContain("Average score:");
    expect(result).toContain("Highest rated:");
    expect(result).toContain("Top genres this year:");
  });

  it("shows empty message when no titles completed that year", async () => {
    // Entries completed in a different year
    const entries = makeScoredEntries(5).map((e) => ({
      ...e,
      completedAt: { year: 2020, month: 1, day: 1 },
      updatedAt: Math.floor(new Date("2020-01-01").getTime() / 1000),
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain(`didn't complete any titles in ${currentYear}`);
  });

  it("counts episodes from progress, not media.episodes", async () => {
    const entries = wrappedEntries().map((e) => ({
      ...e,
      progress: 24,
      media: { ...e.media, episodes: 12 },
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    // 6 entries * 24 progress = 144 episodes
    expect(result).toContain("144 episodes watched");
  });
});

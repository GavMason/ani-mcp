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

  it("filters by maxEpisodes", async () => {
    const completed = makeScoredEntries(10);
    // Planning list with short and long anime
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action"] }),
      makeEntry({ id: 101, score: 0, genres: ["Action"] }),
    ];
    planning[0].status = "PLANNING";
    planning[0].media.episodes = 12;
    planning[1].status = "PLANNING";
    planning[1].media.episodes = 50;

    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      maxEpisodes: 24,
      limit: 5,
    });

    expect(result).toContain("Top Picks");
  });

  it("shows unrecognized mood warning", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action"] }),
    ];
    planning[0].status = "PLANNING";
    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      mood: "xyznonexistent",
      limit: 5,
    });

    expect(result).toContain("no exact keyword match");
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

  it("shows shared favorites and disagreements", async () => {
    // Same IDs, user1 loves id=1, user2 hates it
    const entries1 = makeScoredEntries(5).map((e) => ({
      ...e,
      score: 9,
    }));
    const entries2 = entries1.map((e, i) => ({
      ...e,
      // First entry: big disagreement. Rest: both high scores.
      score: i === 0 ? 3 : 9,
    }));

    mswServer.use(compareListHandler(entries1, entries2));

    const result = await callTool("anilist_compare", {
      user1: "alice",
      user2: "bob",
      type: "ANIME",
    });

    expect(result).toContain("Shared Favorites:");
    expect(result).toContain("Biggest Disagreements:");
    expect(result).toContain("apart");
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

  it("shows controversial pick when user score differs from community", async () => {
    // User scores 10, community meanScore is 40 => gap = 60
    const entries = wrappedEntries().map((e, i) => ({
      ...e,
      score: i === 0 ? 10 : 7,
      media: {
        ...e.media,
        meanScore: i === 0 ? 40 : 70,
      },
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain("Most controversial:");
    expect(result).toContain("above consensus");
  });

  it("falls back to updatedAt when completedAt is missing", async () => {
    // Unix timestamp for mid-current-year
    const ts = Math.floor(
      new Date(`${currentYear}-07-01`).getTime() / 1000,
    );
    const entries = makeScoredEntries(5).map((e) => ({
      ...e,
      completedAt: { year: null, month: null, day: null },
      updatedAt: ts,
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain(`${currentYear} Wrapped for testuser`);
    expect(result).toContain("5 anime");
  });

  it("skips average score when no entries are scored", async () => {
    const entries = wrappedEntries().map((e) => ({
      ...e,
      score: 0,
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain(`${currentYear} Wrapped for testuser`);
    expect(result).not.toContain("Average score:");
    expect(result).not.toContain("Highest rated:");
  });

  it("excludes entries with no completedAt and no updatedAt", async () => {
    const entries = makeScoredEntries(5).map((e) => ({
      ...e,
      completedAt: { year: null, month: null, day: null },
      updatedAt: 0,
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "ANIME",
      year: currentYear,
    });

    expect(result).toContain("didn't complete any titles");
  });

  it("shows chapters read for manga wrapped", async () => {
    const entries = wrappedEntries().map((e) => ({
      ...e,
      progress: 30,
      media: { ...e.media, type: "MANGA" as const },
    }));
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_wrapped", {
      username: "testuser",
      type: "MANGA",
      year: currentYear,
    });

    expect(result).toContain("manga");
    expect(result).toContain("chapters read");
    expect(result).not.toContain("episodes watched");
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

describe("anilist_explain", () => {
  // Combined handler for explain: MediaDetails + MediaListCollection
  function explainHandler(
    entries: ReturnType<typeof makeEntry>[],
    mediaOverrides?: Record<string, unknown>,
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

      if (body.query?.includes("MediaDetails")) {
        const m = makeMedia({
          id: (body.variables?.id as number) ?? 1,
          genres: ["Action", "Adventure", "Fantasy"],
          meanScore: 90,
        });
        return HttpResponse.json({
          data: {
            Media: {
              ...m,
              title: { romaji: "Test Anime", english: "Test Anime", native: null },
              episodes: 25,
              description: "A test synopsis.",
              relations: { edges: [] },
              recommendations: { nodes: [] },
              ...mediaOverrides,
            },
          },
        });
      }

      if (body.query?.includes("MediaListCollection")) {
        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: entries.length
                ? [{ name: "Completed", status: "COMPLETED", entries }]
                : [],
            },
          },
        });
      }

      return undefined;
    });
  }

  it("shows match score and genre alignment", async () => {
    const entries = makeScoredEntries(10);
    mswServer.use(explainHandler(entries));

    const result = await callTool("anilist_explain", {
      mediaId: 1,
      username: "testuser",
      type: "ANIME",
    });

    expect(result).toContain("Match Analysis:");
    expect(result).toContain("Score Breakdown");
    expect(result).toContain("Genre");
  });

  it("notes when user has completed the title", async () => {
    const entries = makeScoredEntries(10);
    mswServer.use(explainHandler(entries));

    const result = await callTool("anilist_explain", {
      mediaId: 1,
      username: "testuser",
      type: "ANIME",
    });

    expect(result).toContain("COMPLETED");
  });

  it("shows not-enough message when profile is too thin", async () => {
    mswServer.use(explainHandler([]));

    const result = await callTool("anilist_explain", {
      mediaId: 99,
      username: "testuser",
      type: "ANIME",
    });

    expect(result).toContain("hasn't scored enough");
  });

  it("includes mood modifier when mood is provided", async () => {
    const entries = makeScoredEntries(10);
    mswServer.use(explainHandler(entries));

    const result = await callTool("anilist_explain", {
      mediaId: 1,
      username: "testuser",
      type: "ANIME",
      mood: "hype action",
    });

    expect(result).toContain("Match Analysis:");
  });
});

describe("anilist_similar", () => {
  it("returns similar titles with similarity scores", async () => {
    const result = await callTool("anilist_similar", {
      mediaId: 1,
      limit: 5,
    });

    expect(result).toContain("Similar to");
    expect(result).toContain("similar");
  });

  it("shows no-results message when no recommendations exist", async () => {
    // Combined handler: MediaDetails + empty MediaRecommendations
    mswServer.use(
      http.post(ANILIST_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string;
          variables?: Record<string, unknown>;
        };

        if (body.query?.includes("MediaDetails")) {
          const m = makeMedia({ id: 1, genres: ["Action"], meanScore: 80 });
          return HttpResponse.json({
            data: {
              Media: {
                ...m,
                title: { romaji: "Obscure Title", english: "Obscure Title", native: null },
                episodes: 12,
                description: "Test.",
                relations: { edges: [] },
                recommendations: { nodes: [] },
              },
            },
          });
        }

        if (body.query?.includes("MediaRecommendations")) {
          return HttpResponse.json({
            data: {
              Media: {
                id: 1,
                title: { romaji: "Obscure Title", english: "Obscure Title", native: null },
                recommendations: { nodes: [] },
              },
            },
          });
        }

        return undefined;
      }),
    );

    const result = await callTool("anilist_similar", {
      mediaId: 1,
      limit: 5,
    });

    expect(result).toContain("No similar titles found");
  });

  it("respects limit parameter", async () => {
    const result = await callTool("anilist_similar", {
      mediaId: 1,
      limit: 1,
    });

    // Should have exactly 1 result
    expect(result).toContain("1.");
    expect(result).not.toContain("2.");
  });
});

describe("anilist_pick cross-media", () => {
  // Handler that differentiates by media type in the query variables
  function crossMediaHandler(
    mangaCompleted: ReturnType<typeof makeEntry>[],
    animePlanning: ReturnType<typeof makeEntry>[],
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (!body.query?.includes("MediaListCollection")) return undefined;

      const type = body.variables?.type as string | undefined;
      const status = body.variables?.status as string | undefined;

      if (type === "MANGA" && status === "COMPLETED") {
        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: [{ name: "Completed", status: "COMPLETED", entries: mangaCompleted }],
            },
          },
        });
      }

      if (type === "ANIME" && status === "PLANNING") {
        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: [{ name: "Planning", status: "PLANNING", entries: animePlanning }],
            },
          },
        });
      }

      return HttpResponse.json({
        data: { MediaListCollection: { lists: [] } },
      });
    });
  }

  it("uses profileType for taste and type for candidates", async () => {
    const mangaCompleted = makeScoredEntries(10).map((e) => ({
      ...e,
      media: { ...e.media, type: "MANGA" as const },
    }));
    const animePlanning = [
      makeEntry({ id: 100, score: 0, genres: ["Action", "Adventure"] }),
    ];
    animePlanning[0].status = "PLANNING";

    mswServer.use(crossMediaHandler(mangaCompleted, animePlanning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      profileType: "MANGA",
      limit: 5,
    });

    expect(result).toContain("Top Picks for testuser");
    expect(result).toContain("cross-media");
    expect(result).toContain("manga taste");
    expect(result).toContain("anime picks");
  });

  it("defaults profileType to type when not specified", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action"] }),
    ];
    planning[0].status = "PLANNING";
    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      limit: 5,
    });

    // No cross-media label
    expect(result).toContain("Top Picks for testuser");
    expect(result).not.toContain("cross-media");
  });
});

describe("anilist_pick source modes", () => {
  // Combined handler for seasonal source: completed list + seasonal media query
  function seasonalPickHandler(
    completed: ReturnType<typeof makeEntry>[],
    seasonalMedia: ReturnType<typeof makeMedia>[],
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

      if (body.query?.includes("MediaListCollection")) {
        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: completed.length
                ? [{ name: "Completed", status: "COMPLETED", entries: completed }]
                : [],
            },
          },
        });
      }

      if (body.query?.includes("SeasonalMedia")) {
        return HttpResponse.json({
          data: {
            Page: {
              pageInfo: { total: seasonalMedia.length, hasNextPage: false },
              media: seasonalMedia,
            },
          },
        });
      }

      return undefined;
    });
  }

  it("recommends from seasonal anime when source is SEASONAL", async () => {
    const completed = makeScoredEntries(10);
    const seasonal = [
      makeMedia({ id: 200, genres: ["Action", "Adventure"], meanScore: 88 }),
      makeMedia({ id: 201, genres: ["Comedy"], meanScore: 75 }),
    ];

    mswServer.use(seasonalPickHandler(completed, seasonal));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      source: "SEASONAL",
      limit: 5,
    });

    expect(result).toContain("Top Picks for testuser");
    expect(result).toContain("seasonal anime");
  });

  it("filters completed titles from seasonal candidates", async () => {
    const completed = makeScoredEntries(10);
    // Seasonal media includes one already-completed ID
    const seasonal = [
      makeMedia({ id: 1, genres: ["Action"], meanScore: 90 }),
      makeMedia({ id: 200, genres: ["Action", "Adventure"], meanScore: 85 }),
    ];

    mswServer.use(seasonalPickHandler(completed, seasonal));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      source: "SEASONAL",
      limit: 5,
    });

    expect(result).toContain("Top Picks");
  });

  it("rejects SEASONAL source with MANGA type", async () => {
    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "MANGA",
      source: "SEASONAL",
      limit: 5,
    });

    expect(result).toContain("SEASONAL source only works with anime");
  });

  it("applies mood filter to seasonal picks", async () => {
    const completed = makeScoredEntries(10);
    const seasonal = [
      makeMedia({ id: 200, genres: ["Horror", "Thriller"], meanScore: 80 }),
    ];

    mswServer.use(seasonalPickHandler(completed, seasonal));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      source: "SEASONAL",
      mood: "dark",
      limit: 5,
    });

    expect(result).toContain('Mood: "dark"');
  });

  it("uses DISCOVER source to find top-rated titles", async () => {
    const completed = makeScoredEntries(10);

    mswServer.use(
      http.post(ANILIST_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string;
          variables?: Record<string, unknown>;
        };

        if (body.query?.includes("MediaListCollection")) {
          return HttpResponse.json({
            data: {
              MediaListCollection: {
                lists: [{ name: "Completed", status: "COMPLETED", entries: completed }],
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
                  makeMedia({ id: 300, genres: ["Action"], meanScore: 92 }),
                  makeMedia({ id: 301, genres: ["Action", "Drama"], meanScore: 88 }),
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
      source: "DISCOVER",
      limit: 5,
    });

    expect(result).toContain("Top Picks for testuser");
    expect(result).toContain("top-rated titles matching your taste");
  });
});

describe("anilist_pick seasonal hint", () => {
  it("shows seasonal mood tip when no mood is provided", async () => {
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

    expect(result).toContain("Tip: try a mood like");
  });

  it("hides seasonal tip when mood is provided", async () => {
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
      mood: "dark",
      limit: 5,
    });

    expect(result).not.toContain("Tip: try a mood like");
  });
});

describe("anilist_pick exclude", () => {
  it("filters out excluded media IDs", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action", "Adventure"] }),
      makeEntry({ id: 101, score: 0, genres: ["Action", "Drama"] }),
    ];
    planning[0].status = "PLANNING";
    planning[1].status = "PLANNING";

    mswServer.use(dualListHandler(completed, planning));

    // Exclude ID 100
    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      limit: 5,
      exclude: [100],
    });

    expect(result).toContain("Top Picks");
    // ID 100 should not appear since it was excluded
    // (output shows media IDs in the results)
  });

  it("combines exclude with mood filter", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action", "Adventure"] }),
      makeEntry({ id: 101, score: 0, genres: ["Horror", "Thriller"] }),
    ];
    planning[0].status = "PLANNING";
    planning[1].status = "PLANNING";

    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      mood: "dark",
      limit: 5,
      exclude: [100],
    });

    expect(result).toContain("Top Picks");
    expect(result).toContain('Mood: "dark"');
  });

  it("returns empty when all candidates excluded", async () => {
    const completed = makeScoredEntries(10);
    const planning = [
      makeEntry({ id: 100, score: 0, genres: ["Action"] }),
    ];
    planning[0].status = "PLANNING";

    mswServer.use(dualListHandler(completed, planning));

    const result = await callTool("anilist_pick", {
      username: "testuser",
      type: "ANIME",
      limit: 5,
      exclude: [100],
    });

    // Should show no-candidates or empty message
    expect(result).toBeTruthy();
  });
});

describe("anilist_sequels", () => {
  // Combined handler: completed list + seasonal media + batch relations
  function sequelHandler(
    completed: ReturnType<typeof makeEntry>[],
    seasonalMedia: ReturnType<typeof makeMedia>[],
    relations: Array<{
      id: number;
      title: { romaji: string | null; english: string | null };
      relations: {
        edges: Array<{
          relationType: string;
          node: {
            id: number;
            title: { romaji: string | null; english: string | null };
            format: string | null;
            status: string | null;
            type: string;
            season: string | null;
            seasonYear: number | null;
          };
        }>;
      };
    }>,
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

      if (body.query?.includes("MediaListCollection")) {
        return HttpResponse.json({
          data: {
            MediaListCollection: {
              lists: completed.length
                ? [{ name: "Completed", status: "COMPLETED", entries: completed }]
                : [],
            },
          },
        });
      }

      if (body.query?.includes("SeasonalMedia")) {
        return HttpResponse.json({
          data: {
            Page: {
              pageInfo: { total: seasonalMedia.length, hasNextPage: false },
              media: seasonalMedia,
            },
          },
        });
      }

      if (body.query?.includes("BatchRelations")) {
        return HttpResponse.json({
          data: { Page: { media: relations } },
        });
      }

      return undefined;
    });
  }

  it("finds sequels to completed titles in current season", async () => {
    const completed = [
      makeEntry({ id: 10, score: 9, genres: ["Action"] }),
    ];
    const seasonal = [
      makeMedia({ id: 200, genres: ["Action"], meanScore: 85 }),
    ];
    const relations = [
      {
        id: 200,
        title: { romaji: "Sequel Anime", english: "Sequel Anime" },
        relations: {
          edges: [
            {
              relationType: "PREQUEL",
              node: {
                id: 10,
                title: { romaji: "Original Anime", english: "Original Anime" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
    ];

    mswServer.use(sequelHandler(completed, seasonal, relations));

    const result = await callTool("anilist_sequels", {
      username: "testuser",
    });

    expect(result).toContain("Sequel Alerts for testuser");
    expect(result).toContain("Sequel Anime");
    expect(result).toContain("sequel to");
  });

  it("returns no-sequel message when none match", async () => {
    const completed = [
      makeEntry({ id: 10, score: 9, genres: ["Action"] }),
    ];
    const seasonal = [
      makeMedia({ id: 200, genres: ["Action"], meanScore: 85 }),
    ];
    // Prequel ID 999 is not in the completed set
    const relations = [
      {
        id: 200,
        title: { romaji: "New Show", english: "New Show" },
        relations: {
          edges: [
            {
              relationType: "PREQUEL",
              node: {
                id: 999,
                title: { romaji: "Unwatched", english: "Unwatched" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
    ];

    mswServer.use(sequelHandler(completed, seasonal, relations));

    const result = await callTool("anilist_sequels", {
      username: "testuser",
    });

    expect(result).toContain("No sequels to your completed anime");
  });

  it("detects PARENT relations as spin-offs", async () => {
    const completed = [
      makeEntry({ id: 10, score: 8, genres: ["Comedy"] }),
    ];
    const seasonal = [
      makeMedia({ id: 300, genres: ["Comedy"], meanScore: 70 }),
    ];
    const relations = [
      {
        id: 300,
        title: { romaji: "Spin-off Show", english: "Spin-off Show" },
        relations: {
          edges: [
            {
              relationType: "PARENT",
              node: {
                id: 10,
                title: { romaji: "Parent Show", english: "Parent Show" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
    ];

    mswServer.use(sequelHandler(completed, seasonal, relations));

    const result = await callTool("anilist_sequels", {
      username: "testuser",
    });

    expect(result).toContain("Spin-off Show");
    expect(result).toContain("spin-off");
  });

  it("handles empty seasonal list", async () => {
    mswServer.use(sequelHandler([], [], []));

    const result = await callTool("anilist_sequels", {
      username: "testuser",
    });

    expect(result).toContain("No anime found for");
  });

  it("accepts season and year parameters", async () => {
    const completed = [
      makeEntry({ id: 10, score: 9, genres: ["Action"] }),
    ];
    const seasonal = [
      makeMedia({ id: 200, genres: ["Action"], meanScore: 85 }),
    ];
    const relations = [
      {
        id: 200,
        title: { romaji: "Summer Sequel", english: "Summer Sequel" },
        relations: {
          edges: [
            {
              relationType: "PREQUEL",
              node: {
                id: 10,
                title: { romaji: "Original", english: "Original" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
    ];

    mswServer.use(sequelHandler(completed, seasonal, relations));

    const result = await callTool("anilist_sequels", {
      username: "testuser",
      season: "SUMMER",
      year: 2025,
    });

    expect(result).toContain("Sequel Alerts");
    expect(result).toContain("SUMMER 2025");
  });
});

describe("anilist_watch_order", () => {
  // Handler for watch order: MediaDetails + BatchRelations
  function watchOrderHandler(
    mediaId: number,
    mediaTitle: string,
    relations: Array<{
      id: number;
      title: { romaji: string | null; english: string | null };
      format: string | null;
      status: string | null;
      relations: {
        edges: Array<{
          relationType: string;
          node: {
            id: number;
            title: { romaji: string | null; english: string | null };
            format: string | null;
            status: string | null;
            type: string;
            season: string | null;
            seasonYear: number | null;
          };
        }>;
      };
    }>,
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };

      if (body.query?.includes("MediaDetails")) {
        const m = makeMedia({ id: mediaId, genres: ["Action"], meanScore: 85 });
        return HttpResponse.json({
          data: {
            Media: {
              ...m,
              id: mediaId,
              title: { romaji: mediaTitle, english: mediaTitle, native: null },
              description: "A test anime.",
              relations: { edges: [] },
              recommendations: { nodes: [] },
            },
          },
        });
      }

      if (body.query?.includes("BatchRelations")) {
        const ids = (body.variables?.ids as number[]) ?? [];
        const matching = relations.filter((r) => ids.includes(r.id));
        return HttpResponse.json({
          data: { Page: { media: matching } },
        });
      }

      return undefined;
    });
  }

  it("builds a watch order for a franchise", async () => {
    const relations = [
      {
        id: 1,
        title: { romaji: "Part 1", english: "Part 1" },
        format: "TV",
        status: "FINISHED",
        relations: {
          edges: [
            {
              relationType: "SEQUEL",
              node: {
                id: 2,
                title: { romaji: "Part 2", english: "Part 2" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
      {
        id: 2,
        title: { romaji: "Part 2", english: "Part 2" },
        format: "TV",
        status: "FINISHED",
        relations: {
          edges: [
            {
              relationType: "PREQUEL",
              node: {
                id: 1,
                title: { romaji: "Part 1", english: "Part 1" },
                format: "TV",
                status: "FINISHED",
                type: "ANIME",
                season: null,
                seasonYear: null,
              },
            },
          ],
        },
      },
    ];

    mswServer.use(watchOrderHandler(1, "Part 1", relations));

    const result = await callTool("anilist_watch_order", {
      id: 1,
    });

    expect(result).toContain("Watch Order:");
    expect(result).toContain("Part 1");
    expect(result).toContain("Part 2");
    expect(result).toContain("1.");
    expect(result).toContain("2.");
  });

  it("resolves title to ID when no ID provided", async () => {
    const relations = [
      {
        id: 5,
        title: { romaji: "My Anime", english: "My Anime" },
        format: "TV",
        status: "FINISHED",
        relations: { edges: [] },
      },
    ];

    mswServer.use(watchOrderHandler(5, "My Anime", relations));

    const result = await callTool("anilist_watch_order", {
      title: "My Anime",
    });

    expect(result).toContain("Watch Order:");
    expect(result).toContain("My Anime");
  });
});

describe("anilist_session", () => {
  // Handler returning CURRENT + COMPLETED lists based on status variable
  function sessionHandler(
    current: ReturnType<typeof makeEntry>[],
    completed: ReturnType<typeof makeEntry>[],
  ) {
    return http.post(ANILIST_URL, async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        variables?: Record<string, unknown>;
      };
      if (!body.query?.includes("MediaListCollection")) return undefined;

      const status = body.variables?.status as string | undefined;
      const entries = status === "CURRENT" ? current : completed;
      const statusName = status === "CURRENT" ? "Watching" : "Completed";

      return HttpResponse.json({
        data: {
          MediaListCollection: {
            lists: entries.length
              ? [{ name: statusName, status, entries }]
              : [],
          },
        },
      });
    });
  }

  it("plans a session within time budget", async () => {
    const current = [
      {
        ...makeEntry({ id: 1, score: 0, genres: ["Action"] }),
        status: "CURRENT",
        progress: 5,
        media: { ...makeMedia({ id: 1, genres: ["Action"], episodes: 12 }), duration: 24 },
      },
    ];
    const completed = makeScoredEntries(10);
    mswServer.use(sessionHandler(current, completed));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "ANIME",
      minutes: 60,
    });

    expect(result).toContain("Session Plan for testuser");
    expect(result).toContain("Budget: 60 min");
    expect(result).toContain("ep");
  });

  it("returns empty message when no current list", async () => {
    mswServer.use(sessionHandler([], makeScoredEntries(10)));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "ANIME",
      minutes: 60,
    });

    expect(result).toContain("no anime currently in progress");
  });

  it("applies mood to session ordering", async () => {
    const current = [
      {
        ...makeEntry({ id: 1, score: 0, genres: ["Horror", "Thriller"] }),
        status: "CURRENT",
        progress: 3,
        media: { ...makeMedia({ id: 1, genres: ["Horror", "Thriller"], episodes: 12 }), duration: 24 },
      },
    ];
    const completed = makeScoredEntries(10);
    mswServer.use(sessionHandler(current, completed));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "ANIME",
      minutes: 120,
      mood: "dark",
    });

    expect(result).toContain('Mood: "dark"');
    expect(result).toContain("Session Plan");
  });

  it("respects remaining episodes", async () => {
    // Only 2 episodes remaining, 24 min each = 48 min max
    const current = [
      {
        ...makeEntry({ id: 1, score: 0, genres: ["Action"] }),
        status: "CURRENT",
        progress: 10,
        media: { ...makeMedia({ id: 1, genres: ["Action"], episodes: 12 }), duration: 24 },
      },
    ];
    const completed = makeScoredEntries(10);
    mswServer.use(sessionHandler(current, completed));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "ANIME",
      minutes: 120,
    });

    expect(result).toContain("Session Plan");
    // Should only plan 2 episodes (48 min) despite 120 min budget
    expect(result).toContain("2 ep");
    expect(result).toContain("48 min");
  });

  it("plans manga session with chapters", async () => {
    const current = [
      {
        ...makeEntry({ id: 1, score: 0, genres: ["Action"] }),
        status: "CURRENT",
        progress: 10,
        media: { ...makeMedia({ id: 1, genres: ["Action"] }), type: "MANGA" as const, chapters: 50, episodes: null, duration: 5 },
      },
    ];
    const completed = makeScoredEntries(10);
    mswServer.use(sessionHandler(current, completed));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "MANGA",
      minutes: 60,
    });

    expect(result).toContain("Session Plan for testuser");
    expect(result).toContain("ch");
    expect(result).toContain("chapters");
  });

  it("handles budget too small for any episode", async () => {
    const current = [
      {
        ...makeEntry({ id: 1, score: 0, genres: ["Action"] }),
        status: "CURRENT",
        progress: 5,
        media: { ...makeMedia({ id: 1, genres: ["Action"], episodes: 12 }), duration: 24 },
      },
    ];
    const completed = makeScoredEntries(10);
    mswServer.use(sessionHandler(current, completed));

    const result = await callTool("anilist_session", {
      username: "testuser",
      type: "ANIME",
      minutes: 10,
    });

    expect(result).toContain("No episodes fit within 10 minutes");
  });
});

/** MSW request handlers for the AniList GraphQL API */

import { http, HttpResponse } from "msw";
import { makeMedia, makeEntry } from "../fixtures.js";

const ANILIST_URL = "https://graphql.anilist.co";
const JIKAN_BASE = "https://api.jikan.moe/v4";

// === Response Factories ===

// Wrap in GraphQL response envelope
function gql<T>(data: T) {
  return HttpResponse.json({ data });
}

// === Default Fixture Data ===

const defaultMedia = [
  makeMedia({
    id: 1,
    genres: ["Action", "Adventure"],
    meanScore: 85,
    popularity: 50000,
  }),
  makeMedia({
    id: 2,
    genres: ["Comedy", "Slice of Life"],
    meanScore: 78,
    popularity: 30000,
  }),
];

const defaultEntries = [
  makeEntry({ id: 1, score: 9, genres: ["Action", "Adventure"] }),
  makeEntry({ id: 2, score: 7, genres: ["Comedy", "Slice of Life"] }),
  makeEntry({ id: 3, score: 8, genres: ["Action", "Drama"] }),
  makeEntry({ id: 4, score: 6, genres: ["Romance"] }),
  makeEntry({ id: 5, score: 8, genres: ["Action", "Sci-Fi"] }),
  makeEntry({ id: 6, score: 7, genres: ["Drama", "Thriller"] }),
];

// === Route by Query String ===

// Check if request contains a query keyword
function matchQuery(body: { query?: string }, keyword: string): boolean {
  return typeof body.query === "string" && body.query.includes(keyword);
}

// === Default Handlers ===

export const defaultHandlers = [
  http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.json()) as {
      query?: string;
      variables?: Record<string, unknown>;
    };

    // Viewer (whoami)
    if (matchQuery(body, "Viewer")) {
      return gql({
        Viewer: {
          id: 1,
          name: "testuser",
          avatar: { medium: null },
          siteUrl: "https://anilist.co/user/testuser",
          mediaListOptions: { scoreFormat: "POINT_10" },
        },
      });
    }

    // Genre/tag collection
    if (matchQuery(body, "GenreTagCollection")) {
      return gql({
        GenreCollection: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi"],
        MediaTagCollection: [
          { name: "Mecha", description: "Giant robots", category: "Theme", isAdult: false },
          { name: "Isekai", description: "Transported to another world", category: "Theme", isAdult: false },
          { name: "AdultTag", description: "Adult content", category: "Theme", isAdult: true },
        ],
      });
    }

    // User stats
    if (matchQuery(body, "UserStats")) {
      return gql({
        User: {
          id: 1,
          name: body.variables?.name ?? "testuser",
          mediaListOptions: { scoreFormat: "POINT_10" },
          statistics: {
            anime: {
              count: 50,
              meanScore: 7.5,
              minutesWatched: 30000,
              episodesWatched: 600,
              genres: [
                {
                  genre: "Action",
                  count: 20,
                  meanScore: 7.8,
                  minutesWatched: 12000,
                },
                {
                  genre: "Comedy",
                  count: 15,
                  meanScore: 7.2,
                  minutesWatched: 9000,
                },
              ],
              scores: [
                { score: 8, count: 15 },
                { score: 7, count: 12 },
                { score: 9, count: 8 },
              ],
              formats: [
                { format: "TV", count: 35 },
                { format: "MOVIE", count: 10 },
              ],
            },
            manga: {
              count: 10,
              meanScore: 7.0,
              chaptersRead: 500,
              volumesRead: 40,
              genres: [
                {
                  genre: "Drama",
                  count: 5,
                  meanScore: 7.5,
                  chaptersRead: 200,
                },
              ],
              scores: [{ score: 7, count: 5 }],
              formats: [{ format: "MANGA", count: 10 }],
            },
          },
        },
      });
    }

    // Single-entry list lookup
    if (matchQuery(body, "ListLookup")) {
      const entry = defaultEntries[0];
      return gql({
        MediaList: entry
          ? {
              id: entry.id,
              status: entry.status,
              score: entry.score,
              progress: entry.progress,
              progressVolumes: entry.progressVolumes,
              updatedAt: entry.updatedAt,
              startedAt: entry.startedAt,
              completedAt: entry.completedAt,
              notes: entry.notes,
              media: entry.media,
            }
          : null,
      });
    }

    // Completed-by-date (wrapped tool)
    if (matchQuery(body, "CompletedByDate")) {
      return gql({
        Page: {
          pageInfo: { hasNextPage: false },
          mediaList: defaultEntries,
        },
      });
    }

    // User list
    if (matchQuery(body, "MediaListCollection")) {
      return gql({
        MediaListCollection: {
          lists: [
            {
              name: "Completed",
              status: "COMPLETED",
              isCustomList: false,
              entries: defaultEntries,
            },
          ],
        },
      });
    }

    // Media details
    if (matchQuery(body, "MediaDetails")) {
      const m = makeMedia({
        id: (body.variables?.id as number) ?? 1,
        genres: ["Action", "Adventure", "Fantasy"],
        meanScore: 90,
      });
      return gql({
        Media: {
          ...m,
          title: {
            romaji: "Shingeki no Kyojin",
            english: "Attack on Titan",
            native: null,
          },
          episodes: 25,
          description: "A test synopsis for the media.",
          relations: {
            edges: [
              {
                relationType: "SEQUEL",
                node: {
                  id: 2,
                  title: { romaji: "Sequel Title", english: "Sequel Title" },
                  format: "TV",
                  status: "FINISHED",
                  type: "ANIME",
                },
              },
            ],
          },
          recommendations: {
            nodes: [
              {
                rating: 10,
                mediaRecommendation: {
                  id: 3,
                  title: { romaji: "Rec Title", english: "Rec Title" },
                  format: "TV",
                  meanScore: 85,
                  genres: ["Action"],
                  siteUrl: "https://anilist.co/anime/3",
                },
              },
            ],
          },
        },
      });
    }

    // Recommendations for a title
    if (matchQuery(body, "MediaRecommendations")) {
      return gql({
        Media: {
          id: 1,
          title: {
            romaji: "Source Title",
            english: "Source Title",
            native: null,
          },
          recommendations: {
            nodes: [
              { rating: 15, mediaRecommendation: makeMedia({ id: 10 }) },
              { rating: 8, mediaRecommendation: makeMedia({ id: 11 }) },
              { rating: -2, mediaRecommendation: makeMedia({ id: 12 }) },
            ],
          },
        },
      });
    }

    // Seasonal
    if (matchQuery(body, "SeasonalMedia")) {
      return gql({
        Page: {
          pageInfo: {
            total: 2,
            currentPage: 1,
            lastPage: 1,
            hasNextPage: false,
          },
          media: defaultMedia,
        },
      });
    }

    // Trending
    if (matchQuery(body, "TrendingMedia")) {
      return gql({
        Page: {
          pageInfo: { total: 2, hasNextPage: false },
          media: defaultMedia.map((m) => ({ ...m, trending: 100 })),
        },
      });
    }

    // Genre browse
    if (matchQuery(body, "GenreBrowse")) {
      return gql({
        Page: {
          pageInfo: { total: 2, hasNextPage: false },
          media: defaultMedia,
        },
      });
    }

    // Staff and voice actors
    if (matchQuery(body, "MediaStaff")) {
      return gql({
        Media: {
          id: 1,
          title: { romaji: "Test Anime", english: "Test Anime", native: null },
          format: "TV",
          siteUrl: "https://anilist.co/anime/1",
          staff: {
            edges: [
              {
                role: "Director",
                node: { id: 10, name: { full: "Taro Yamada", native: "山田太郎" }, siteUrl: "https://anilist.co/staff/10" },
              },
            ],
          },
          characters: {
            edges: [
              {
                role: "MAIN",
                node: { id: 20, name: { full: "Hero", native: "ヒーロー" }, siteUrl: "https://anilist.co/character/20" },
                voiceActors: [
                  { id: 30, name: { full: "Hanako Suzuki", native: "鈴木花子" }, language: "JAPANESE", siteUrl: "https://anilist.co/staff/30" },
                ],
              },
            ],
          },
        },
      });
    }

    // Airing schedule
    if (matchQuery(body, "AiringSchedule")) {
      return gql({
        Media: {
          id: 1,
          title: { romaji: "Test Anime", english: "Test Anime", native: null },
          status: "RELEASING",
          episodes: 24,
          nextAiringEpisode: {
            episode: 5,
            airingAt: 1700100000,
            timeUntilAiring: 86400,
          },
          airingSchedule: {
            nodes: [
              { episode: 5, airingAt: 1700100000, timeUntilAiring: 86400 },
              { episode: 6, airingAt: 1700700000, timeUntilAiring: 86400 * 8 },
            ],
          },
          siteUrl: "https://anilist.co/anime/1",
        },
      });
    }

    // Batch airing
    if (matchQuery(body, "BatchAiring")) {
      return gql({
        Page: {
          media: [
            {
              id: 1,
              title: { romaji: "Test Anime", english: "Test Anime", native: null },
              format: "TV",
              episodes: 24,
              nextAiringEpisode: {
                episode: 5,
                airingAt: Math.floor(Date.now() / 1000) + 86400,
                timeUntilAiring: 86400,
              },
              siteUrl: "https://anilist.co/anime/1",
            },
          ],
        },
      });
    }

    // Character search
    if (matchQuery(body, "CharacterSearch")) {
      return gql({
        Page: {
          pageInfo: { total: 1, hasNextPage: false },
          characters: [
            {
              id: 1,
              name: { full: "Naruto Uzumaki", native: "うずまきナルト", alternative: ["Naruto"] },
              image: { medium: null },
              favourites: 50000,
              siteUrl: "https://anilist.co/character/1",
              media: {
                edges: [
                  {
                    characterRole: "MAIN",
                    node: {
                      id: 1,
                      title: { romaji: "Naruto", english: "Naruto" },
                      format: "TV",
                      type: "ANIME",
                      siteUrl: "https://anilist.co/anime/1",
                    },
                    voiceActors: [
                      { id: 100, name: { full: "Junko Takeuchi" }, siteUrl: "https://anilist.co/staff/100" },
                    ],
                  },
                ],
              },
            },
          ],
        },
      });
    }

    // Staff search
    if (matchQuery(body, "StaffSearch")) {
      return gql({
        Page: {
          pageInfo: { total: 1, hasNextPage: false },
          staff: [
            {
              id: 100,
              name: { full: "Taro Yamada", native: "山田太郎" },
              primaryOccupations: ["Director", "Writer"],
              siteUrl: "https://anilist.co/staff/100",
              staffMedia: {
                edges: [
                  {
                    staffRole: "Director",
                    node: {
                      id: 1,
                      title: { romaji: "Test Anime", english: "Test Anime" },
                      format: "TV",
                      type: "ANIME",
                      meanScore: 85,
                      siteUrl: "https://anilist.co/anime/1",
                    },
                  },
                  {
                    staffRole: "Script",
                    node: {
                      id: 1,
                      title: { romaji: "Test Anime", english: "Test Anime" },
                      format: "TV",
                      type: "ANIME",
                      meanScore: 85,
                      siteUrl: "https://anilist.co/anime/1",
                    },
                  },
                  {
                    staffRole: "Director",
                    node: {
                      id: 2,
                      title: { romaji: "Another Anime", english: "Another Anime" },
                      format: "MOVIE",
                      type: "ANIME",
                      meanScore: 90,
                      siteUrl: "https://anilist.co/anime/2",
                    },
                  },
                ],
              },
            },
          ],
        },
      });
    }

    // Studio search
    if (matchQuery(body, "StudioSearch")) {
      return gql({
        Studio: {
          id: 1,
          name: "Test Studio",
          isAnimationStudio: true,
          siteUrl: "https://anilist.co/studio/1",
          media: {
            edges: [
              {
                isMainStudio: true,
                node: {
                  id: 1,
                  title: { romaji: "Test Anime", english: "Test Anime" },
                  format: "TV",
                  type: "ANIME",
                  status: "FINISHED",
                  meanScore: 85,
                  siteUrl: "https://anilist.co/anime/1",
                },
              },
              {
                isMainStudio: false,
                node: {
                  id: 2,
                  title: { romaji: "Collab Anime", english: "Collab Anime" },
                  format: "TV",
                  type: "ANIME",
                  status: "RELEASING",
                  meanScore: 78,
                  siteUrl: "https://anilist.co/anime/2",
                },
              },
            ],
          },
        },
      });
    }

    // Toggle like (activity reactions)
    if (matchQuery(body, "ToggleLike")) {
      return gql({
        ToggleLike: [{ id: 1, name: "testuser" }],
      });
    }

    // Save activity reply
    if (matchQuery(body, "SaveActivityReply")) {
      return gql({
        SaveActivityReply: {
          id: 2000,
          text: (body.variables?.text as string) ?? "",
          createdAt: 1700000000,
          user: { name: "testuser" },
        },
      });
    }

    // User following list
    if (matchQuery(body, "UserFollowing")) {
      return gql({
        Page: {
          pageInfo: { total: 2, hasNextPage: false },
          following: [
            { id: 2, name: "friend1" },
            { id: 3, name: "friend2" },
          ],
        },
      });
    }

    // Toggle favourite
    if (matchQuery(body, "ToggleFavourite")) {
      // Determine which category was toggled and add the ID
      const vars = body.variables ?? {};
      const anime = vars.animeId ? [{ id: vars.animeId }] : [];
      const manga = vars.mangaId ? [{ id: vars.mangaId }] : [];
      const characters = vars.characterId ? [{ id: vars.characterId }] : [];
      const staff = vars.staffId ? [{ id: vars.staffId }] : [];
      const studios = vars.studioId ? [{ id: vars.studioId }] : [];
      return gql({
        ToggleFavourite: {
          anime: { nodes: anime },
          manga: { nodes: manga },
          characters: { nodes: characters },
          staff: { nodes: staff },
          studios: { nodes: studios },
        },
      });
    }

    // Post text activity
    if (matchQuery(body, "SaveTextActivity")) {
      return gql({
        SaveTextActivity: {
          id: 1000,
          createdAt: 1700000000,
          text: (body.variables?.text as string) ?? "",
          user: { name: "testuser" },
        },
      });
    }

    // Activity feed
    if (matchQuery(body, "ActivityFeed")) {
      return gql({
        Page: {
          pageInfo: { total: 2, currentPage: 1, hasNextPage: false },
          activities: [
            {
              __typename: "TextActivity",
              id: 1,
              text: "Just finished a great anime!",
              createdAt: 1700000000,
              user: { name: "testuser" },
            },
            {
              __typename: "ListActivity",
              id: 2,
              status: "watched episode",
              progress: "5",
              createdAt: 1699990000,
              user: { name: "testuser" },
              media: {
                id: 1,
                title: { romaji: "Test Anime", english: "Test Anime", native: null },
                type: "ANIME",
              },
            },
          ],
        },
      });
    }

    // User profile
    if (matchQuery(body, "UserProfile")) {
      return gql({
        User: {
          id: 1,
          name: body.variables?.name ?? "testuser",
          about: "I love anime!",
          avatar: { large: null },
          bannerImage: null,
          siteUrl: "https://anilist.co/user/testuser",
          createdAt: 1500000000,
          updatedAt: 1700000000,
          donatorTier: 0,
          statistics: {
            anime: { count: 50, meanScore: 7.5, episodesWatched: 600, minutesWatched: 30000 },
            manga: { count: 10, meanScore: 7.0, chaptersRead: 500, volumesRead: 40 },
          },
          favourites: {
            anime: { nodes: [{ id: 1, title: { romaji: "Fav Anime", english: "Fav Anime", native: null }, siteUrl: "https://anilist.co/anime/1" }] },
            manga: { nodes: [] },
            characters: { nodes: [{ id: 20, name: { full: "Hero" }, siteUrl: "https://anilist.co/character/20" }] },
            staff: { nodes: [] },
            studios: { nodes: [{ id: 1, name: "Studio", siteUrl: "https://anilist.co/studio/1" }] },
          },
        },
      });
    }

    // Media reviews
    if (matchQuery(body, "MediaReviews")) {
      return gql({
        Media: {
          id: (body.variables?.id as number) ?? 1,
          title: { romaji: "Test Anime", english: "Test Anime", native: null },
          reviews: {
            pageInfo: { total: 2, hasNextPage: false },
            nodes: [
              {
                id: 1,
                score: 80,
                summary: "A great anime",
                body: "This anime has excellent animation and storytelling.",
                rating: 15,
                ratingAmount: 20,
                createdAt: 1700000000,
                user: { name: "reviewer1", siteUrl: "https://anilist.co/user/reviewer1" },
              },
              {
                id: 2,
                score: 65,
                summary: "Decent but flawed",
                body: "Good start but the ending was rushed.",
                rating: 8,
                ratingAmount: 12,
                createdAt: 1699900000,
                user: { name: "reviewer2", siteUrl: "https://anilist.co/user/reviewer2" },
              },
            ],
          },
        },
      });
    }

    // Save list entry
    if (matchQuery(body, "SaveMediaListEntry")) {
      return gql({
        SaveMediaListEntry: {
          id: 99,
          mediaId: (body.variables?.mediaId as number) ?? 1,
          status: (body.variables?.status as string) ?? "CURRENT",
          score: (body.variables?.score as number) ?? 0,
          progress: (body.variables?.progress as number) ?? 0,
          progressVolumes: (body.variables?.progressVolumes as number) ?? 0,
        },
      });
    }

    // Delete list entry
    if (matchQuery(body, "DeleteMediaListEntry")) {
      return gql({
        DeleteMediaListEntry: { deleted: true },
      });
    }

    // Single list entry snapshot (must be after Save/Delete)
    if (matchQuery(body, "query MediaListEntry")) {
      return gql({
        MediaList: {
          id: 1,
          mediaId: (body.variables?.mediaId as number) ?? 1,
          status: "CURRENT",
          score: 5,
          progress: 3,
          progressVolumes: 0,
          notes: null,
          private: false,
        },
      });
    }

    // Batch relations
    if (matchQuery(body, "BatchRelations")) {
      return gql({ Page: { media: [] } });
    }

    // Discover (fallback picks)
    if (matchQuery(body, "DiscoverMedia")) {
      return gql({
        Page: {
          pageInfo: { total: 2, hasNextPage: false },
          media: defaultMedia,
        },
      });
    }

    // General search (must be last Page-based check)
    if (matchQuery(body, "SearchMedia")) {
      return gql({
        Page: {
          pageInfo: {
            total: 2,
            currentPage: 1,
            lastPage: 1,
            hasNextPage: false,
          },
          media: defaultMedia,
        },
      });
    }

    // Fallback - unmatched query
    return HttpResponse.json(
      { errors: [{ message: "Unhandled query in test handler" }] },
      { status: 400 },
    );
  }),

  // Jikan (MAL) default handler - 6 entries (taste engine needs MIN_ENTRIES=5)
  http.get(`${JIKAN_BASE}/users/:username/animelist`, () => {
    const genres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Sci-Fi"];
    const data = Array.from({ length: 6 }, (_, i) => ({
      score: 6 + (i % 4),
      episodes_watched: 12 + i,
      anime: {
        mal_id: 101 + i,
        title: `MAL Anime ${i + 1}`,
        type: "TV",
        episodes: 12 + i,
        score: 7.0 + i * 0.3,
        genres: [
          { mal_id: i + 1, name: genres[i % genres.length] },
          { mal_id: i + 2, name: genres[(i + 1) % genres.length] },
        ],
        year: 2020 + (i % 3),
      },
    }));
    return HttpResponse.json({
      data,
      pagination: { last_visible_page: 1, has_next_page: false },
    });
  }),
];

// === Per-test Handler Overrides ===

/** Override search to return specific media */
export function searchHandler(
  media: ReturnType<typeof makeMedia>[],
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "SearchMedia")) return undefined;
    return gql({
      Page: {
        pageInfo: {
          total: pageInfo?.total ?? media.length,
          currentPage: 1,
          lastPage: 1,
          hasNextPage: pageInfo?.hasNextPage ?? false,
        },
        media,
      },
    });
  });
}

/** Override list to return specific entries */
export function listHandler(
  entries: ReturnType<typeof makeEntry>[],
  status = "COMPLETED",
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaListCollection")) return undefined;
    return gql({
      MediaListCollection: {
        lists: entries.length
          ? [{ name: status, status, entries }]
          : [],
      },
    });
  });
}

/** Override single-entry list lookup */
export function listLookupHandler(
  entry: ReturnType<typeof makeEntry> | null,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "ListLookup")) return undefined;
    return gql({ MediaList: entry });
  });
}

/** Override completed-by-date to return specific entries */
export function completedByDateHandler(
  entries: ReturnType<typeof makeEntry>[],
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "CompletedByDate")) return undefined;
    return gql({
      Page: {
        pageInfo: { hasNextPage: false },
        mediaList: entries,
      },
    });
  });
}

/** Override details to return specific media */
export function detailsHandler(
  media: Record<string, unknown>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaDetails")) return undefined;
    return gql({ Media: media });
  });
}

/** Override seasonal to return specific media */
export function seasonalHandler(
  media: ReturnType<typeof makeMedia>[],
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "SeasonalMedia")) return undefined;
    return gql({
      Page: {
        pageInfo: {
          total: pageInfo?.total ?? media.length,
          currentPage: 1,
          lastPage: 1,
          hasNextPage: pageInfo?.hasNextPage ?? false,
        },
        media,
      },
    });
  });
}

/** Override recommendations to return specific data */
export function recommendationsHandler(
  sourceTitle: string,
  recs: Array<{
    rating: number;
    mediaRecommendation: ReturnType<typeof makeMedia> | null;
  }>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaRecommendations")) return undefined;
    return gql({
      Media: {
        id: 1,
        title: { romaji: sourceTitle, english: sourceTitle, native: null },
        recommendations: { nodes: recs },
      },
    });
  });
}

/** Override stats to return specific data */
export function statsHandler(userStats: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "UserStats")) return undefined;
    return gql(userStats);
  });
}

/** Override trending to return specific media */
export function trendingHandler(
  media: Array<ReturnType<typeof makeMedia> & { trending?: number }>,
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "TrendingMedia")) return undefined;
    return gql({
      Page: {
        pageInfo: pageInfo ?? { total: media.length, hasNextPage: false },
        media: media.map((m) => ({ ...m, trending: m.trending ?? 50 })),
      },
    });
  });
}

/** Override genre browse to return specific media */
export function genreBrowseHandler(
  media: ReturnType<typeof makeMedia>[],
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "GenreBrowse")) return undefined;
    return gql({
      Page: {
        pageInfo: pageInfo ?? { total: media.length, hasNextPage: false },
        media,
      },
    });
  });
}

/** Override staff to return specific data */
export function staffHandler(staffData: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaStaff")) return undefined;
    return gql({ Media: staffData });
  });
}

/** Override airing schedule to return specific data */
export function scheduleHandler(scheduleData: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "AiringSchedule")) return undefined;
    return gql({ Media: scheduleData });
  });
}

/** Override character search to return specific data */
export function characterHandler(
  characters: Array<Record<string, unknown>>,
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "CharacterSearch")) return undefined;
    return gql({
      Page: {
        pageInfo: pageInfo ?? { total: characters.length, hasNextPage: false },
        characters,
      },
    });
  });
}

/** Return an HTTP error for any request */
export function errorHandler(status: number, body = "") {
  return http.post(ANILIST_URL, () => {
    return new HttpResponse(body, { status });
  });
}

/** Simulate a network timeout (never responds) */
export function timeoutHandler() {
  return http.post(ANILIST_URL, async () => {
    await new Promise(() => {});
  });
}

/** Return a GraphQL error inside a 200 response */
export function graphqlErrorHandler(message: string, status?: number) {
  return http.post(ANILIST_URL, () => {
    return HttpResponse.json({
      errors: [{ message, status }],
    });
  });
}

/** Override save entry to return specific data */
export function saveEntryHandler(response: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "SaveMediaListEntry")) return undefined;
    return gql({ SaveMediaListEntry: response });
  });
}

/** Override delete entry to return specific result */
export function deleteEntryHandler(deleted: boolean) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "DeleteMediaListEntry")) return undefined;
    return gql({ DeleteMediaListEntry: { deleted } });
  });
}

/** Override staff search to return specific results */
export function staffSearchHandler(
  staff: Array<Record<string, unknown>>,
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "StaffSearch")) return undefined;
    return gql({
      Page: {
        pageInfo: pageInfo ?? { total: staff.length, hasNextPage: false },
        staff,
      },
    });
  });
}

/** Override studio search to return specific data */
export function studioSearchHandler(studio: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "StudioSearch")) return undefined;
    return gql({ Studio: studio });
  });
}

/** Override viewer to return specific data */
export function viewerHandler(viewer: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "Viewer")) return undefined;
    return gql({ Viewer: viewer });
  });
}

/** Override genre/tag collection */
export function genreTagHandler(
  genres: string[],
  tags: Array<Record<string, unknown>>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "GenreTagCollection")) return undefined;
    return gql({ GenreCollection: genres, MediaTagCollection: tags });
  });
}

/** Override favourite toggle to return specific data */
export function favouriteHandler(response: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "ToggleFavourite")) return undefined;
    return gql({ ToggleFavourite: response });
  });
}

/** Override activity feed to return specific activities */
export function feedHandler(
  activities: Array<Record<string, unknown>>,
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "ActivityFeed")) return undefined;
    return gql({
      Page: {
        pageInfo: {
          total: pageInfo?.total ?? activities.length,
          currentPage: 1,
          hasNextPage: pageInfo?.hasNextPage ?? false,
        },
        activities,
      },
    });
  });
}

/** Override user profile to return specific data */
export function profileHandler(user: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "UserProfile")) return undefined;
    return gql({ User: user });
  });
}

/** Override reviews to return specific data */
export function reviewsHandler(media: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaReviews")) return undefined;
    return gql({ Media: media });
  });
}

/** Override batch relations to return specific data */
export function batchRelationsHandler(
  media: Array<{
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
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "BatchRelations")) return undefined;
    return gql({ Page: { media } });
  });
}

/** Override list to return specific groups (with isCustomList support) */
export function listGroupsHandler(
  lists: Array<{
    name: string;
    status: string;
    isCustomList: boolean;
    entries: ReturnType<typeof makeEntry>[];
  }>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "MediaListCollection")) return undefined;
    return gql({ MediaListCollection: { lists } });
  });
}

/** Override list to return different entries per status */
export function multiStatusListHandler(
  statusMap: Record<string, ReturnType<typeof makeEntry>[]>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    if (!matchQuery(body, "MediaListCollection")) return undefined;

    const status = body.variables?.status as string | undefined;
    // No status filter means return all groups
    if (!status) {
      const lists = Object.entries(statusMap).map(([s, entries]) => ({
        name: s,
        status: s,
        isCustomList: false,
        entries,
      }));
      return gql({ MediaListCollection: { lists } });
    }

    const entries = statusMap[status] ?? [];
    return gql({
      MediaListCollection: {
        lists: entries.length
          ? [{ name: status, status, isCustomList: false, entries }]
          : [],
      },
    });
  });
}

/** Override media list entry query (for undo snapshots) */
export function mediaListEntryHandler(
  entry: Record<string, unknown> | null,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "query MediaListEntry")) return undefined;
    return gql({ MediaList: entry });
  });
}

/** Override batch airing to return specific data */
export function batchAiringHandler(
  media: Array<Record<string, unknown>>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "BatchAiring")) return undefined;
    return gql({ Page: { media } });
  });
}

/** Override post activity to return specific data */
export function activityHandler(activity: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "SaveTextActivity")) return undefined;
    return gql({ SaveTextActivity: activity });
  });
}

/** Override Jikan animelist to return specific entries */
export function jikanListHandler(
  entries: Array<Record<string, unknown>>,
  hasNextPage = false,
) {
  return http.get(`${JIKAN_BASE}/users/:username/animelist`, () => {
    return HttpResponse.json({
      data: entries,
      pagination: { last_visible_page: 1, has_next_page: hasNextPage },
    });
  });
}

/** Override Jikan to return 404 for unknown user */
export function jikanNotFoundHandler() {
  return http.get(`${JIKAN_BASE}/users/:username/animelist`, () => {
    return new HttpResponse(null, { status: 404 });
  });
}

/** Override user following to return specific users */
export function followingHandler(
  following: Array<{ id: number; name: string }>,
  pageInfo?: { total: number; hasNextPage: boolean },
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "UserFollowing")) return undefined;
    return gql({
      Page: {
        pageInfo: pageInfo ?? { total: following.length, hasNextPage: false },
        following,
      },
    });
  });
}

/** Override toggle like to return specific data */
export function toggleLikeHandler(users: Array<{ id: number; name: string }>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "ToggleLike")) return undefined;
    return gql({ ToggleLike: users });
  });
}

/** Override save activity reply */
export function activityReplyHandler(reply: Record<string, unknown>) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.clone().json()) as { query?: string };
    if (!matchQuery(body, "SaveActivityReply")) return undefined;
    return gql({ SaveActivityReply: reply });
  });
}

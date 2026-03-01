/** MSW request handlers for the AniList GraphQL API */

import { http, HttpResponse } from "msw";
import { makeMedia, makeEntry } from "../fixtures.js";

const ANILIST_URL = "https://graphql.anilist.co";

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

    // User stats
    if (matchQuery(body, "UserStats")) {
      return gql({
        User: {
          id: 1,
          name: body.variables?.name ?? "testuser",
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

    // User list
    if (matchQuery(body, "MediaListCollection")) {
      return gql({
        MediaListCollection: {
          lists: [
            {
              name: "Completed",
              status: "COMPLETED",
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
];

// === Per-test Handler Overrides ===

/** Override search to return specific media */
export function searchHandler(media: ReturnType<typeof makeMedia>[]) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    if (!matchQuery(body, "SearchMedia")) return undefined;
    return gql({
      Page: {
        pageInfo: {
          total: media.length,
          currentPage: 1,
          lastPage: 1,
          hasNextPage: false,
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
    const body = (await request.json()) as { query?: string };
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

/** Override details to return specific media */
export function detailsHandler(
  media: Record<string, unknown>,
) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    if (!matchQuery(body, "MediaDetails")) return undefined;
    return gql({ Media: media });
  });
}

/** Override seasonal to return specific media */
export function seasonalHandler(media: ReturnType<typeof makeMedia>[]) {
  return http.post(ANILIST_URL, async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    if (!matchQuery(body, "SeasonalMedia")) return undefined;
    return gql({
      Page: {
        pageInfo: {
          total: media.length,
          currentPage: 1,
          lastPage: 1,
          hasNextPage: false,
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
    const body = (await request.json()) as { query?: string };
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
    const body = (await request.json()) as { query?: string };
    if (!matchQuery(body, "UserStats")) return undefined;
    return gql(userStats);
  });
}

/** Return an HTTP error for any request */
export function errorHandler(status: number, body = "") {
  return http.post(ANILIST_URL, () => {
    return new HttpResponse(body, { status });
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

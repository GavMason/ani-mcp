/** Zod input schemas for MCP tool validation. */

import { z } from "zod";

// Reusable page param for paginated tools
const pageParam = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("Page number for pagination (default 1)");

// AniList usernames: 2-20 chars, alphanumeric + underscores + hyphens
const usernameSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscores, and hyphens only");

/** Input for searching anime or manga by title and filters */
export const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .describe('Search term, e.g. "steins gate", "one piece", "chainsaw man"'),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Search for anime or manga"),
  genre: z
    .string()
    .optional()
    .describe('Filter by genre, e.g. "Action", "Romance", "Thriller"'),
  year: z
    .number()
    .int()
    .min(1940)
    .max(2030)
    .optional()
    .describe("Filter by release year"),
  format: z
    .enum([
      "TV",
      "MOVIE",
      "OVA",
      "ONA",
      "SPECIAL",
      "MANGA",
      "NOVEL",
      "ONE_SHOT",
    ])
    .optional()
    .describe("Filter by format (TV, MOVIE, etc.)"),
  isAdult: z
    .boolean()
    .default(false)
    .describe("Include adult (18+) content in results"),
  // Capped at 25. Sending 100 results to an LLM wastes context window.
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of results to return (default 10, max 25)"),
  page: pageParam,
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

/** Input for looking up a single anime or manga by ID or title */
export const DetailsInputSchema = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "AniList media ID (e.g. 1 for Cowboy Bebop). Use this if you know the exact ID.",
      ),
    title: z
      .string()
      .optional()
      .describe(
        'Search by title if no ID is known (e.g. "Attack on Titan"). Finds the best match.',
      ),
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title to look up.",
  });

export type DetailsInput = z.infer<typeof DetailsInputSchema>;

/** Input for fetching a user's anime or manga list */
export const ListInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Get anime or manga list"),
  status: z
    .enum([
      "CURRENT",
      "COMPLETED",
      "PLANNING",
      "DROPPED",
      "PAUSED",
      "ALL",
      "CUSTOM",
    ])
    .default("ALL")
    .describe(
      "Filter by list status. CURRENT = watching/reading now. CUSTOM = user-created lists.",
    ),
  customListName: z
    .string()
    .optional()
    .describe(
      "Filter to a specific custom list by name. Only used when status is CUSTOM.",
    ),
  sort: z
    .enum(["SCORE", "TITLE", "UPDATED", "PROGRESS"])
    .default("UPDATED")
    .describe("How to sort results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Maximum entries to return (default 25, max 100)"),
  page: pageParam,
});

export type ListInput = z.infer<typeof ListInputSchema>;

/** Input for generating a taste profile summary */
export const TasteInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA", "BOTH"])
    .default("BOTH")
    .describe("Analyze anime list, manga list, or both"),
});

export type TasteInput = z.infer<typeof TasteInputSchema>;

/** Input for personalized recommendations from the user's planning list */
export const PickInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Recommend from anime or manga planning list"),
  profileType: z
    .enum(["ANIME", "MANGA"])
    .optional()
    .describe(
      "Build taste profile from this media type. Defaults to same as type. " +
        "Set to get cross-media recs, e.g. anime picks based on manga taste.",
    ),
  source: z
    .enum(["PLANNING", "SEASONAL", "DISCOVER"])
    .default("PLANNING")
    .describe(
      "Where to find candidates. PLANNING = user's plan-to-watch list (default). " +
        "SEASONAL = currently airing anime. DISCOVER = top-rated titles matching taste.",
    ),
  season: z
    .enum(["WINTER", "SPRING", "SUMMER", "FALL"])
    .optional()
    .describe("Season for SEASONAL source. Defaults to the current season."),
  year: z
    .number()
    .int()
    .min(1940)
    .max(new Date().getFullYear() + 2)
    .optional()
    .describe("Year for SEASONAL source. Defaults to the current year."),
  mood: z
    .string()
    .optional()
    .describe(
      'Freeform mood or vibe, e.g. "something dark", "chill and wholesome", "hype action"',
    ),
  maxEpisodes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Filter out series longer than this episode count"),
  exclude: z
    .array(z.number().int().positive())
    .max(50)
    .optional()
    .describe(
      "Media IDs to exclude from results (e.g. from previous recommendations)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(15)
    .default(5)
    .describe("Number of recommendations to return (default 5, max 15)"),
});

export type PickInput = z.infer<typeof PickInputSchema>;

/** Input for planning a watch/read session within a time budget */
export const SessionInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Plan session from anime or manga currently-watching list"),
  minutes: z
    .number()
    .int()
    .min(10)
    .max(720)
    .describe("Time budget in minutes (10-720)"),
  mood: z
    .string()
    .optional()
    .describe('Optional mood to prioritize titles, e.g. "dark", "chill"'),
});

export type SessionInput = z.infer<typeof SessionInputSchema>;

/** Input for finding sequels to completed titles airing this season */
export const SequelAlertInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  season: z
    .enum(["WINTER", "SPRING", "SUMMER", "FALL"])
    .optional()
    .describe("Season to check for sequels. Defaults to the current season."),
  year: z
    .number()
    .int()
    .min(1940)
    .max(new Date().getFullYear() + 2)
    .optional()
    .describe("Year to check. Defaults to the current year."),
});

export type SequelAlertInput = z.infer<typeof SequelAlertInputSchema>;

/** Input for franchise watch order guidance */
export const WatchOrderInputSchema = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("AniList media ID of any title in the franchise"),
    title: z.string().optional().describe("Search by title if no ID is known"),
    includeSpecials: z
      .boolean()
      .default(false)
      .describe("Include OVAs, specials, and spin-offs in the watch order"),
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title.",
  });

export type WatchOrderInput = z.infer<typeof WatchOrderInputSchema>;

/** Input for comparing taste profiles between two users */
export const CompareInputSchema = z.object({
  user1: usernameSchema.describe("First AniList username"),
  user2: usernameSchema.describe("Second AniList username"),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Compare anime or manga taste"),
});

export type CompareInput = z.infer<typeof CompareInputSchema>;

const MAX_YEAR = new Date().getFullYear() + 2;

/** Input for browsing anime by season */
export const SeasonalInputSchema = z.object({
  season: z
    .enum(["WINTER", "SPRING", "SUMMER", "FALL"])
    .optional()
    .describe("Season to browse. Defaults to the current season."),
  year: z
    .number()
    .int()
    .min(1940)
    .max(MAX_YEAR)
    .optional()
    .describe("Year to browse. Defaults to the current year."),
  sort: z
    .enum(["POPULARITY", "SCORE", "TRENDING"])
    .default("POPULARITY")
    .describe("How to rank results"),
  isAdult: z
    .boolean()
    .default(false)
    .describe("Include adult (18+) content in results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(15)
    .describe("Number of results to return (default 15, max 50)"),
  page: pageParam,
});

export type SeasonalInput = z.infer<typeof SeasonalInputSchema>;

/** Input for fetching user statistics */
export const StatsInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
});

export type StatsInput = z.infer<typeof StatsInputSchema>;

/** Input for year-in-review summary */
export const WrappedInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  year: z
    .number()
    .int()
    .min(2000)
    .max(MAX_YEAR)
    .optional()
    .describe("Year to summarize. Defaults to the current year."),
  type: z
    .enum(["ANIME", "MANGA", "BOTH"])
    .default("BOTH")
    .describe("Summarize anime, manga, or both"),
});

export type WrappedInput = z.infer<typeof WrappedInputSchema>;

/** Input for trending anime/manga */
export const TrendingInputSchema = z.object({
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Show trending anime or manga"),
  isAdult: z
    .boolean()
    .default(false)
    .describe("Include adult (18+) content in results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of results to return (default 10, max 25)"),
  page: pageParam,
});

export type TrendingInput = z.infer<typeof TrendingInputSchema>;

/** Input for browsing by genre */
export const GenreBrowseInputSchema = z.object({
  genre: z
    .string()
    .describe('Genre to browse, e.g. "Action", "Romance", "Horror"'),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Browse anime or manga"),
  year: z
    .number()
    .int()
    .min(1940)
    .max(MAX_YEAR)
    .optional()
    .describe("Filter by release year"),
  status: z
    .enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"])
    .optional()
    .describe("Filter by airing/publishing status"),
  format: z
    .enum([
      "TV",
      "MOVIE",
      "OVA",
      "ONA",
      "SPECIAL",
      "MANGA",
      "NOVEL",
      "ONE_SHOT",
    ])
    .optional()
    .describe("Filter by format"),
  sort: z
    .enum(["SCORE", "POPULARITY", "TRENDING"])
    .default("SCORE")
    .describe("How to rank results"),
  isAdult: z
    .boolean()
    .default(false)
    .describe("Include adult (18+) content in results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of results to return (default 10, max 25)"),
  page: pageParam,
});

export type GenreBrowseInput = z.infer<typeof GenreBrowseInputSchema>;

/** Input for staff/VA credits lookup */
export const StaffInputSchema = z
  .object({
    id: z.number().int().positive().optional().describe("AniList media ID"),
    title: z.string().optional().describe("Search by title if no ID is known"),
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title.",
  });

export type StaffInput = z.infer<typeof StaffInputSchema>;

/** Input for airing schedule lookup */
export const ScheduleInputSchema = z
  .object({
    id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("AniList media ID for the anime"),
    title: z.string().optional().describe("Search by title if no ID is known"),
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title.",
  });

export type ScheduleInput = z.infer<typeof ScheduleInputSchema>;

/** Input for character search */
export const CharacterSearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .describe('Character name to search for, e.g. "Goku", "Levi Ackerman"'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of results to return (default 5, max 10)"),
  page: pageParam,
});

export type CharacterSearchInput = z.infer<typeof CharacterSearchInputSchema>;

/** Input for community recommendations for a specific title */
export const RecommendationsInputSchema = z
  .object({
    id: z.number().int().positive().optional().describe("AniList media ID"),
    title: z.string().optional().describe("Search by title if no ID is known"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10)
      .describe("Number of recommendations to return (default 10, max 25)"),
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title.",
  });

export type RecommendationsInput = z.infer<typeof RecommendationsInputSchema>;

/** Input for updating episode or chapter progress */
export const UpdateProgressInputSchema = z.object({
  mediaId: z
    .number()
    .int()
    .positive()
    .describe("AniList media ID to update progress for"),
  progress: z
    .number()
    .int()
    .min(0)
    .describe("Episode or chapter number reached"),
  status: z
    .enum(["CURRENT", "COMPLETED", "PAUSED", "DROPPED", "REPEATING"])
    .optional()
    .describe("List status to set. Defaults to CURRENT if the entry is new."),
});

export type UpdateProgressInput = z.infer<typeof UpdateProgressInputSchema>;

/** Input for adding a title to the user's list */
export const AddToListInputSchema = z.object({
  mediaId: z
    .number()
    .int()
    .positive()
    .describe("AniList media ID to add to the list"),
  status: z
    .enum([
      "CURRENT",
      "PLANNING",
      "COMPLETED",
      "DROPPED",
      "PAUSED",
      "REPEATING",
    ])
    .describe("List status to set"),
  score: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Score on a 0-10 scale (e.g. 8.5). Omit to leave unscored."),
});

export type AddToListInput = z.infer<typeof AddToListInputSchema>;

/** Input for rating a title */
export const RateInputSchema = z.object({
  mediaId: z.number().int().positive().describe("AniList media ID to rate"),
  score: z
    .number()
    .min(0)
    .max(10)
    .describe("Score on a 0-10 scale. Use 0 to remove a score."),
});

export type RateInput = z.infer<typeof RateInputSchema>;

/** Input for removing a title from the list */
export const DeleteFromListInputSchema = z
  .object({
    entryId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("List entry ID to delete (from anilist_list)"),
    mediaId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("AniList media ID to remove from your list"),
  })
  .refine((data) => data.entryId !== undefined || data.mediaId !== undefined, {
    message: "Provide either an entryId or a mediaId.",
  });

/** Input for scoring a title against a user's taste profile */
export const ExplainInputSchema = z
  .object({
    mediaId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("AniList media ID to evaluate against your taste profile"),
    title: z
      .string()
      .optional()
      .describe("Search by title if no ID is known"),
    username: usernameSchema
      .optional()
      .describe(
        "AniList username. Falls back to configured default if not provided.",
      ),
    type: z
      .enum(["ANIME", "MANGA", "BOTH"])
      .default("BOTH")
      .describe("Build taste profile from anime list, manga list, or both"),
    mood: z
      .string()
      .optional()
      .describe('Optional mood context, e.g. "dark and brainy"'),
  })
  .refine((data) => data.mediaId !== undefined || data.title !== undefined, {
    message: "Provide either a mediaId or a title.",
  });

export type ExplainInput = z.infer<typeof ExplainInputSchema>;

/** Input for finding titles similar to a specific anime or manga */
export const SimilarInputSchema = z
  .object({
    mediaId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("AniList media ID to find similar titles for"),
    title: z
      .string()
      .optional()
      .describe("Search by title if no ID is known"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10)
      .describe("Number of similar titles to return (default 10, max 25)"),
  })
  .refine((data) => data.mediaId !== undefined || data.title !== undefined, {
    message: "Provide either a mediaId or a title.",
  });

export type SimilarInput = z.infer<typeof SimilarInputSchema>;

/** Input for searching staff/people by name */
export const StaffSearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .describe('Staff name to search for, e.g. "Miyazaki", "Kana Hanazawa"'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("Number of staff results to return (default 3, max 10)"),
  mediaLimit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Works per person to show (default 10, max 25)"),
  page: pageParam,
});

export type StaffSearchInput = z.infer<typeof StaffSearchInputSchema>;

/** Input for listing all valid genres and tags */
export const GenreListInputSchema = z.object({
  includeAdultTags: z
    .boolean()
    .default(false)
    .describe("Include adult/NSFW tags in the list"),
});

export type GenreListInput = z.infer<typeof GenreListInputSchema>;

/** Input for searching studios by name */
export const StudioSearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .describe('Studio name to search for, e.g. "MAPPA", "Kyoto Animation"'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of works to show (default 10, max 25)"),
});

export type StudioSearchInput = z.infer<typeof StudioSearchInputSchema>;

// === 0.4.0 Social & Favourites ===

/** Input for toggling a favourite */
export const FavouriteInputSchema = z.object({
  type: z
    .enum(["ANIME", "MANGA", "CHARACTER", "STAFF", "STUDIO"])
    .describe("Type of entity to favourite"),
  id: z
    .number()
    .int()
    .positive()
    .describe("AniList ID of the entity to toggle favourite on"),
});

export type FavouriteInput = z.infer<typeof FavouriteInputSchema>;

/** Input for posting a text activity */
export const PostActivityInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(2000)
    .describe("Text content of the activity post"),
});

export type PostActivityInput = z.infer<typeof PostActivityInputSchema>;

/** Input for fetching a user's activity feed */
export const FeedInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["TEXT", "ANIME_LIST", "MANGA_LIST", "ALL"])
    .default("ALL")
    .describe("Filter by activity type"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of activities to return (default 10, max 25)"),
  page: pageParam,
});

export type FeedInput = z.infer<typeof FeedInputSchema>;

/** Input for viewing a user's profile */
export const ProfileInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

/** Input for fetching community reviews for a title */
export const ReviewsInputSchema = z
  .object({
    id: z.number().int().positive().optional().describe("AniList media ID"),
    title: z.string().optional().describe("Search by title if no ID is known"),
    sort: z
      .enum(["HELPFUL", "NEWEST"])
      .default("HELPFUL")
      .describe("Sort by most helpful or newest"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of reviews to return (default 5, max 10)"),
    page: pageParam,
  })
  .refine((data) => data.id !== undefined || data.title !== undefined, {
    message: "Provide either an id or a title.",
  });

export type ReviewsInput = z.infer<typeof ReviewsInputSchema>;

// === 0.7.0 Analytics & Insight ===

/** Input for score calibration analysis */
export const CalibrationInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Analyze anime or manga scores"),
});

export type CalibrationInput = z.infer<typeof CalibrationInputSchema>;

/** Input for drop pattern analysis */
export const DropPatternInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Analyze anime or manga drops"),
});

export type DropPatternInput = z.infer<typeof DropPatternInputSchema>;

/** Input for genre evolution over time */
export const EvolutionInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Track anime or manga taste evolution"),
});

export type EvolutionInput = z.infer<typeof EvolutionInputSchema>;

/** Input for franchise completion tracking */
export const CompletionistInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Check anime or manga franchise completion"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Number of franchise groups to show (default 10, max 20)"),
});

export type CompletionistInput = z.infer<typeof CompletionistInputSchema>;

/** Input for seasonal pick-up and completion rates */
export const SeasonalHitRateInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  season: z
    .enum(["WINTER", "SPRING", "SUMMER", "FALL"])
    .optional()
    .describe("Season to analyze. Defaults to last completed season."),
  year: z
    .number()
    .int()
    .min(2000)
    .max(MAX_YEAR)
    .optional()
    .describe("Year to analyze. Defaults to current year."),
  history: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(4)
    .describe("Number of past seasons to show (default 4, max 8)"),
});

export type SeasonalHitRateInput = z.infer<typeof SeasonalHitRateInputSchema>;

/** Input for pace estimation */
export const PaceInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  mediaId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "AniList media ID to estimate pace for. Omit for all current titles.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Estimate pace for anime or manga"),
});

export type PaceInput = z.infer<typeof PaceInputSchema>;

// === 0.8.0 Persistent Intelligence ===

/** Input for undoing the last write operation */
export const UndoInputSchema = z.object({});

export type UndoInput = z.infer<typeof UndoInputSchema>;

/** Input for listing unscored completed titles */
export const UnscoredInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Check anime or manga list for unscored titles"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of unscored titles to return (default 20, max 50)"),
});

export type UnscoredInput = z.infer<typeof UnscoredInputSchema>;

/** Input for batch-updating multiple list entries */
export const BatchUpdateInputSchema = z.object({
  username: usernameSchema
    .optional()
    .describe(
      "AniList username. Falls back to configured default if not provided.",
    ),
  type: z
    .enum(["ANIME", "MANGA"])
    .default("ANIME")
    .describe("Update anime or manga entries"),
  filter: z.object({
    status: z
      .enum(["CURRENT", "COMPLETED", "PLANNING", "DROPPED", "PAUSED"])
      .optional()
      .describe("Only match entries with this status"),
    scoreBelow: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe("Only match entries scored below this value"),
    scoreAbove: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe("Only match entries scored above this value"),
    unscored: z
      .boolean()
      .optional()
      .describe("Only match entries with no score"),
  }),
  action: z.object({
    setStatus: z
      .enum([
        "CURRENT",
        "PLANNING",
        "COMPLETED",
        "DROPPED",
        "PAUSED",
        "REPEATING",
      ])
      .optional()
      .describe("Change status to this value"),
    setScore: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe("Set score to this value (0 removes score)"),
  }),
  dryRun: z
    .boolean()
    .default(true)
    .describe(
      "Preview changes without applying them. Set to false to execute.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max entries to update in one call (default 50, max 100)"),
});

export type BatchUpdateInput = z.infer<typeof BatchUpdateInputSchema>;

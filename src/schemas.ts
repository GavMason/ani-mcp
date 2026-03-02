/** Zod input schemas for MCP tool validation. */

import { z } from "zod";

// AniList usernames: 2-20 chars, alphanumeric + underscores
const usernameSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only");

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
    .enum(["CURRENT", "COMPLETED", "PLANNING", "DROPPED", "PAUSED", "ALL"])
    .default("ALL")
    .describe("Filter by list status. CURRENT = watching/reading now."),
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(15)
    .default(5)
    .describe("Number of recommendations to return (default 5, max 15)"),
});

export type PickInput = z.infer<typeof PickInputSchema>;

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
export const DeleteFromListInputSchema = z.object({
  entryId: z
    .number()
    .int()
    .positive()
    .describe(
      "List entry ID to delete. This is the id field on a list entry, not the media ID. " +
        "Use anilist_list to find entry IDs.",
    ),
});

/** Input for scoring a title against a user's taste profile */
export const ExplainInputSchema = z.object({
  mediaId: z
    .number()
    .int()
    .positive()
    .describe("AniList media ID to evaluate against your taste profile"),
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
});

export type ExplainInput = z.infer<typeof ExplainInputSchema>;

/** Input for finding titles similar to a specific anime or manga */
export const SimilarInputSchema = z.object({
  mediaId: z
    .number()
    .int()
    .positive()
    .describe("AniList media ID to find similar titles for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Number of similar titles to return (default 10, max 25)"),
});

export type SimilarInput = z.infer<typeof SimilarInputSchema>;

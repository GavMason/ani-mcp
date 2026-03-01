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

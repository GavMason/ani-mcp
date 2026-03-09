/** Shared test data factories for AniList types */

import type { AniListMedia, AniListMediaListEntry } from "../src/types.js";

/** Create an AniListMedia with sensible defaults */
export function makeMedia(
  overrides: Partial<{
    genres: string[];
    tags: Array<{ name: string; rank: number; isMediaSpoiler: boolean }>;
    meanScore: number;
    episodes: number;
    chapters: number;
    format: string;
    id: number;
    popularity: number;
    type: string;
    season: string;
    seasonYear: number;
  }> = {},
): AniListMedia {
  return {
    id: overrides.id ?? 100,
    type: overrides.type ?? "ANIME",
    title: { romaji: "Test Anime", english: "Test Anime", native: null },
    format: overrides.format ?? "TV",
    status: "FINISHED",
    episodes: overrides.episodes ?? 12,
    duration: 24,
    chapters: overrides.chapters ?? null,
    volumes: null,
    meanScore: overrides.meanScore ?? 75,
    averageScore: 73,
    popularity: overrides.popularity ?? 30000,
    genres: overrides.genres ?? ["Action"],
    tags: (overrides.tags ?? []).map((t) => ({
      category: "Theme",
      ...t,
    })),
    season: overrides.season ?? "SPRING",
    seasonYear: overrides.seasonYear ?? 2024,
    startDate: { year: 2024, month: 4, day: null },
    endDate: { year: 2024, month: 6, day: null },
    studios: { nodes: [{ name: "Studio" }] },
    source: "ORIGINAL",
    isAdult: false,
    coverImage: { extraLarge: null },
    trailer: null,
    siteUrl: "https://anilist.co/anime/100",
    description: "A test anime.",
  };
}

/** Create an AniListMediaListEntry wrapping a makeMedia call */
export function makeEntry(
  overrides: Partial<{
    score: number;
    genres: string[];
    tags: Array<{ name: string; rank: number; isMediaSpoiler: boolean }>;
    format: string;
    id: number;
    popularity: number;
    updatedAt: number;
    completedAt: {
      year: number | null;
      month: number | null;
      day: number | null;
    };
    status: string;
    progress: number;
    progressVolumes: number;
    startedAt: {
      year: number | null;
      month: number | null;
      day: number | null;
    };
    episodes: number;
    chapters: number;
    meanScore: number;
    type: string;
    season: string;
    seasonYear: number;
  }> = {},
): AniListMediaListEntry {
  return {
    id: overrides.id ?? 1,
    score: overrides.score ?? 8,
    progress: overrides.progress ?? 12,
    progressVolumes: overrides.progressVolumes ?? 0,
    status: overrides.status ?? "COMPLETED",
    updatedAt: overrides.updatedAt ?? 1700000000,
    startedAt: overrides.startedAt ?? { year: 2023, month: 1, day: 1 },
    completedAt: overrides.completedAt ?? { year: 2023, month: 3, day: 1 },
    notes: null,
    media: makeMedia({
      genres: overrides.genres,
      tags: overrides.tags,
      format: overrides.format,
      id: overrides.id,
      popularity: overrides.popularity,
      meanScore: overrides.meanScore,
      episodes: overrides.episodes,
      chapters: overrides.chapters,
      type: overrides.type,
      season: overrides.season,
      seasonYear: overrides.seasonYear,
    }),
  };
}

/** Create a manga list entry with sensible defaults */
export function makeMangaEntry(
  overrides: Partial<Parameters<typeof makeEntry>[0]> = {},
): AniListMediaListEntry {
  return makeEntry({
    type: "MANGA",
    format: "MANGA",
    chapters: 100,
    ...overrides,
  });
}

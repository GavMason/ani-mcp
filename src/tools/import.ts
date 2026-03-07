/** Import tools: cross-platform list import for recommendations */

import type { FastMCP } from "fastmcp";
import {
  fetchMalList,
  mapMalGenre,
  mapMalFormat,
  type JikanAnimeEntry,
} from "../api/mal-client.js";
import { anilistClient } from "../api/client.js";
import { DISCOVER_MEDIA_QUERY } from "../api/queries.js";
import { MalImportInputSchema } from "../schemas.js";
import type { AniListMediaListEntry, SearchMediaResponse } from "../types.js";
import { throwToolError, formatMediaSummary } from "../utils.js";
import {
  buildTasteProfile,
  describeTasteProfile,
  formatTasteProfileText,
} from "../engine/taste.js";
import { matchCandidates } from "../engine/matcher.js";

// === Tool Registration ===

/** Register import tools on the MCP server */
export function registerImportTools(server: FastMCP): void {
  server.addTool({
    name: "anilist_mal_import",
    description:
      "Import a MyAnimeList user's completed anime list and generate " +
      "personalized recommendations based on their taste. No MAL auth needed. " +
      "Use when the user mentions their MAL account or wants recs from MAL history. " +
      "Returns a taste profile summary and recommended titles from AniList.",
    parameters: MalImportInputSchema,
    annotations: {
      title: "MAL Import",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        // Fetch MAL list via Jikan
        const malEntries = await fetchMalList(args.malUsername);

        if (malEntries.length === 0) {
          return `No completed anime found for MAL user "${args.malUsername}".`;
        }

        // Convert to AniList-compatible format for taste engine
        const converted = malEntriesToAniList(malEntries);

        // Build taste profile
        const profile = buildTasteProfile(converted);

        const lines: string[] = [
          `# MAL Import: ${args.malUsername}`,
          `Imported ${malEntries.length} completed anime from MyAnimeList.`,
          "",
          "## Taste Profile",
          describeTasteProfile(profile, args.malUsername),
          ...formatTasteProfileText(profile),
        ];

        // Fetch AniList candidates using top genres
        const topGenres = profile.genres.slice(0, 3).map((g) => g.name);
        if (topGenres.length > 0) {
          const candidates = await fetchDiscoverCandidates(topGenres);

          // Filter out titles already on the MAL list
          const malIds = new Set(malEntries.map((e) => e.anime.mal_id));
          const filtered = candidates.filter((m) => !malIds.has(m.id));

          // Score against taste profile
          const ranked = matchCandidates(filtered, profile).slice(
            0,
            args.limit,
          );

          lines.push("", "## Recommendations", "");

          if (ranked.length === 0) {
            lines.push("No new recommendations found.");
          } else {
            for (let i = 0; i < ranked.length; i++) {
              const r = ranked[i];
              lines.push(`${i + 1}. ${formatMediaSummary(r.media)}`);
              if (r.reasons.length > 0) {
                lines.push(`  Why: ${r.reasons.slice(0, 3).join(", ")}`);
              }
              lines.push("");
            }
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "importing MAL list");
      }
    },
  });
}

// === Helpers ===

// Convert MAL entries to AniList format for the taste engine
function malEntriesToAniList(
  entries: JikanAnimeEntry[],
): AniListMediaListEntry[] {
  return entries
    .filter((e) => e.score > 0)
    .map((e) => ({
      id: e.anime.mal_id,
      score: e.score,
      progress: e.episodes_watched,
      progressVolumes: 0,
      status: "COMPLETED",
      updatedAt: 0,
      startedAt: { year: null, month: null, day: null },
      completedAt: { year: null, month: null, day: null },
      notes: null,
      media: {
        id: e.anime.mal_id,
        type: "ANIME",
        title: {
          romaji: e.anime.title,
          english: e.anime.title,
          native: null,
        },
        format: mapMalFormat(e.anime.type),
        status: "FINISHED",
        episodes: e.anime.episodes,
        duration: null,
        chapters: null,
        volumes: null,
        meanScore: e.anime.score ? e.anime.score * 10 : null,
        averageScore: null,
        popularity: null,
        genres: e.anime.genres.map((g) => mapMalGenre(g.name)),
        tags: [],
        season: null,
        seasonYear: e.anime.year,
        startDate: { year: e.anime.year, month: null, day: null },
        endDate: { year: null, month: null, day: null },
        studios: { nodes: [] },
        source: null,
        isAdult: false,
        coverImage: { large: null, extraLarge: null },
        trailer: null,
        siteUrl: `https://myanimelist.net/anime/${e.anime.mal_id}`,
        description: null,
      },
    }));
}

// Fetch AniList discover candidates matching top taste genres
async function fetchDiscoverCandidates(genres: string[]) {
  const data = await anilistClient.query<SearchMediaResponse>(
    DISCOVER_MEDIA_QUERY,
    {
      type: "ANIME",
      genre_in: genres,
      perPage: 50,
      page: 1,
      sort: ["POPULARITY_DESC"],
    },
    { cache: "search" },
  );
  return data.Page.media;
}

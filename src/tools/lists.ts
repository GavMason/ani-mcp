/** User list tools: fetch and display a user's anime/manga list. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import { USER_STATS_QUERY } from "../api/queries.js";
import { ListInputSchema, StatsInputSchema } from "../schemas.js";
import type {
  AniListMediaListEntry,
  UserStatsResponse,
  MediaTypeStats,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  throwToolError,
} from "../utils.js";

// Map user-friendly sort names to AniList's internal enum values
const SORT_MAP: Record<string, string[]> = {
  SCORE: ["SCORE_DESC"],
  TITLE: ["MEDIA_TITLE_ROMAJI"],
  UPDATED: ["UPDATED_TIME_DESC"],
  PROGRESS: ["PROGRESS_DESC"],
};

/** Register user list tools on the MCP server */
export function registerListTools(server: FastMCP): void {
  server.addTool({
    name: "anilist_list",
    description:
      "Get a user's anime or manga list, filtered by watching status. " +
      "Use when the user asks about their list, what they're watching, " +
      "what they've completed, or what's on their plan-to-watch. " +
      "Defaults to the configured username if not provided.",
    parameters: ListInputSchema,
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        const sort = SORT_MAP[args.sort] ?? SORT_MAP.UPDATED;
        const status = args.status !== "ALL" ? args.status : undefined;
        const allEntries = await anilistClient.fetchList(username, args.type, status, sort);

        if (!allEntries.length) {
          if (args.status === "ALL") {
            return `${username}'s ${args.type.toLowerCase()} list is empty.`;
          }
          return `${username} has no ${args.type.toLowerCase()} with status "${args.status}".`;
        }

        // Re-sort after merging; AniList only sorts within each status group
        sortEntries(allEntries, args.sort);

        const limited = allEntries.slice(0, args.limit);
        const totalCount = allEntries.length;

        const header = [
          `${username}'s ${args.type} list` +
            (args.status !== "ALL" ? ` (${args.status})` : "") +
            ` - ${totalCount} entries` +
            (totalCount > limited.length ? `, showing ${limited.length}` : ""),
          "",
        ].join("\n");

        const formatted = limited.map((entry, i) =>
          formatListEntry(entry, i + 1),
        );

        return header + formatted.join("\n\n");
      } catch (error) {
        return throwToolError(error, "fetching list");
      }
    },
  });

  // === User Statistics ===

  server.addTool({
    name: "anilist_stats",
    description:
      "Get a user's watching/reading statistics. " +
      "Use when the user asks about their overall stats, how much anime they've watched, " +
      "their average score, top genres, or score distribution. " +
      "Shows anime and manga stats side by side.",
    parameters: StatsInputSchema,
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        const data = await anilistClient.query<UserStatsResponse>(
          USER_STATS_QUERY,
          { name: username },
          { cache: "stats" },
        );

        const { anime, manga } = data.User.statistics;
        const lines: string[] = [`# Stats for ${data.User.name}`, ""];

        // Anime stats
        if (anime.count > 0) {
          lines.push(...formatTypeStats(anime, "Anime"));
        }

        // Manga stats
        if (manga.count > 0) {
          if (anime.count > 0) lines.push("");
          lines.push(...formatTypeStats(manga, "Manga"));
        }

        if (anime.count === 0 && manga.count === 0) {
          return `${username} has no anime or manga statistics.`;
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "fetching stats");
      }
    },
  });
}

/** Format statistics for a single media type (anime or manga) */
function formatTypeStats(stats: MediaTypeStats, label: string): string[] {
  const lines: string[] = [`## ${label}`];

  // Volume summary
  const items = [
    `${stats.count} titles`,
    `Mean score: ${stats.meanScore.toFixed(1)}`,
  ];
  if (stats.episodesWatched)
    items.push(`${stats.episodesWatched.toLocaleString()} episodes`);
  if (stats.minutesWatched) {
    const days = (stats.minutesWatched / 1440).toFixed(1);
    items.push(`${days} days watched`);
  }
  if (stats.chaptersRead)
    items.push(`${stats.chaptersRead.toLocaleString()} chapters`);
  if (stats.volumesRead)
    items.push(`${stats.volumesRead.toLocaleString()} volumes`);
  lines.push(items.join(" | "));

  // Top genres by count
  if (stats.genres.length > 0) {
    lines.push("", "Top Genres:");
    for (const g of stats.genres.slice(0, 5)) {
      lines.push(
        `  ${g.genre}: ${g.count} titles (avg ${g.meanScore.toFixed(1)})`,
      );
    }
  }

  // Score distribution
  if (stats.scores.length > 0) {
    lines.push("", "Score Distribution:");
    // Scores are already sorted by MEAN_SCORE_DESC
    const sorted = [...stats.scores].sort((a, b) => b.score - a.score);
    for (const s of sorted) {
      if (s.count > 0) {
        const bar = "#".repeat(Math.min(s.count, 30));
        lines.push(`  ${s.score}/10: ${bar} (${s.count})`);
      }
    }
  }

  // Format breakdown
  if (stats.formats.length > 0) {
    const fmtParts = stats.formats
      .slice(0, 5)
      .map((f) => `${f.format}: ${f.count}`);
    lines.push("", `Formats: ${fmtParts.join(", ")}`);
  }

  return lines;
}

/** Format a single list entry with title, progress, score, and update date */
function formatListEntry(entry: AniListMediaListEntry, index: number): string {
  const media = entry.media;
  const title = getTitle(media.title);
  const format = media.format ?? "?";

  // Progress string (e.g. "5/12 ep" or "30/? ch")
  const total = media.episodes ?? media.chapters ?? "?";
  const unit = media.episodes !== null ? "ep" : "ch";
  const progress = `${entry.progress}/${total} ${unit}`;

  const score = entry.score > 0 ? `★ ${entry.score}/10` : "Unscored";

  const updated = entry.updatedAt
    ? new Date(entry.updatedAt * 1000).toLocaleDateString("en-US", {
        // AniList uses Unix seconds
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  const lines = [
    `${index}. ${title} (${format}) - ${score}`,
    `   Status: ${entry.status} | Progress: ${progress} | Updated: ${updated}`,
  ];

  if (entry.notes) {
    lines.push(
      `   Notes: ${entry.notes.slice(0, 100)}${entry.notes.length > 100 ? "..." : ""}`,
    );
  }

  return lines.join("\n");
}

/** Sort entries in-place by the given sort key */
function sortEntries(entries: AniListMediaListEntry[], sort: string): void {
  switch (sort) {
    case "SCORE":
      entries.sort((a, b) => b.score - a.score);
      break;
    case "TITLE":
      entries.sort((a, b) =>
        getTitle(a.media.title).localeCompare(getTitle(b.media.title)),
      );
      break;
    case "UPDATED":
      entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      break;
    case "PROGRESS":
      entries.sort((a, b) => b.progress - a.progress);
      break;
  }
}

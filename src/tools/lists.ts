/** User list tools: fetch and display a user's anime/manga list. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  USER_STATS_QUERY,
  LIST_LOOKUP_QUERY,
  SEARCH_MEDIA_QUERY,
} from "../api/queries.js";
import {
  ListInputSchema,
  StatsInputSchema,
  LookupInputSchema,
  ListExportInputSchema,
} from "../schemas.js";
import type {
  AniListMediaListEntry,
  UserStatsResponse,
  MediaTypeStats,
  ScoreFormat,
  ListLookupResponse,
  SearchMediaResponse,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  throwToolError,
  paginationFooter,
  formatScore,
  getScoreFormat,
  resolveAlias,
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
      "Supports custom lists via status CUSTOM. " +
      "Returns entries with title, score, progress, status, updated date, and entry ID.",
    parameters: ListInputSchema,
    annotations: {
      title: "Get User List",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const sort = SORT_MAP[args.sort] ?? SORT_MAP.UPDATED;

        // Custom list path: fetch all groups and filter to custom lists
        if (args.status === "CUSTOM") {
          return await handleCustomLists(username, args, sort);
        }

        // Standard path: fetch list and score format in parallel
        const status = args.status !== "ALL" ? args.status : undefined;
        const [allEntries, scoreFormat] = await Promise.all([
          anilistClient.fetchList(username, args.type, status, sort),
          getScoreFormat(username),
        ]);

        if (!allEntries.length) {
          if (args.status === "ALL") {
            return `${username}'s ${args.type.toLowerCase()} list is empty.`;
          }
          return `${username} has no ${args.type.toLowerCase()} with status "${args.status}".`;
        }

        // Re-sort after merging; AniList only sorts within each status group
        sortEntries(allEntries, args.sort);

        const totalCount = allEntries.length;
        const offset = (args.page - 1) * args.limit;
        const limited = allEntries.slice(offset, offset + args.limit);
        const hasNextPage = offset + args.limit < totalCount;

        const header = [
          `${username}'s ${args.type} list` +
            (args.status !== "ALL" ? ` (${args.status})` : "") +
            ` - ${totalCount} entries` +
            (totalCount > limited.length ? `, showing ${limited.length}` : ""),
          "",
        ].join("\n");

        const formatted = limited.map((entry, i) =>
          formatListEntry(entry, offset + i + 1, scoreFormat),
        );

        const footer = paginationFooter(
          args.page,
          args.limit,
          totalCount,
          hasNextPage,
        );
        return (
          header + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "")
        );
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
      "Returns title count, mean score, episodes/chapters, top genres, score distribution chart, and format breakdown.",
    parameters: StatsInputSchema,
    annotations: {
      title: "Get User Stats",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
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

  // === Single-Entry Lookup ===

  server.addTool({
    name: "anilist_lookup",
    description:
      "Check if a specific title is on a user's list and show its status. " +
      'Use when the user asks "is this on my list?", "have I seen this?", ' +
      "or wants to check their progress or score for a single title. " +
      "Returns status, score, progress, and dates without fetching the full list.",
    parameters: LookupInputSchema,
    annotations: {
      title: "List Lookup",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Resolve title to media ID
        let mediaId = args.mediaId;
        let resolvedTitle: string | undefined;
        if (!mediaId && args.title) {
          const search = resolveAlias(args.title);
          const searchData = await anilistClient.query<SearchMediaResponse>(
            SEARCH_MEDIA_QUERY,
            { search, type: "ANIME", page: 1, perPage: 1 },
            { cache: "search" },
          );
          if (!searchData.Page.media.length) {
            return `No results found for "${args.title}".`;
          }
          mediaId = searchData.Page.media[0].id;
          resolvedTitle = getTitle(searchData.Page.media[0].title);
        }

        const data = await anilistClient.query<ListLookupResponse>(
          LIST_LOOKUP_QUERY,
          { mediaId, userName: username },
          { cache: "list" },
        );

        if (!data.MediaList) {
          const label = resolvedTitle ?? args.title ?? `ID ${mediaId}`;
          return `"${label}" is not on ${username}'s list.`;
        }

        const entry = data.MediaList;
        const title = getTitle(entry.media.title);
        const scoreFormat = await getScoreFormat(username);
        const score = formatScore(entry.score, scoreFormat);

        // Progress string
        const total = entry.media.episodes ?? entry.media.chapters ?? "?";
        const unit = entry.media.episodes !== null ? "ep" : "ch";
        let progress = `${entry.progress}/${total} ${unit}`;
        if (entry.progressVolumes > 0) {
          const totalVol = entry.media.volumes ?? "?";
          progress += `, ${entry.progressVolumes}/${totalVol} vol`;
        }

        const lines = [
          `# ${title} (${entry.media.format ?? "?"})`,
          `Status: ${entry.status}`,
          `Score: ${score}`,
          `Progress: ${progress}`,
        ];

        // Dates
        if (entry.startedAt?.year) {
          const s = entry.startedAt;
          lines.push(
            `Started: ${s.year}-${String(s.month ?? 1).padStart(2, "0")}-${String(s.day ?? 1).padStart(2, "0")}`,
          );
        }
        if (entry.completedAt?.year) {
          const c = entry.completedAt;
          lines.push(
            `Completed: ${c.year}-${String(c.month ?? 1).padStart(2, "0")}-${String(c.day ?? 1).padStart(2, "0")}`,
          );
        }

        if (entry.notes) {
          lines.push(
            `Notes: ${entry.notes.slice(0, 200)}${entry.notes.length > 200 ? "..." : ""}`,
          );
        }

        lines.push(`Entry ID: ${entry.id}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "looking up list entry");
      }
    },
  });

  // === List Export ===

  server.addTool({
    name: "anilist_export",
    description:
      "Export a user's anime or manga list as CSV or JSON for backup or migration. " +
      "Use when the user wants to download, back up, or transfer their list data.",
    parameters: ListExportInputSchema,
    annotations: {
      title: "Export List",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        const entries = await anilistClient.fetchList(
          username,
          args.type,
          args.status,
        );

        if (entries.length === 0) {
          const statusLabel = args.status
            ? ` with status ${args.status}`
            : "";
          return `${username} has no ${args.type.toLowerCase()} entries${statusLabel}.`;
        }

        if (args.format === "json") {
          const rows = entries.map((e) => exportRow(e));
          return JSON.stringify(rows, null, 2);
        }

        // CSV
        const header =
          "title,type,format,status,score,progress,total,started,completed,updated,anilist_id,anilist_url";
        const rows = entries.map((e) => {
          const r = exportRow(e);
          return [
            csvEscape(r.title),
            r.type,
            r.format,
            r.status,
            r.score,
            r.progress,
            r.total,
            r.started,
            r.completed,
            r.updated,
            r.anilist_id,
            r.anilist_url,
          ].join(",");
        });

        return [header, ...rows].join("\n");
      } catch (error) {
        return throwToolError(error, "exporting list");
      }
    },
  });
}

/** Build an export row from a list entry */
function exportRow(e: AniListMediaListEntry) {
  const title = getTitle(e.media.title);
  const total = e.media.episodes ?? e.media.chapters ?? "";
  const started = fuzzyDateStr(e.startedAt);
  const completed = fuzzyDateStr(e.completedAt);
  const updated = e.updatedAt
    ? new Date(e.updatedAt * 1000).toISOString().slice(0, 10)
    : "";

  return {
    title,
    type: e.media.type ?? "",
    format: e.media.format ?? "",
    status: e.status,
    score: e.score > 0 ? e.score : "",
    progress: e.progress,
    total,
    started,
    completed,
    updated,
    anilist_id: e.media.id,
    anilist_url: e.media.siteUrl ?? `https://anilist.co/anime/${e.media.id}`,
  };
}

/** Format a FuzzyDate to YYYY-MM-DD or partial */
function fuzzyDateStr(d: {
  year: number | null;
  month: number | null;
  day: number | null;
} | null): string {
  if (!d || !d.year) return "";
  const y = String(d.year);
  const m = d.month ? String(d.month).padStart(2, "0") : "";
  const day = d.day ? String(d.day).padStart(2, "0") : "";
  if (m && day) return `${y}-${m}-${day}`;
  if (m) return `${y}-${m}`;
  return y;
}

/** Escape a value for CSV (wrap in quotes if needed) */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Fetch and format custom lists for a user */
async function handleCustomLists(
  username: string,
  args: {
    type: string;
    sort: string;
    limit: number;
    page: number;
    customListName?: string;
  },
  sort: string[],
): Promise<string> {
  const groups = await anilistClient.fetchListGroups(
    username,
    args.type,
    undefined,
    sort,
  );
  let customLists = groups.filter((g) => g.isCustomList);

  if (!customLists.length) {
    return `${username} has no custom ${args.type.toLowerCase()} lists.`;
  }

  // Filter to a specific named list
  if (args.customListName) {
    const target = args.customListName.toLowerCase();
    const match = customLists.filter((g) => g.name.toLowerCase() === target);
    if (!match.length) {
      const names = customLists.map((g) => g.name).join(", ");
      return `Custom list "${args.customListName}" not found. Available: ${names}`;
    }
    customLists = match;
  }

  // Flatten entries from matching custom lists
  const allEntries: AniListMediaListEntry[] = [];
  for (const list of customLists) {
    allEntries.push(...list.entries);
  }

  if (!allEntries.length) {
    const listLabel = args.customListName
      ? `custom list "${args.customListName}"`
      : "custom lists";
    return `${username}'s ${listLabel} have no entries.`;
  }

  sortEntries(allEntries, args.sort);

  const scoreFormat = await getScoreFormat(username);

  const totalCount = allEntries.length;
  const offset = (args.page - 1) * args.limit;
  const limited = allEntries.slice(offset, offset + args.limit);
  const hasNextPage = offset + args.limit < totalCount;

  const listLabel = args.customListName
    ? `custom list "${args.customListName}"`
    : `custom lists (${customLists.length} lists)`;
  const header =
    `${username}'s ${args.type} ${listLabel} - ${totalCount} entries` +
    (totalCount > limited.length ? `, showing ${limited.length}` : "");

  const formatted = limited.map((entry, i) =>
    formatListEntry(entry, offset + i + 1, scoreFormat),
  );

  const footer = paginationFooter(
    args.page,
    args.limit,
    totalCount,
    hasNextPage,
  );
  return (
    header + "\n\n" + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "")
  );
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
export function formatListEntry(
  entry: AniListMediaListEntry,
  index: number,
  scoreFmt: ScoreFormat,
): string {
  const media = entry.media;
  const title = getTitle(media.title);
  const format = media.format ?? "?";

  // Progress string (e.g. "5/12 ep" or "30/? ch, 5/20 vol")
  const total = media.episodes ?? media.chapters ?? "?";
  const unit = media.episodes !== null ? "ep" : "ch";
  let progress = `${entry.progress}/${total} ${unit}`;
  if (entry.progressVolumes > 0) {
    const totalVol = media.volumes ?? "?";
    progress += `, ${entry.progressVolumes}/${totalVol} vol`;
  }

  const score = formatScore(entry.score, scoreFmt);

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
    `   Status: ${entry.status} | Progress: ${progress} | Updated: ${updated} | Entry ID: ${entry.id}`,
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

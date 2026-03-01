/** User list tools: fetch and display a user's anime/manga list. */

import type { FastMCP } from "fastmcp";
import { ListInputSchema } from "../schemas.js";
import type { AniListMediaListEntry } from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  formatToolError,
  fetchList,
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
        const allEntries = await fetchList(username, args.type, status, sort);

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
        return formatToolError(error, "fetching list");
      }
    },
  });
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

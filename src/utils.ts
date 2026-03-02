/** Formatting and resolution helpers. */

import { UserError } from "fastmcp";
import type { AniListMedia } from "./types.js";

/** Best available title: English -> Romaji -> Native */
export function getTitle(title: AniListMedia["title"]): string {
  return title.english || title.romaji || title.native || "Unknown Title";
}

/** Truncate to max length, breaking at word boundary. Strips residual HTML. */
export function truncateDescription(
  text: string | null,
  maxLength = 500,
): string {
  if (!text) return "No description available.";
  // AniList descriptions can contain HTML even with asHtml: false
  const clean = text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  if (clean.length <= maxLength) return clean;
  const truncated = clean.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  // Break at the last space if it's within the final 20%, otherwise hard-cut to avoid losing too much
  return (
    (lastSpace > maxLength * 0.8 ? truncated.slice(0, lastSpace) : truncated) +
    "..."
  );
}

/** Resolve username from the provided arg or the configured default */
export function getDefaultUsername(provided?: string): string {
  const username = provided || process.env.ANILIST_USERNAME;
  if (!username) {
    throw new Error(
      "No username provided and ANILIST_USERNAME is not set. " +
        "Pass a username parameter, or set the ANILIST_USERNAME environment variable.",
    );
  }
  return username;
}

/** Re-throw as a UserError so MCP clients see isError: true */
export function throwToolError(error: unknown, action: string): never {
  if (error instanceof Error) {
    throw new UserError(`Error ${action}: ${error.message}`);
  }
  throw new UserError(`Unexpected error while ${action}. Please try again.`);
}

/** Pagination footer for multi-page results */
export function paginationFooter(
  page: number,
  limit: number,
  total: number,
  hasNextPage: boolean,
): string {
  const lastPage = Math.ceil(total / limit);
  if (lastPage <= 1) return "";
  const line = `Page ${page} of ${lastPage} (${total} total)`;
  return hasNextPage ? `${line}. Use page: ${page + 1} for more.` : line;
}

/** Format a media entry as a compact multi-line summary */
export function formatMediaSummary(media: AniListMedia): string {
  const title = getTitle(media.title);
  const format = media.format ?? "Unknown format";
  // Prefer season year, fall back to start date
  const year = media.seasonYear ?? media.startDate?.year ?? "?";
  const score = media.meanScore ? `${media.meanScore}/100` : "No score";
  const genres = media.genres?.length
    ? media.genres.join(", ")
    : "No genres listed";
  const studios = media.studios?.nodes?.length
    ? media.studios.nodes.map((s) => s.name).join(", ")
    : null;
  const nsfw = media.isAdult ? " [18+]" : "";

  // Anime has episodes, manga has chapters/volumes
  let length = "";
  if (media.episodes) length = `${media.episodes} episodes`;
  else if (media.chapters) length = `${media.chapters} chapters`;
  if (media.volumes) length += ` (${media.volumes} volumes)`;

  const lines = [
    `${title}${nsfw} (${format}, ${year}) - ${score}`,
    `  Genres: ${genres}`,
  ];

  if (length) lines.push(`  Length: ${length}`);
  if (studios) lines.push(`  Studio: ${studios}`);
  lines.push(`  URL: ${media.siteUrl}`);

  return lines.join("\n");
}

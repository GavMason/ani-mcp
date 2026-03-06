/** Formatting and resolution helpers. */

import { UserError } from "fastmcp";
import type {
  AniListDate,
  AniListMedia,
  ScoreFormat,
  UserStatsResponse,
  ViewerResponse,
} from "./types.js";
import { anilistClient } from "./api/client.js";
import { USER_STATS_QUERY, VIEWER_QUERY } from "./api/queries.js";

/** Best available title, respecting ANILIST_TITLE_LANGUAGE preference */
export function getTitle(title: AniListMedia["title"]): string {
  const pref = process.env.ANILIST_TITLE_LANGUAGE?.toLowerCase();
  if (pref === "romaji")
    return title.romaji || title.english || title.native || "Unknown Title";
  if (pref === "native")
    return title.native || title.romaji || title.english || "Unknown Title";
  // Default: english first
  return title.english || title.romaji || title.native || "Unknown Title";
}

/** Whether NSFW/adult content is enabled via env var (default: false) */
export function isNsfwEnabled(): boolean {
  const val = process.env.ANILIST_NSFW?.toLowerCase();
  return val === "true" || val === "1";
}

// Common abbreviations to full AniList titles
const ALIAS_MAP: Record<string, string> = {
  aot: "Attack on Titan",
  snk: "Shingeki no Kyojin",
  jjk: "Jujutsu Kaisen",
  csm: "Chainsaw Man",
  mha: "My Hero Academia",
  bnha: "Boku no Hero Academia",
  hxh: "Hunter x Hunter",
  fmab: "Fullmetal Alchemist Brotherhood",
  fma: "Fullmetal Alchemist",
  opm: "One Punch Man",
  sao: "Sword Art Online",
  re0: "Re:Zero",
  rezero: "Re:Zero",
  konosuba: "Kono Subarashii Sekai ni Shukufuku wo!",
  danmachi: "Is It Wrong to Try to Pick Up Girls in a Dungeon?",
  oregairu: "My Teen Romantic Comedy SNAFU",
  toradora: "Toradora!",
  nge: "Neon Genesis Evangelion",
  eva: "Neon Genesis Evangelion",
  ttgl: "Tengen Toppa Gurren Lagann",
  klk: "Kill la Kill",
  jojo: "JoJo's Bizarre Adventure",
  dbz: "Dragon Ball Z",
  dbs: "Dragon Ball Super",
  op: "One Piece",
  bc: "Black Clover",
  ds: "Demon Slayer",
  kny: "Demon Slayer",
  aob: "Blue Exorcist",
  mob: "Mob Psycho 100",
  yyh: "Yu Yu Hakusho",
};

/** Resolve common abbreviations to full titles */
export function resolveAlias(query: string): string {
  return ALIAS_MAP[query.toLowerCase()] ?? query;
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

/** Detect score format from env override or API fallback */
export async function detectScoreFormat(
  fetchFormat: () => Promise<ScoreFormat>,
): Promise<ScoreFormat> {
  const override = process.env.ANILIST_SCORE_FORMAT;
  if (override) return override as ScoreFormat;
  try {
    return await fetchFormat();
  } catch {
    return "POINT_10";
  }
}

/** Fetch score format for a user (by username) or the authenticated viewer */
export async function getScoreFormat(username?: string): Promise<ScoreFormat> {
  return detectScoreFormat(async () => {
    if (username) {
      const data = await anilistClient.query<UserStatsResponse>(
        USER_STATS_QUERY,
        { name: username },
        { cache: "stats" },
      );
      return data.User.mediaListOptions.scoreFormat;
    }
    const data = await anilistClient.query<ViewerResponse>(
      VIEWER_QUERY,
      {},
      { cache: "stats" },
    );
    return data.Viewer.mediaListOptions.scoreFormat;
  });
}

/** Sort direction map for browse/seasonal tools */
export const BROWSE_SORT_MAP: Record<string, string[]> = {
  SCORE: ["SCORE_DESC"],
  POPULARITY: ["POPULARITY_DESC"],
  TRENDING: ["TRENDING_DESC"],
};

/** Resolve season and year, defaulting to current if not provided */
export function resolveSeasonYear(
  season?: string,
  year?: number,
): { season: string; year: number } {
  const now = new Date();
  const currentYear = year ?? now.getFullYear();

  if (season) return { season, year: currentYear };

  // Derive current season from month
  const month = now.getMonth() + 1;
  const currentSeason =
    month <= 3
      ? "WINTER"
      : month <= 6
        ? "SPRING"
        : month <= 9
          ? "SUMMER"
          : "FALL";

  return { season: currentSeason, year: currentYear };
}

/** Convert an AniListDate to Unix epoch seconds, or null if year is missing */
export function dateToEpoch(date: AniListDate): number | null {
  if (date.year == null) return null;
  const month = date.month ?? 1;
  const day = date.day ?? 1;
  return new Date(date.year, month - 1, day).getTime() / 1000;
}

/** Display a normalized 0-10 score in the user's preferred format */
export function formatScore(score10: number, format: ScoreFormat): string {
  if (score10 <= 0) return "Unscored";
  switch (format) {
    case "POINT_100":
      return `${Math.round(score10 * 10)}/100`;
    case "POINT_10_DECIMAL":
      return `${score10.toFixed(1)}/10`;
    case "POINT_10":
      return `${Math.round(score10)}/10`;
    case "POINT_5": {
      const stars = Math.round(score10 / 2);
      return "★".repeat(stars) + "☆".repeat(5 - stars);
    }
    case "POINT_3": {
      if (score10 >= 7) return ":)";
      if (score10 >= 4) return ":|";
      return ":(";
    }
    default:
      return `${score10}/10`;
  }
}

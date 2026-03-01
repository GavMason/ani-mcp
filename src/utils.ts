/** Formatting and resolution helpers. */

import { anilistClient } from "./api/client.js";
import { USER_LIST_QUERY } from "./api/queries.js";
import type {
  AniListMedia,
  AniListMediaListEntry,
  UserListResponse,
} from "./types.js";

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

/** Fetch a user's list, flattened into a single array */
export async function fetchList(
  username: string,
  type: string,
  status?: string,
  sort?: string[],
): Promise<AniListMediaListEntry[]> {
  const variables: Record<string, unknown> = { userName: username, type };
  if (status) variables.status = status;
  if (sort) variables.sort = sort;

  const data = await anilistClient.query<UserListResponse>(
    USER_LIST_QUERY,
    variables,
    { cache: "list" },
  );

  // Flatten across status groups
  const entries: AniListMediaListEntry[] = [];
  for (const list of data.MediaListCollection.lists) {
    entries.push(...list.entries);
  }
  return entries;
}

/** Convert an error into a user-friendly message for the MCP response */
export function formatToolError(error: unknown, action: string): string {
  if (error instanceof Error) {
    return `Error ${action}: ${error.message}`;
  }
  return `Unexpected error while ${action}. Please try again.`;
}

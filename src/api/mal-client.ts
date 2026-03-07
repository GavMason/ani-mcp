/** Jikan (MyAnimeList) API client for read-only list import */

import pThrottle from "p-throttle";
import pRetry, { AbortError } from "p-retry";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const FETCH_TIMEOUT_MS = 15_000;

// Jikan rate limit: 3 req/sec (unauthenticated)
const throttle = pThrottle({
  limit: process.env.VITEST ? 10_000 : 3,
  interval: 1_000,
});
const throttled = throttle(() => {});

// === Types ===

export interface JikanAnimeEntry {
  score: number;
  episodes_watched: number;
  anime: {
    mal_id: number;
    title: string;
    type: string;
    episodes: number | null;
    score: number | null;
    genres: Array<{ mal_id: number; name: string }>;
    year: number | null;
  };
}

interface JikanListResponse {
  data: JikanAnimeEntry[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
  };
}

// === Genre Mapping ===

// MAL and AniList share most genre names; only map exceptions
const MAL_TO_ANILIST_GENRE: Record<string, string> = {
  "Sci-Fi": "Sci-Fi",
  "Slice of Life": "Slice of Life",
};

/** Map a MAL genre name to its AniList equivalent */
export function mapMalGenre(name: string): string {
  return MAL_TO_ANILIST_GENRE[name] ?? name;
}

/** Map a MAL format string to AniList format */
export function mapMalFormat(malType: string): string {
  const map: Record<string, string> = {
    TV: "TV",
    Movie: "MOVIE",
    OVA: "OVA",
    ONA: "ONA",
    Special: "SPECIAL",
    Music: "MUSIC",
  };
  return map[malType] ?? "TV";
}

// === Client ===

/** Fetch a MAL user's completed anime list via Jikan */
export async function fetchMalList(
  username: string,
  maxPages = 5,
): Promise<JikanAnimeEntry[]> {
  const entries: JikanAnimeEntry[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchPage(username, page);
    entries.push(...data.data);
    if (!data.pagination.has_next_page) break;
  }

  return entries;
}

async function fetchPage(
  username: string,
  page: number,
): Promise<JikanListResponse> {
  return pRetry(
    async () => {
      await throttled();
      const url = `${JIKAN_BASE}/users/${encodeURIComponent(username)}/animelist?status=completed&page=${page}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AbortError(`MAL user "${username}" not found.`);
        }
        throw new Error(`Jikan API error (HTTP ${response.status})`);
      }

      return (await response.json()) as JikanListResponse;
    },
    { retries: 3 },
  );
}

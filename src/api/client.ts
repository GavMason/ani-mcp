/**
 * AniList GraphQL API Client
 *
 * Handles rate limiting (token bucket), retry with exponential backoff,
 * and in-memory caching.
 */

import { LRUCache } from "lru-cache";
import pRetry, { AbortError } from "p-retry";
import pThrottle from "p-throttle";
import { USER_LIST_QUERY } from "./queries.js";
import type { AniListMediaListEntry, UserListResponse } from "../types.js";

const ANILIST_API_URL =
  process.env.ANILIST_API_URL || "https://graphql.anilist.co";

// No rate limit needed when API is mocked in tests
const RATE_LIMIT_PER_MINUTE = process.env.VITEST ? 10_000 : 85;
const MAX_RETRIES = 3;

// Hard timeout per fetch attempt (retries get their own timeout)
const FETCH_TIMEOUT_MS = 15_000;

// === Logging ===

const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

// Extract query operation name (e.g. "SearchMedia" from "query SearchMedia(...)")
function queryName(query: string): string {
  const match = query.match(/(?:query|mutation)\s+(\w+)/);
  return match ? match[1] : "unknown";
}

function log(event: string, detail?: string): void {
  if (!DEBUG) return;
  const msg = detail ? `[ani-mcp] ${event}: ${detail}` : `[ani-mcp] ${event}`;
  console.error(msg);
}

/** Per-category TTLs for the query cache */
export const CACHE_TTLS = {
  media: 60 * 60 * 1000, // 1h
  search: 2 * 60 * 1000, // 2m
  list: 5 * 60 * 1000, // 5m
  seasonal: 30 * 60 * 1000, // 30m
  stats: 10 * 60 * 1000, // 10m
  trending: 30 * 60 * 1000, // 30m
  schedule: 30 * 60 * 1000, // 30m
} as const;

export type CacheCategory = keyof typeof CACHE_TTLS;

// 85 req/60s, excess calls queue automatically
const rateLimit = pThrottle({
  limit: RATE_LIMIT_PER_MINUTE,
  interval: 60_000,
})(() => {});

// === In-Memory Cache ===

/** LRU cache with per-entry TTL, keyed on query + variables */
const queryCache = new LRUCache<string, Record<string, unknown>>({
  max: 500,
  allowStale: false,
});

/** Stable JSON serialization with sorted keys */
function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

// === Error Types ===

/** API error with HTTP status and retry eligibility */
export class AniListApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AniListApiError";
  }
}

// === Client ===

/** Options for a single query call */
export interface QueryOptions {
  /** Cache category to use. Pass null to skip caching. */
  cache?: CacheCategory | null;
}

/** Manages authenticated requests to the AniList GraphQL API */
class AniListClient {
  private token: string | undefined;

  constructor() {
    // Optional - unauthenticated requests still work for public data
    this.token = process.env.ANILIST_TOKEN || undefined;
  }

  /** Execute a GraphQL query with caching and automatic retry */
  async query<T = unknown>(
    query: string,
    variables: Record<string, unknown> = {},
    options: QueryOptions = {},
  ): Promise<T> {
    const cacheCategory = options.cache ?? null;

    const name = queryName(query);

    // Cache-through: return cached result or fetch, store, and return
    if (cacheCategory) {
      const cacheKey = `${query}::${stableStringify(variables)}`;
      const cached = queryCache.get(cacheKey);
      if (cached !== undefined) {
        log("cache-hit", name);
        return cached as T;
      }

      log("cache-miss", name);
      const data = await this.executeWithRetry<T>(query, variables);
      queryCache.set(cacheKey, data as Record<string, unknown>, {
        ttl: CACHE_TTLS[cacheCategory],
      });
      return data;
    }

    // No cache category - skip caching entirely
    return this.executeWithRetry<T>(query, variables);
  }

  /** Fetch a user's media list groups with metadata (name, status, isCustomList) */
  async fetchListGroups(
    username: string,
    type: string,
    status?: string,
    sort?: string[],
  ): Promise<UserListResponse["MediaListCollection"]["lists"]> {
    const variables: Record<string, unknown> = { userName: username, type };
    if (status) variables.status = status;
    if (sort) variables.sort = sort;

    const data = await this.query<UserListResponse>(
      USER_LIST_QUERY,
      variables,
      { cache: "list" },
    );

    return data.MediaListCollection.lists;
  }

  /** Fetch a user's media list, flattened into a single array */
  async fetchList(
    username: string,
    type: string,
    status?: string,
    sort?: string[],
  ): Promise<AniListMediaListEntry[]> {
    const lists = await this.fetchListGroups(username, type, status, sort);

    // Flatten across status groups
    const entries: AniListMediaListEntry[] = [];
    for (const list of lists) {
      entries.push(...list.entries);
    }
    return entries;
  }

  /** Invalidate the entire query cache */
  clearCache(): void {
    queryCache.clear();
  }

  /** Evict cache entries related to a specific user (lists and stats) */
  invalidateUser(username: string): void {
    const needle = `"${username}"`;
    for (const key of queryCache.keys()) {
      // Variable portion is after "::"
      const varPart = key.slice(key.indexOf("::") + 2);
      if (varPart.includes(needle)) {
        queryCache.delete(key);
      }
    }
  }

  /** Retries with exponential backoff via p-retry */
  private async executeWithRetry<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const name = queryName(query);
    log("fetch", name);
    return pRetry(
      async () => {
        await rateLimit();
        return this.makeRequest<T>(query, variables);
      },
      {
        retries: MAX_RETRIES,
        onFailedAttempt: (err) => {
          log(
            "retry",
            `${name} attempt ${err.attemptNumber}/${MAX_RETRIES + 1}`,
          );
        },
      },
    );
  }

  /** Send a single GraphQL POST request and parse the response */
  private async makeRequest<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Attach auth header if an OAuth token is configured
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Network errors (DNS, timeout, etc.) are retryable
    let response: Response;
    try {
      response = await fetch(ANILIST_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log("network-error", msg);
      const isTimeout = msg.includes("abort") || msg.includes("timeout");
      throw new AniListApiError(
        isTimeout
          ? "Could not reach AniList (request timed out). Try again."
          : `Network error connecting to AniList: ${msg}`,
        undefined,
        true,
      );
    }

    // Map HTTP errors to retryable/non-retryable
    if (!response.ok) {
      // Read error body for context
      const body = await response.text().catch(() => "");

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delaySec = retryAfter ? parseInt(retryAfter, 10) : 0;
        log(
          "rate-limit",
          `429 from AniList (retry-after: ${delaySec || "none"})`,
        );
        if (delaySec > 0) {
          await new Promise((r) => setTimeout(r, delaySec * 1000));
        }
        throw new AniListApiError(
          `AniList rate limit exceeded. Try again in ${delaySec > 0 ? `${delaySec} seconds` : "30-60 seconds"}.`,
          429,
          true,
        );
      }

      if (response.status === 401) {
        throw new AbortError(
          new AniListApiError(
            "Authentication failed. Check that ANILIST_TOKEN is valid and not expired.",
            401,
            false,
          ),
        );
      }

      if (response.status === 404) {
        throw new AbortError(
          new AniListApiError(
            "Not found on AniList. Check that the ID or username is correct.",
            404,
            false,
          ),
        );
      }

      // Only server errors (5xx) are worth retrying
      if (response.status >= 500) {
        throw new AniListApiError(
          `AniList API error (HTTP ${response.status}): ${body.slice(0, 200)}`,
          response.status,
          true,
        );
      }

      // Client errors (4xx except 429) are not worth retrying
      throw new AbortError(
        new AniListApiError(
          `AniList API error (HTTP ${response.status}): ${body.slice(0, 200)}`,
          response.status,
          false,
        ),
      );
    }

    // AniList can return both data and errors
    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string; status?: number }>;
    };

    // GraphQL can return 200 OK with errors in the body
    if (json.errors?.length) {
      // Prefer GraphQL error status over HTTP status
      const firstError = json.errors[0];
      const status = firstError.status ?? response.status;
      const retryable =
        status === 429 || (status !== undefined && status >= 500);
      const err = new AniListApiError(
        `AniList GraphQL error: ${firstError.message}`,
        status,
        retryable,
      );
      throw retryable ? err : new AbortError(err);
    }

    // Guard against empty response
    if (!json.data) {
      throw new AniListApiError(
        "AniList returned an empty response. Try again.",
      );
    }

    return json.data;
  }
}

/** Singleton. Rate limiter and cache must be shared across all tools. */
export const anilistClient = new AniListClient();

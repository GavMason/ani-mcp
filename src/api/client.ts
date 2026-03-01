/**
 * AniList GraphQL API Client
 *
 * Handles rate limiting (token bucket), retry with exponential backoff,
 * and in-memory caching.
 */

import { LRUCache } from "lru-cache";
import pRetry from "p-retry";
import pThrottle from "p-throttle";

const ANILIST_API_URL =
  process.env.ANILIST_API_URL || "https://graphql.anilist.co";

// Budget under the 90 req/min limit to leave headroom
const RATE_LIMIT_PER_MINUTE = 85;
const MAX_RETRIES = 3;

// Hard timeout per fetch attempt (retries get their own timeout)
const FETCH_TIMEOUT_MS = 15_000;

/** Per-category TTLs for the query cache */
export const CACHE_TTLS = {
  media: 60 * 60 * 1000, // 1h
  search: 2 * 60 * 1000, // 2m
  list: 5 * 60 * 1000, // 5m
  seasonal: 30 * 60 * 1000, // 30m
  stats: 10 * 60 * 1000, // 10m
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

    // Cache-through: return cached result or fetch, store, and return
    if (cacheCategory) {
      // Key on query + variables
      const cacheKey = `${query}::${JSON.stringify(variables)}`;
      const cached = queryCache.get(cacheKey);
      if (cached !== undefined) return cached as T;

      const data = await this.executeWithRetry<T>(query, variables);
      queryCache.set(cacheKey, data as Record<string, unknown>, {
        ttl: CACHE_TTLS[cacheCategory],
      });
      return data;
    }

    // No cache category - skip caching entirely
    return this.executeWithRetry<T>(query, variables);
  }

  /** Invalidate the entire query cache */
  clearCache(): void {
    queryCache.clear();
  }

  /** Retries with exponential backoff via p-retry */
  private async executeWithRetry<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    return pRetry(
      async () => {
        // Each attempt (including retries) counts toward the rate limit
        await rateLimit();
        return this.makeRequest<T>(query, variables);
      },
      {
        retries: MAX_RETRIES,
        shouldRetry: (error) => {
          // Non-retryable API errors (e.g. 404) abort immediately
          if (error instanceof AniListApiError && !error.retryable) {
            return false;
          }
          return true;
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
      throw new AniListApiError(
        `Network error connecting to AniList: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        true,
      );
    }

    // Map HTTP errors to retryable/non-retryable
    if (!response.ok) {
      // Read error body for context
      const body = await response.text().catch(() => "");

      if (response.status === 429) {
        throw new AniListApiError(
          "AniList rate limit hit. The server will retry automatically.",
          429,
          true,
        );
      }

      if (response.status === 404) {
        throw new AniListApiError(
          "Resource not found on AniList. Check that the ID or username is correct.",
          404,
          false,
        );
      }

      // Only server errors (5xx) are worth retrying
      const retryable = response.status >= 500;
      throw new AniListApiError(
        `AniList API error (HTTP ${response.status}): ${body.slice(0, 200)}`,
        response.status,
        retryable,
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
      throw new AniListApiError(
        `AniList GraphQL error: ${firstError.message}`,
        status,
        status === 429 || (status !== undefined && status >= 500),
      );
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

/** API client integration tests */

import { describe, it, expect } from "vitest";
import { anilistClient, AniListApiError, CACHE_TTLS, warmCache } from "../../src/api/client.js";
import { mswServer } from "../helpers/msw.js";
import { errorHandler, graphqlErrorHandler, timeoutHandler } from "../helpers/handlers.js";

const DUMMY_QUERY = `query { Media(id: 1) { id } }`;

// p-retry backoff needs longer timeout
const RETRY_TIMEOUT = 30_000;

describe("anilistClient.query", () => {
  it("returns parsed data on success", async () => {
    const data = await anilistClient.query<{ Page: { media: unknown[] } }>(
      `query SearchMedia { Page { pageInfo { total } media { id } } }`,
      {},
      { cache: null },
    );
    expect(data.Page.media).toBeDefined();
    expect(data.Page.media.length).toBeGreaterThan(0);
  });

  it(
    "throws non-retryable AniListApiError on 404",
    async () => {
      mswServer.use(errorHandler(404, "Not Found"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).status).toBe(404);
        expect((e as AniListApiError).retryable).toBe(false);
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws retryable AniListApiError on 429",
    async () => {
      mswServer.use(errorHandler(429, "Rate limited"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).status).toBe(429);
        expect((e as AniListApiError).retryable).toBe(true);
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws on GraphQL errors in 200 response",
    async () => {
      mswServer.use(graphqlErrorHandler("Validation error", 400));
      await expect(
        anilistClient.query(DUMMY_QUERY, {}, { cache: null }),
      ).rejects.toThrow("GraphQL error");
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws retryable AniListApiError on 500",
    async () => {
      mswServer.use(errorHandler(500, "Internal Server Error"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).status).toBe(500);
        expect((e as AniListApiError).retryable).toBe(true);
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws non-retryable AniListApiError on 401 with auth message",
    async () => {
      mswServer.use(errorHandler(401, "Unauthorized"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).status).toBe(401);
        expect((e as AniListApiError).retryable).toBe(false);
        expect((e as AniListApiError).message).toContain("Authentication failed");
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws non-retryable AniListApiError on 403",
    async () => {
      mswServer.use(errorHandler(403, "Forbidden"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).status).toBe(403);
        expect((e as AniListApiError).retryable).toBe(false);
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "includes retry timing in 429 error message",
    async () => {
      mswServer.use(errorHandler(429, "Rate limited"));
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).message).toContain("rate limit exceeded");
      }
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws on empty response body",
    async () => {
      // 200 with no data field
      mswServer.use(graphqlErrorHandler("No data", undefined));
      await expect(
        anilistClient.query(DUMMY_QUERY, {}, { cache: null }),
      ).rejects.toThrow();
    },
    RETRY_TIMEOUT,
  );

  it(
    "throws retryable AniList API error on network timeout",
    async () => {
      mswServer.use(timeoutHandler());
      try {
        await anilistClient.query(DUMMY_QUERY, {}, { cache: null });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AniListApiError);
        expect((e as AniListApiError).retryable).toBe(true);
        expect((e as AniListApiError).message).toContain("timed out");
      }
    },
    RETRY_TIMEOUT,
  );

  it("uses cache on repeated calls with same args", async () => {
    const query = `query SearchMedia { Page { media { id } } }`;
    const result1 = await anilistClient.query(
      query,
      { test: "cache" },
      { cache: "search" },
    );
    const result2 = await anilistClient.query(
      query,
      { test: "cache" },
      { cache: "search" },
    );
    expect(result1).toBe(result2);
  });

  it("skips cache when cache option is null", async () => {
    const query = `query SearchMedia { Page { media { id } } }`;
    const result1 = await anilistClient.query(
      query,
      { test: "nocache" },
      { cache: null },
    );
    const result2 = await anilistClient.query(
      query,
      { test: "nocache" },
      { cache: null },
    );
    // Equal values but distinct references
    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });

  it("exports CACHE_TTLS with positive values", () => {
    expect(CACHE_TTLS.media).toBeGreaterThan(0);
    expect(CACHE_TTLS.list).toBeGreaterThan(0);
    expect(CACHE_TTLS.search).toBeGreaterThan(0);
  });

  it("exports warmCache as a function", () => {
    expect(typeof warmCache).toBe("function");
  });
});

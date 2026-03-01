/** API client integration tests */

import { describe, it, expect } from "vitest";
import { anilistClient, AniListApiError } from "../../src/api/client.js";
import { mswServer } from "../helpers/msw.js";
import { errorHandler, graphqlErrorHandler } from "../helpers/handlers.js";

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
});

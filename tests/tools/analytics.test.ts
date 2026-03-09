/** Integration tests for analytics tools */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import {
  listHandler,
  multiStatusListHandler,
  batchRelationsHandler,
} from "../helpers/handlers.js";
import { makeEntry } from "../fixtures.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  process.env.ANILIST_USERNAME = "testuser";
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

// === anilist_calibration ===

describe("anilist_calibration", () => {
  it("returns calibration for scored entries", async () => {
    // User scores 9, community meanScore 60 -> delta +3
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: i + 1,
        score: 9,
        genres: ["Action", "Adventure"],
        meanScore: 60,
      }),
    );
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_calibration", { type: "ANIME" });
    expect(result).toContain("Score Calibration");
    expect(result).toContain("high");
    expect(result).toContain("Action");
  });

  it("handles empty scored list", async () => {
    const entries = [makeEntry({ score: 0 })];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_calibration", { type: "ANIME" });
    expect(result).toContain("no scored");
  });

  it("shows per-genre bias", async () => {
    const entries = [
      // Action: user 9, community 6 -> generous
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({ id: i + 1, score: 9, genres: ["Action"], meanScore: 60 }),
      ),
      // Horror: user 4, community 8 -> harsh
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({ id: i + 10, score: 4, genres: ["Horror"], meanScore: 80 }),
      ),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_calibration", { type: "ANIME" });
    expect(result).toContain("Action");
    expect(result).toContain("Horror");
    expect(result).toContain("higher");
    expect(result).toContain("lower");
  });
});

// === anilist_drops ===

describe("anilist_drops", () => {
  it("returns drop analysis", async () => {
    const dropped = Array.from({ length: 4 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 3,
        genres: ["Action"],
        episodes: 24,
      }),
    );
    const completed = Array.from({ length: 6 }, (_, i) =>
      makeEntry({
        id: i + 10,
        status: "COMPLETED",
        genres: ["Action"],
        episodes: 24,
      }),
    );
    mswServer.use(
      multiStatusListHandler({
        DROPPED: dropped,
        COMPLETED: completed,
      }),
    );

    const result = await callTool("anilist_drops", { type: "ANIME" });
    expect(result).toContain("Drop Patterns");
    expect(result).toContain("4 titles dropped");
    expect(result).toContain("Action");
    expect(result).toContain("drop rate");
  });

  it("handles no drops", async () => {
    mswServer.use(
      multiStatusListHandler({
        DROPPED: [],
        COMPLETED: [makeEntry()],
      }),
    );

    const result = await callTool("anilist_drops", { type: "ANIME" });
    expect(result).toContain("hasn't dropped");
  });

  it("reports early drops", async () => {
    // Drop at 2/24 = 8% -> early drop
    const dropped = Array.from({ length: 3 }, (_, i) =>
      makeEntry({
        id: i + 1,
        status: "DROPPED",
        progress: 2,
        genres: ["Action"],
        episodes: 24,
      }),
    );
    mswServer.use(
      multiStatusListHandler({
        DROPPED: dropped,
        COMPLETED: [],
      }),
    );

    const result = await callTool("anilist_drops", { type: "ANIME" });
    expect(result).toContain("early drops");
    expect(result).toContain("25%");
  });
});

// === anilist_evolution ===

describe("anilist_evolution", () => {
  it("returns genre evolution over time", async () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 1,
          genres: ["Action"],
          completedAt: { year: 2018, month: 6, day: 1 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 10,
          genres: ["Romance"],
          completedAt: { year: 2022, month: 6, day: 1 },
        }),
      ),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_evolution", { type: "ANIME" });
    expect(result).toContain("Genre Evolution");
    expect(result).toContain("Action");
    expect(result).toContain("Romance");
  });

  it("handles no dated entries", async () => {
    const entries = [
      makeEntry({
        id: 1,
        completedAt: { year: null, month: null, day: null },
      }),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_evolution", { type: "ANIME" });
    expect(result).toContain("no dated");
  });

  it("shows shift descriptions", async () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 1,
          genres: ["Action"],
          completedAt: { year: 2018, month: 1, day: 1 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 10,
          genres: ["Romance"],
          completedAt: { year: 2020, month: 1, day: 1 },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEntry({
          id: i + 20,
          genres: ["Horror"],
          completedAt: { year: 2023, month: 1, day: 1 },
        }),
      ),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_evolution", { type: "ANIME" });
    expect(result).toContain("Key shifts");
    expect(result).toContain("rose into top genres");
  });
});

// === anilist_completionist ===

describe("anilist_completionist", () => {
  it("returns franchise completion data", async () => {
    // User completed entry 1 but not 2 (sequel)
    const entries = [
      makeEntry({ id: 1, status: "COMPLETED" }),
    ];
    mswServer.use(
      listHandler(entries),
      batchRelationsHandler([
        {
          id: 1,
          title: { romaji: "Anime Season 1", english: "Anime Season 1" },
          relations: {
            edges: [
              {
                relationType: "SEQUEL",
                node: {
                  id: 2,
                  title: { romaji: "Anime Season 2", english: "Anime Season 2" },
                  format: "TV",
                  status: "FINISHED",
                  type: "ANIME",
                  season: null,
                  seasonYear: null,
                },
              },
            ],
          },
        },
        {
          id: 2,
          title: { romaji: "Anime Season 2", english: "Anime Season 2" },
          relations: {
            edges: [
              {
                relationType: "PREQUEL",
                node: {
                  id: 1,
                  title: { romaji: "Anime Season 1", english: "Anime Season 1" },
                  format: "TV",
                  status: "FINISHED",
                  type: "ANIME",
                  season: null,
                  seasonYear: null,
                },
              },
            ],
          },
        },
      ]),
    );

    const result = await callTool("anilist_completionist", { type: "ANIME" });
    expect(result).toContain("Franchise Completion");
    expect(result).toContain("1/2");
    expect(result).toContain("remaining");
  });

  it("handles no entries", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_completionist", { type: "ANIME" });
    expect(result).toContain("no anime entries");
  });
});

// === anilist_seasonal_stats ===

describe("anilist_seasonal_stats", () => {
  it("returns seasonal breakdown", async () => {
    const entries = [
      makeEntry({ id: 1, status: "COMPLETED", season: "SPRING", seasonYear: 2024 }),
      makeEntry({ id: 2, status: "COMPLETED", season: "SPRING", seasonYear: 2024 }),
      makeEntry({ id: 3, status: "DROPPED", season: "SPRING", seasonYear: 2024 }),
      makeEntry({ id: 4, status: "CURRENT", season: "SPRING", seasonYear: 2024 }),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_seasonal_stats", {
      season: "SPRING",
      year: 2024,
      history: 1,
    });
    expect(result).toContain("Seasonal Hit Rate");
    expect(result).toContain("SPRING 2024");
    expect(result).toContain("4 picked up");
    expect(result).toContain("2 finished");
    expect(result).toContain("1 dropped");
  });

  it("handles no anime entries", async () => {
    mswServer.use(listHandler([]));

    const result = await callTool("anilist_seasonal_stats", {
      season: "SPRING",
      year: 2024,
      history: 1,
    });
    expect(result).toContain("no anime entries");
  });

  it("shows multiple seasons", async () => {
    const entries = [
      makeEntry({ id: 1, status: "COMPLETED", season: "WINTER", seasonYear: 2024 }),
      makeEntry({ id: 2, status: "COMPLETED", season: "SPRING", seasonYear: 2024 }),
    ];
    mswServer.use(listHandler(entries));

    const result = await callTool("anilist_seasonal_stats", {
      season: "SPRING",
      year: 2024,
      history: 2,
    });
    expect(result).toContain("WINTER 2024");
    expect(result).toContain("SPRING 2024");
  });
});

// === anilist_pace ===

describe("anilist_pace", () => {
  it("returns pace estimates for current entries", async () => {
    // Started 4 weeks ago, at episode 8/24
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);
    const entries = [
      makeEntry({
        id: 1,
        status: "CURRENT",
        progress: 8,
        episodes: 24,
        startedAt: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate(),
        },
      }),
    ];
    mswServer.use(
      multiStatusListHandler({ CURRENT: entries }),
    );

    const result = await callTool("anilist_pace", { type: "ANIME" });
    expect(result).toContain("Pace Estimate");
    expect(result).toContain("8/24 ep");
    expect(result).toContain("ep/week");
    expect(result).toContain("weeks");
  });

  it("handles no current entries", async () => {
    mswServer.use(
      multiStatusListHandler({ CURRENT: [] }),
    );

    const result = await callTool("anilist_pace", { type: "ANIME" });
    expect(result).toContain("no current");
  });

  it("filters by mediaId", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);
    const entries = [
      makeEntry({
        id: 1,
        status: "CURRENT",
        progress: 4,
        episodes: 12,
        startedAt: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate(),
        },
      }),
      makeEntry({
        id: 2,
        status: "CURRENT",
        progress: 10,
        episodes: 24,
        startedAt: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate(),
        },
      }),
    ];
    mswServer.use(
      multiStatusListHandler({ CURRENT: entries }),
    );

    const result = await callTool("anilist_pace", {
      type: "ANIME",
      mediaId: 2,
    });
    expect(result).toContain("10/24 ep");
  });

  it("returns not found for wrong mediaId", async () => {
    mswServer.use(
      multiStatusListHandler({
        CURRENT: [makeEntry({ id: 1, status: "CURRENT" })],
      }),
    );

    const result = await callTool("anilist_pace", {
      type: "ANIME",
      mediaId: 999,
    });
    expect(result).toContain("not on");
  });
});

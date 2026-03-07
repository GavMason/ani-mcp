/** Integration tests for info tools (staff, schedule, characters, staff search, studio search, whoami) */

import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { makeEntry } from "../fixtures.js";
import {
  staffHandler,
  scheduleHandler,
  batchAiringHandler,
  characterHandler,
  staffSearchHandler,
  studioSearchHandler,
  multiStatusListHandler,
  listHandler,
  errorHandler,
} from "../helpers/handlers.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});
afterAll(async () => cleanup());

describe("anilist_staff", () => {
  it("returns staff and voice actors", async () => {
    const result = await callTool("anilist_staff", { title: "Test Anime" });

    expect(result).toContain("Staff:");
    expect(result).toContain("Production Staff");
    expect(result).toContain("Director");
    expect(result).toContain("Taro Yamada");
    expect(result).toContain("Characters & Voice Actors");
    expect(result).toContain("Hero");
    expect(result).toContain("Hanako Suzuki");
  });

  it("renders by ID", async () => {
    const result = await callTool("anilist_staff", { id: 1 });

    expect(result).toContain("Staff:");
    expect(result).toContain("Test Anime");
  });

  it("handles title with no staff gracefully", async () => {
    mswServer.use(
      staffHandler({
        id: 1,
        title: { romaji: "No Staff Show", english: "No Staff Show", native: null },
        format: "TV",
        siteUrl: "https://anilist.co/anime/1",
        staff: { edges: [] },
        characters: { edges: [] },
      }),
    );

    const result = await callTool("anilist_staff", { title: "No Staff Show" });

    expect(result).toContain("No Staff Show");
    expect(result).not.toContain("Production Staff");
    expect(result).not.toContain("Characters & Voice Actors");
  });
});

describe("anilist_schedule", () => {
  it("returns airing schedule with next episode", async () => {
    const result = await callTool("anilist_schedule", { title: "Test Anime" });

    expect(result).toContain("Schedule:");
    expect(result).toContain("RELEASING");
    expect(result).toContain("Next Episode: 5");
    expect(result).toContain("Episodes: 24");
    expect(result).toContain("Upcoming:");
  });

  it("shows time until airing", async () => {
    const result = await callTool("anilist_schedule", { id: 1 });

    // 86400 seconds = "1d 0h"
    expect(result).toContain("1d 0h");
  });

  it("handles finished anime with no upcoming episodes", async () => {
    mswServer.use(
      scheduleHandler({
        id: 1,
        title: { romaji: "Done Anime", english: "Done Anime", native: null },
        status: "FINISHED",
        episodes: 12,
        nextAiringEpisode: null,
        airingSchedule: { nodes: [] },
        siteUrl: "https://anilist.co/anime/1",
      }),
    );

    const result = await callTool("anilist_schedule", { id: 1 });

    expect(result).toContain("Done Anime");
    expect(result).toContain("FINISHED");
    expect(result).toContain("No upcoming episodes");
  });
});

describe("anilist_characters", () => {
  it("returns character search results", async () => {
    const result = await callTool("anilist_characters", {
      query: "Naruto",
      limit: 5,
    });

    expect(result).toContain("Naruto Uzumaki");
    expect(result).toContain("うずまきナルト");
    expect(result).toContain("50,000 favorites");
    expect(result).toContain("MAIN");
    expect(result).toContain("VA: Junko Takeuchi");
  });

  it("shows no-results message", async () => {
    mswServer.use(characterHandler([]));

    const result = await callTool("anilist_characters", {
      query: "nonexistent",
      limit: 5,
    });

    expect(result).toContain('No characters found matching "nonexistent"');
  });
});

describe("anilist_staff_search", () => {
  it("returns staff with deduped works and grouped roles", async () => {
    const result = await callTool("anilist_staff_search", {
      query: "Yamada",
    });

    expect(result).toContain("Taro Yamada");
    expect(result).toContain("山田太郎");
    expect(result).toContain("Director, Writer");
    expect(result).toContain("Test Anime");
    // Roles should be grouped for same media
    expect(result).toContain("Director, Script");
    expect(result).toContain("Another Anime");
  });

  it("shows no-results message for unknown staff", async () => {
    mswServer.use(staffSearchHandler([]));

    const result = await callTool("anilist_staff_search", {
      query: "nonexistent",
    });

    expect(result).toContain('No staff found matching "nonexistent"');
  });

  it("shows multiple staff matches", async () => {
    mswServer.use(
      staffSearchHandler([
        {
          id: 1,
          name: { full: "Alice", native: null },
          primaryOccupations: ["Director"],
          siteUrl: "https://anilist.co/staff/1",
          staffMedia: { edges: [] },
        },
        {
          id: 2,
          name: { full: "Bob", native: null },
          primaryOccupations: ["Animator"],
          siteUrl: "https://anilist.co/staff/2",
          staffMedia: { edges: [] },
        },
      ]),
    );

    const result = await callTool("anilist_staff_search", {
      query: "test",
      limit: 5,
    });

    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
    expect(result).toContain("Director");
    expect(result).toContain("Animator");
  });

  it("shows scores for works", async () => {
    const result = await callTool("anilist_staff_search", {
      query: "Yamada",
    });

    expect(result).toContain("85%");
    expect(result).toContain("90%");
  });
});

describe("anilist_studio_search", () => {
  it("returns studio with main and supporting productions", async () => {
    const result = await callTool("anilist_studio_search", {
      query: "Test Studio",
    });

    expect(result).toContain("Test Studio");
    expect(result).toContain("Animation Studio");
    expect(result).toContain("Main Productions");
    expect(result).toContain("Test Anime");
    expect(result).toContain("Supporting");
    expect(result).toContain("Collab Anime");
  });

  it("shows non-animation studio tag", async () => {
    mswServer.use(
      studioSearchHandler({
        id: 1,
        name: "Publisher Co",
        isAnimationStudio: false,
        siteUrl: "https://anilist.co/studio/1",
        media: { edges: [] },
      }),
    );

    const result = await callTool("anilist_studio_search", {
      query: "Publisher",
    });

    expect(result).toContain("Publisher Co");
    expect(result).toContain("(Studio)");
    expect(result).not.toContain("Animation Studio");
  });

  it("shows no-productions message when empty", async () => {
    mswServer.use(
      studioSearchHandler({
        id: 1,
        name: "Empty Studio",
        isAnimationStudio: true,
        siteUrl: "https://anilist.co/studio/1",
        media: { edges: [] },
      }),
    );

    const result = await callTool("anilist_studio_search", {
      query: "Empty",
    });

    expect(result).toContain("No productions found");
  });

  it("shows scores and status for works", async () => {
    const result = await callTool("anilist_studio_search", {
      query: "Test Studio",
    });

    expect(result).toContain("85%");
    expect(result).toContain("FINISHED");
    expect(result).toContain("78%");
  });
});

describe("anilist_whoami", () => {
  const savedToken = process.env.ANILIST_TOKEN;
  const savedUser = process.env.ANILIST_USERNAME;

  afterEach(() => {
    process.env.ANILIST_TOKEN = savedToken;
    process.env.ANILIST_USERNAME = savedUser;
  });

  it("returns auth info when token is set", async () => {
    process.env.ANILIST_TOKEN = "test-token";
    const result = await callTool("anilist_whoami", {});

    expect(result).toContain("Authenticated as: testuser");
    expect(result).toContain("AniList ID: 1");
    expect(result).toContain("Score format: POINT_10");
    expect(result).toContain("Profile:");
  });

  it("reports no token when unset", async () => {
    delete process.env.ANILIST_TOKEN;
    const result = await callTool("anilist_whoami", {});

    expect(result).toContain("ANILIST_TOKEN is not set");
    expect(result).toContain("anilist.co/settings/developer");
  });

  it("shows username match status", async () => {
    process.env.ANILIST_TOKEN = "test-token";
    process.env.ANILIST_USERNAME = "testuser";
    const result = await callTool("anilist_whoami", {});

    expect(result).toContain("matches authenticated user");
  });

  it("warns on username mismatch", async () => {
    process.env.ANILIST_TOKEN = "test-token";
    process.env.ANILIST_USERNAME = "otheruser";
    const result = await callTool("anilist_whoami", {});

    expect(result).toContain("does not match");
  });

  it("handles auth error", async () => {
    process.env.ANILIST_TOKEN = "bad-token";
    mswServer.use(errorHandler(401, "Unauthorized"));

    const result = await callTool("anilist_whoami", {});
    expect(result.toLowerCase()).toContain("authentication");
  });
});

describe("anilist_airing", () => {
  it("returns airing titles with countdown", async () => {
    // CURRENT list with one entry
    mswServer.use(
      multiStatusListHandler({
        CURRENT: [makeEntry({ id: 1, status: "CURRENT", progress: 4 })],
      }),
    );

    const result = await callTool("anilist_airing", {});

    expect(result).toContain("Airing tracker");
    expect(result).toContain("1 currently watching");
    expect(result).toContain("Ep 5");
    expect(result).toContain("Your progress: 4");
  });

  it("shows message when not watching anything", async () => {
    mswServer.use(listHandler([], "CURRENT"));

    const result = await callTool("anilist_airing", {});

    expect(result).toContain("not currently watching");
  });

  it("handles titles with no upcoming episodes", async () => {
    mswServer.use(
      multiStatusListHandler({
        CURRENT: [makeEntry({ id: 1, status: "CURRENT" })],
      }),
      batchAiringHandler([]),
    );

    const result = await callTool("anilist_airing", {});

    expect(result).toContain("0 with upcoming episodes");
  });
});

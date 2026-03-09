/** Integration tests for MCP prompts */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./helpers/server.js";

let getPrompt: Awaited<ReturnType<typeof createTestClient>>["getPrompt"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  getPrompt = client.getPrompt;
  cleanup = client.cleanup;
});

afterAll(async () => {
  await cleanup();
});

// === seasonal_review ===

describe("seasonal_review", () => {
  it("returns prompt referencing anilist_pick with SEASONAL source", async () => {
    const result = await getPrompt("seasonal_review");
    expect(result).toContain("anilist_pick");
    expect(result).toContain("SEASONAL");
    expect(result).toContain("taste profile");
  });

  it("interpolates season and year arguments", async () => {
    const result = await getPrompt("seasonal_review", {
      season: "WINTER",
      year: "2025",
    });
    expect(result).toContain("WINTER");
    expect(result).toContain("2025");
  });
});

// === what_to_watch ===

describe("what_to_watch", () => {
  it("returns prompt referencing anilist_session", async () => {
    const result = await getPrompt("what_to_watch");
    expect(result).toContain("anilist_session");
    expect(result).toContain("90 minutes");
  });

  it("includes mood and custom time budget", async () => {
    const result = await getPrompt("what_to_watch", {
      mood: "chill",
      minutes: "45",
    });
    expect(result).toContain("45 minutes");
    expect(result).toContain("chill");
  });
});

// === roast_my_taste ===

describe("roast_my_taste", () => {
  it("returns prompt referencing anilist_taste", async () => {
    const result = await getPrompt("roast_my_taste");
    expect(result).toContain("anilist_taste");
    expect(result).toContain("roast");
  });

  it("uses provided username", async () => {
    const result = await getPrompt("roast_my_taste", {
      username: "friend123",
    });
    expect(result).toContain("friend123");
  });
});

// === compare_us ===

describe("compare_us", () => {
  it("returns prompt referencing anilist_compare", async () => {
    const result = await getPrompt("compare_us", {
      other_username: "rival",
    });
    expect(result).toContain("anilist_compare");
    expect(result).toContain("rival");
    expect(result).toContain("taste differences");
  });
});

// === year_in_review ===

describe("year_in_review", () => {
  it("returns prompt referencing anilist_wrapped", async () => {
    const result = await getPrompt("year_in_review");
    expect(result).toContain("anilist_wrapped");
  });

  it("interpolates year argument", async () => {
    const result = await getPrompt("year_in_review", { year: "2024" });
    expect(result).toContain("2024");
  });
});

// === explain_title ===

describe("explain_title", () => {
  it("returns prompt referencing anilist_explain with title", async () => {
    const result = await getPrompt("explain_title", {
      title: "Vinland Saga",
    });
    expect(result).toContain("anilist_explain");
    expect(result).toContain("Vinland Saga");
  });
});

// === find_similar ===

describe("find_similar", () => {
  it("returns prompt referencing anilist_similar with title", async () => {
    const result = await getPrompt("find_similar", {
      title: "Steins;Gate",
    });
    expect(result).toContain("anilist_similar");
    expect(result).toContain("Steins;Gate");
  });
});

// === setup ===

describe("setup", () => {
  it("returns prompt referencing anilist_whoami", async () => {
    const result = await getPrompt("setup");
    expect(result).toContain("anilist_whoami");
    expect(result).toContain("ANILIST_USERNAME");
    expect(result).toContain("ANILIST_TOKEN");
  });
});

// === get_token ===

describe("get_token", () => {
  it("returns OAuth flow steps with redirect URL and anilist_whoami", async () => {
    const result = await getPrompt("get_token");
    expect(result).toContain("anilist.co/settings/developer");
    expect(result).toContain("oauth/pin");
    expect(result).toContain("client_id=CLIENT_ID");
    expect(result).toContain("anilist_whoami");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import { saveEntryHandler, deleteEntryHandler } from "../helpers/handlers.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

// Skip Viewer query in getScoreFormat
const savedScoreFormat = process.env.ANILIST_SCORE_FORMAT;
beforeAll(async () => {
  process.env.ANILIST_TOKEN = "test-token";
  process.env.ANILIST_SCORE_FORMAT = "POINT_10";
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});

afterAll(async () => {
  if (savedScoreFormat === undefined) delete process.env.ANILIST_SCORE_FORMAT;
  else process.env.ANILIST_SCORE_FORMAT = savedScoreFormat;
  await cleanup();
});

// === anilist_update_progress ===

describe("anilist_update_progress", () => {
  it("returns confirmation with status and progress", async () => {
    const result = await callTool("anilist_update_progress", {
      mediaId: 1,
      progress: 5,
    });
    expect(result).toContain("Progress updated");
    expect(result).toContain("Progress: 5");
    expect(result).toContain("Entry ID:");
  });

  it("defaults to CURRENT status", async () => {
    const result = await callTool("anilist_update_progress", {
      mediaId: 1,
      progress: 3,
    });
    expect(result).toContain("Status: CURRENT");
  });

  it("respects explicit status override", async () => {
    mswServer.use(
      saveEntryHandler({
        id: 99,
        mediaId: 1,
        status: "COMPLETED",
        score: 0,
        progress: 24,
      }),
    );
    const result = await callTool("anilist_update_progress", {
      mediaId: 1,
      progress: 24,
      status: "COMPLETED",
    });
    expect(result).toContain("Status: COMPLETED");
  });

  it("errors when ANILIST_TOKEN is missing", async () => {
    const saved = process.env.ANILIST_TOKEN;
    delete process.env.ANILIST_TOKEN;
    try {
      const result = await callTool("anilist_update_progress", {
        mediaId: 1,
        progress: 5,
      });
      expect(result).toContain("ANILIST_TOKEN");
    } finally {
      process.env.ANILIST_TOKEN = saved;
    }
  });
});

// === anilist_add_to_list ===

describe("anilist_add_to_list", () => {
  it("returns confirmation with status", async () => {
    mswServer.use(
      saveEntryHandler({
        id: 50,
        mediaId: 10,
        status: "PLANNING",
        score: 0,
        progress: 0,
      }),
    );
    const result = await callTool("anilist_add_to_list", {
      mediaId: 10,
      status: "PLANNING",
    });
    expect(result).toContain("Added to list");
    expect(result).toContain("Status: PLANNING");
    expect(result).toContain("Entry ID: 50");
  });

  it("includes score when provided", async () => {
    mswServer.use(
      saveEntryHandler({
        id: 50,
        mediaId: 10,
        status: "COMPLETED",
        score: 8,
        progress: 0,
      }),
    );
    const result = await callTool("anilist_add_to_list", {
      mediaId: 10,
      status: "COMPLETED",
      score: 8,
    });
    expect(result).toContain("Score: 8/10");
  });

  it("errors when ANILIST_TOKEN is missing", async () => {
    const saved = process.env.ANILIST_TOKEN;
    delete process.env.ANILIST_TOKEN;
    try {
      const result = await callTool("anilist_add_to_list", {
        mediaId: 1,
        status: "PLANNING",
      });
      expect(result).toContain("ANILIST_TOKEN");
    } finally {
      process.env.ANILIST_TOKEN = saved;
    }
  });
});

// === anilist_rate ===

describe("anilist_rate", () => {
  it("returns score confirmation for non-zero score", async () => {
    mswServer.use(
      saveEntryHandler({
        id: 99,
        mediaId: 1,
        status: "COMPLETED",
        score: 9,
        progress: 24,
      }),
    );
    const result = await callTool("anilist_rate", {
      mediaId: 1,
      score: 9,
    });
    expect(result).toContain("Score set to 9/10");
    expect(result).toContain("Entry ID:");
  });

  it("returns score removed for score of 0", async () => {
    mswServer.use(
      saveEntryHandler({
        id: 99,
        mediaId: 1,
        status: "COMPLETED",
        score: 0,
        progress: 24,
      }),
    );
    const result = await callTool("anilist_rate", {
      mediaId: 1,
      score: 0,
    });
    expect(result).toContain("Score removed");
  });

  it("errors when ANILIST_TOKEN is missing", async () => {
    const saved = process.env.ANILIST_TOKEN;
    delete process.env.ANILIST_TOKEN;
    try {
      const result = await callTool("anilist_rate", {
        mediaId: 1,
        score: 8,
      });
      expect(result).toContain("ANILIST_TOKEN");
    } finally {
      process.env.ANILIST_TOKEN = saved;
    }
  });
});

// === anilist_delete_from_list ===

describe("anilist_delete_from_list", () => {
  it("returns deletion confirmation", async () => {
    const result = await callTool("anilist_delete_from_list", {
      entryId: 42,
    });
    expect(result).toContain("Entry 42 deleted");
  });

  it("returns not found when deleted is false", async () => {
    mswServer.use(deleteEntryHandler(false));
    const result = await callTool("anilist_delete_from_list", {
      entryId: 999,
    });
    expect(result).toContain("not found or already removed");
  });

  it("errors when ANILIST_TOKEN is missing", async () => {
    const saved = process.env.ANILIST_TOKEN;
    delete process.env.ANILIST_TOKEN;
    try {
      const result = await callTool("anilist_delete_from_list", {
        entryId: 1,
      });
      expect(result).toContain("ANILIST_TOKEN");
    } finally {
      process.env.ANILIST_TOKEN = saved;
    }
  });
});

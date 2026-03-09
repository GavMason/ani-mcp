/** Integration tests for social tools: feed, profile, reviews, social v2 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestClient } from "../helpers/server.js";
import { mswServer } from "../helpers/msw.js";
import {
  feedHandler,
  profileHandler,
  reviewsHandler,
  listHandler,
  followingHandler,
  multiStatusListHandler,
} from "../helpers/handlers.js";
import { makeEntry } from "../fixtures.js";

let callTool: Awaited<ReturnType<typeof createTestClient>>["callTool"];
let cleanup: Awaited<ReturnType<typeof createTestClient>>["cleanup"];

beforeAll(async () => {
  const client = await createTestClient();
  callTool = client.callTool;
  cleanup = client.cleanup;
});

afterAll(async () => {
  await cleanup();
});

// === anilist_feed ===

describe("anilist_feed", () => {
  it("formats text and list activities", async () => {
    const result = await callTool("anilist_feed", { username: "testuser" });
    expect(result).toContain("Activity feed for testuser");
    // TextActivity
    expect(result).toContain("posted");
    expect(result).toContain("great anime");
    // ListActivity
    expect(result).toContain("watched episode");
    expect(result).toContain("Test Anime");
  });

  it("shows empty message when no activity", async () => {
    mswServer.use(feedHandler([]));
    const result = await callTool("anilist_feed", { username: "testuser" });
    expect(result).toContain("No recent activity");
  });

  it("shows pagination footer when more pages exist", async () => {
    const activities = [
      {
        __typename: "TextActivity",
        id: 1,
        text: "Hello",
        createdAt: 1700000000,
        user: { name: "testuser" },
      },
    ];
    mswServer.use(feedHandler(activities, { total: 10, hasNextPage: true }));
    const result = await callTool("anilist_feed", {
      username: "testuser",
      limit: 1,
    });
    expect(result).toContain("page: 2");
  });

  it("formats list activity with null progress", async () => {
    mswServer.use(
      feedHandler([
        {
          __typename: "ListActivity",
          id: 1,
          status: "completed",
          progress: null,
          createdAt: 1700000000,
          user: { name: "testuser" },
          media: {
            id: 1,
            title: { romaji: "Test Anime", english: "Test Anime", native: null },
            type: "ANIME",
          },
        },
      ]),
    );
    const result = await callTool("anilist_feed", { username: "testuser" });
    expect(result).toContain("completed");
    expect(result).toContain("Test Anime");
  });

  it("truncates long text activities", async () => {
    const longText = "x".repeat(300);
    mswServer.use(
      feedHandler([
        {
          __typename: "TextActivity",
          id: 1,
          text: longText,
          createdAt: 1700000000,
          user: { name: "testuser" },
        },
      ]),
    );
    const result = await callTool("anilist_feed", { username: "testuser" });
    expect(result).toContain("...");
    expect(result).not.toContain(longText);
  });
});

// === anilist_profile ===

describe("anilist_profile", () => {
  it("renders profile with stats and favourites", async () => {
    const result = await callTool("anilist_profile", { username: "testuser" });
    expect(result).toContain("# testuser");
    expect(result).toContain("anilist.co/user/testuser");
    // Bio
    expect(result).toContain("I love anime!");
    // Anime stats
    expect(result).toContain("50 titles");
    expect(result).toContain("600 episodes");
    // Manga stats
    expect(result).toContain("10 titles");
    expect(result).toContain("500 chapters");
    // Favourites
    expect(result).toContain("Fav Anime");
    expect(result).toContain("Hero");
    expect(result).toContain("Studio");
    // Member since
    expect(result).toContain("Member since");
  });

  it("handles user with no about", async () => {
    mswServer.use(
      profileHandler({
        id: 1,
        name: "quietuser",
        about: null,
        avatar: { large: null },
        bannerImage: null,
        siteUrl: "https://anilist.co/user/quietuser",
        createdAt: 1500000000,
        updatedAt: 1700000000,
        donatorTier: 0,
        statistics: {
          anime: { count: 5, meanScore: 7.0, episodesWatched: 60, minutesWatched: 1500 },
          manga: { count: 0, meanScore: 0, chaptersRead: 0, volumesRead: 0 },
        },
        favourites: {
          anime: { nodes: [] },
          manga: { nodes: [] },
          characters: { nodes: [] },
          staff: { nodes: [] },
          studios: { nodes: [] },
        },
      }),
    );
    const result = await callTool("anilist_profile", { username: "quietuser" });
    expect(result).toContain("# quietuser");
    expect(result).toContain("5 titles");
    // No favourites sections
    expect(result).not.toContain("Favourite Anime");
  });

  it("renders all favourite categories", async () => {
    mswServer.use(
      profileHandler({
        id: 1,
        name: "allfavs",
        about: null,
        avatar: { large: null },
        bannerImage: null,
        siteUrl: "https://anilist.co/user/allfavs",
        createdAt: 1500000000,
        updatedAt: 1700000000,
        donatorTier: 0,
        statistics: {
          anime: { count: 1, meanScore: 8.0, episodesWatched: 12, minutesWatched: 300 },
          manga: { count: 0, meanScore: 0, chaptersRead: 0, volumesRead: 0 },
        },
        favourites: {
          anime: { nodes: [{ id: 1, title: { romaji: "Anime A", english: null, native: null }, siteUrl: "" }] },
          manga: { nodes: [{ id: 2, title: { romaji: "Manga B", english: null, native: null }, siteUrl: "" }] },
          characters: { nodes: [{ id: 3, name: { full: "Char C" }, siteUrl: "" }] },
          staff: { nodes: [{ id: 4, name: { full: "Staff D" }, siteUrl: "" }] },
          studios: { nodes: [{ id: 5, name: "Studio E", siteUrl: "" }] },
        },
      }),
    );
    const result = await callTool("anilist_profile", { username: "allfavs" });
    expect(result).toContain("Anime A");
    expect(result).toContain("Manga B");
    expect(result).toContain("Char C");
    expect(result).toContain("Staff D");
    expect(result).toContain("Studio E");
  });
});

// === anilist_reviews ===

describe("anilist_reviews", () => {
  it("formats reviews with sentiment summary", async () => {
    const result = await callTool("anilist_reviews", { id: 1 });
    expect(result).toContain("Reviews for Test Anime");
    // Avg of 80 + 65 = 73
    expect(result).toContain("73");
    expect(result).toContain("Mixed");
    // Review content
    expect(result).toContain("80/100");
    expect(result).toContain("reviewer1");
    expect(result).toContain("A great anime");
    expect(result).toContain("65/100");
    expect(result).toContain("reviewer2");
    // Helpful ratio
    expect(result).toContain("15/20");
  });

  it("shows positive sentiment for high scores", async () => {
    mswServer.use(
      reviewsHandler({
        id: 1,
        title: { romaji: "Great Show", english: "Great Show", native: null },
        reviews: {
          pageInfo: { total: 1, hasNextPage: false },
          nodes: [
            {
              id: 1,
              score: 90,
              summary: "Masterpiece",
              body: "Amazing in every way.",
              rating: 50,
              ratingAmount: 55,
              createdAt: 1700000000,
              user: { name: "fan", siteUrl: "" },
            },
          ],
        },
      }),
    );
    const result = await callTool("anilist_reviews", { id: 1 });
    expect(result).toContain("Generally positive");
  });

  it("shows empty message when no reviews", async () => {
    mswServer.use(
      reviewsHandler({
        id: 1,
        title: { romaji: "No Reviews", english: "No Reviews", native: null },
        reviews: {
          pageInfo: { total: 0, hasNextPage: false },
          nodes: [],
        },
      }),
    );
    const result = await callTool("anilist_reviews", { id: 1 });
    expect(result).toContain("No reviews found");
  });

  it("searches by title", async () => {
    const result = await callTool("anilist_reviews", { title: "Test Anime" });
    expect(result).toContain("Reviews for Test Anime");
  });

  it("shows No votes for reviews with no ratings", async () => {
    mswServer.use(
      reviewsHandler({
        id: 1,
        title: { romaji: "Test", english: "Test", native: null },
        reviews: {
          pageInfo: { total: 1, hasNextPage: false },
          nodes: [
            {
              id: 1,
              score: 70,
              summary: "Good",
              body: "It was good.",
              rating: 0,
              ratingAmount: 0,
              createdAt: 1700000000,
              user: { name: "user1", siteUrl: "" },
            },
          ],
        },
      }),
    );
    const result = await callTool("anilist_reviews", { id: 1 });
    expect(result).toContain("No votes");
  });
});

// === anilist_group_pick ===

describe("anilist_group_pick", () => {
  it("finds titles on all users planning lists", async () => {
    // All three users share media ID 1
    const shared = makeEntry({ id: 1, genres: ["Action"], status: "PLANNING" });
    const only12 = makeEntry({ id: 2, genres: ["Comedy"], status: "PLANNING" });
    const only1 = makeEntry({ id: 3, genres: ["Drama"], status: "PLANNING" });

    mswServer.use(
      multiStatusListHandler({
        PLANNING: (() => {
          return [shared, only12, only1];
        })(),
      }),
    );

    const result = await callTool("anilist_group_pick", {
      users: ["user1", "user2", "user3"],
      source: "PLANNING",
    });
    // Default handler returns same list for all users, so all entries overlap
    expect(result).toContain("Group Picks");
    expect(result).toContain("user1");
    expect(result).toContain("Test Anime");
  });

  it("shows no overlap message when lists are disjoint", async () => {
    mswServer.use(listHandler([], "PLANNING"));
    const result = await callTool("anilist_group_pick", {
      users: ["user1", "user2"],
      source: "PLANNING",
    });
    expect(result).toContain("No overlap");
  });

  it("works with COMPLETED source", async () => {
    const result = await callTool("anilist_group_pick", {
      users: ["user1", "user2"],
      source: "COMPLETED",
    });
    expect(result).toContain("Group Picks");
    expect(result).toContain("completed");
  });
});

// === anilist_shared_planning ===

describe("anilist_shared_planning", () => {
  it("finds overlap between two users planning lists", async () => {
    const result = await callTool("anilist_shared_planning", {
      user1: "alice",
      user2: "bob",
    });
    // Default handler returns same entries for both, so full overlap
    expect(result).toContain("Shared Planning: alice & bob");
    expect(result).toContain("Overlap:");
    expect(result).toContain("Both planning to watch");
  });

  it("shows no overlap when lists are empty", async () => {
    mswServer.use(listHandler([], "PLANNING"));
    const result = await callTool("anilist_shared_planning", {
      user1: "alice",
      user2: "bob",
    });
    expect(result).toContain("No titles in common");
  });

  it("shows unique counts", async () => {
    const result = await callTool("anilist_shared_planning", {
      user1: "alice",
      user2: "bob",
    });
    // Default handler returns same list, so overlap = all, unique = 0
    expect(result).toContain("Overlap:");
  });
});

// === anilist_follow_suggestions ===

describe("anilist_follow_suggestions", () => {
  it("ranks followed users by compatibility", async () => {
    const result = await callTool("anilist_follow_suggestions", {
      username: "testuser",
    });
    // Default handlers: following returns friend1/friend2,
    // both share the default completed entries
    expect(result).toContain("Taste Matches");
    expect(result).toContain("compatible");
  });

  it("shows empty message when not following anyone", async () => {
    mswServer.use(followingHandler([]));
    const result = await callTool("anilist_follow_suggestions", {
      username: "testuser",
    });
    expect(result).toContain("isn't following anyone");
  });
});

// === anilist_react ===

describe("anilist_react", () => {
  beforeEach(() => {
    process.env.ANILIST_TOKEN = "test-token";
  });

  it("toggles like on an activity", async () => {
    const result = await callTool("anilist_react", {
      activityId: 1,
      action: "LIKE",
    });
    expect(result).toContain("Toggled like");
    expect(result).toContain("1");
  });

  it("posts a reply to an activity", async () => {
    const result = await callTool("anilist_react", {
      activityId: 1,
      action: "REPLY",
      text: "Great post!",
    });
    expect(result).toContain("Reply posted");
    expect(result).toContain("Great post!");
  });

  it("requires auth token", async () => {
    delete process.env.ANILIST_TOKEN;
    const result = await callTool("anilist_react", {
      activityId: 1,
      action: "LIKE",
    });
    expect(result).toContain("ANILIST_TOKEN");
  });
});

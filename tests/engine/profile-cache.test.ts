/** Unit tests for profile cache */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeListHash,
  getCachedProfile,
  setCachedProfile,
  invalidateUserProfiles,
  clearProfileCache,
} from "../../src/engine/profile-cache.js";
import type { TasteProfile } from "../../src/engine/taste.js";
import { makeEntry } from "../fixtures.js";

const mockProfile: TasteProfile = {
  genres: [{ name: "Action", weight: 8.5, count: 5 }],
  tags: [],
  themes: [],
  scoring: {
    meanScore: 7.5,
    median: 8,
    totalScored: 10,
    distribution: { 7: 3, 8: 4, 9: 3 },
    tendency: "balanced",
  },
  formats: [{ format: "TV", count: 8, percent: 80 }],
  totalCompleted: 10,
};

beforeEach(() => clearProfileCache());

describe("computeListHash", () => {
  it("produces stable hash for same entries", () => {
    const entries = [makeEntry({ id: 1, score: 8 }), makeEntry({ id: 2, score: 7 })];
    const hash1 = computeListHash(entries);
    const hash2 = computeListHash(entries);
    expect(hash1).toBe(hash2);
  });

  it("produces same hash regardless of entry order", () => {
    const a = makeEntry({ id: 1, score: 8 });
    const b = makeEntry({ id: 2, score: 7 });
    const hash1 = computeListHash([a, b]);
    const hash2 = computeListHash([b, a]);
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different scores", () => {
    const entries1 = [makeEntry({ id: 1, score: 8 })];
    const entries2 = [makeEntry({ id: 1, score: 9 })];
    expect(computeListHash(entries1)).not.toBe(computeListHash(entries2));
  });
});

describe("profile cache", () => {
  it("returns cached profile on hash match", () => {
    const entries = [makeEntry({ id: 1, score: 8 })];
    const hash = computeListHash(entries);
    setCachedProfile("testuser::ANIME", mockProfile, hash);
    const cached = getCachedProfile("testuser::ANIME", hash);
    expect(cached).toBe(mockProfile);
  });

  it("returns undefined on hash mismatch", () => {
    setCachedProfile("testuser::ANIME", mockProfile, "old-hash");
    const cached = getCachedProfile("testuser::ANIME", "new-hash");
    expect(cached).toBeUndefined();
  });

  it("returns undefined for missing key", () => {
    expect(getCachedProfile("missing::ANIME", "any")).toBeUndefined();
  });

  it("invalidates all profiles for a username", () => {
    setCachedProfile("testuser::ANIME", mockProfile, "hash1");
    setCachedProfile("testuser::MANGA", mockProfile, "hash2");
    setCachedProfile("otheruser::ANIME", mockProfile, "hash3");

    invalidateUserProfiles("testuser");

    expect(getCachedProfile("testuser::ANIME", "hash1")).toBeUndefined();
    expect(getCachedProfile("testuser::MANGA", "hash2")).toBeUndefined();
    expect(getCachedProfile("otheruser::ANIME", "hash3")).toBe(mockProfile);
  });

  it("invalidation is case-insensitive", () => {
    setCachedProfile("TestUser::ANIME", mockProfile, "hash1");
    invalidateUserProfiles("testuser");
    expect(getCachedProfile("TestUser::ANIME", "hash1")).toBeUndefined();
  });

  it("clear removes all entries", () => {
    setCachedProfile("a::ANIME", mockProfile, "h1");
    setCachedProfile("b::ANIME", mockProfile, "h2");
    clearProfileCache();
    expect(getCachedProfile("a::ANIME", "h1")).toBeUndefined();
    expect(getCachedProfile("b::ANIME", "h2")).toBeUndefined();
  });
});

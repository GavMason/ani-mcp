/** Shareable card image tools: taste profile, compatibility, wrapped, and seasonal recap */

import type { FastMCP } from "fastmcp";
import { imageContent, UserError } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  USER_PROFILE_QUERY,
  COMPLETED_BY_DATE_QUERY,
} from "../api/queries.js";
import type {
  UserProfileResponse,
  CompletedByDateResponse,
  AniListMediaListEntry,
} from "../types.js";
import {
  TasteCardInputSchema,
  CompatCardInputSchema,
  WrappedCardInputSchema,
  SeasonalRecapCardInputSchema,
} from "../schemas.js";
import { getDefaultUsername, getTitle } from "../utils.js";
import { buildTasteProfile } from "../engine/taste.js";
import {
  computeCompatibility,
  computeGenreDivergences,
} from "../engine/compare.js";
import {
  buildTasteCardSvg,
  buildCompatCardSvg,
  buildWrappedCardSvg,
  buildSeasonalRecapCardSvg,
  svgToPng,
  fetchAvatarB64,
  type CompatCardData,
  type SeasonalRecapData,
} from "../engine/card.js";
import {
  computeListHash,
  getCachedProfile,
  setCachedProfile,
} from "../engine/profile-cache.js";
import { computeWrappedStats } from "../engine/wrapped.js";

// === Registration ===

/** Register shareable card tools */
export function registerCardTools(server: FastMCP): void {
  // === Taste Profile Card ===

  server.addTool({
    name: "anilist_taste_card",
    description:
      "Generate a shareable taste profile card image for an AniList user. " +
      "Returns a PNG image showing top genres, themes, score distribution, " +
      "and format breakdown. Use when someone wants a visual summary of their anime taste.",
    parameters: TasteCardInputSchema,
    annotations: {
      title: "Taste Profile Card",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      const username = args.username ?? getDefaultUsername();

      // Fetch list and avatar in parallel
      const [entries, avatarUrl] = await Promise.all([
        anilistClient.fetchList(username, args.type, "COMPLETED"),
        getAvatarUrl(username),
      ]);

      if (entries.length === 0) {
        return `${username} has no completed ${args.type.toLowerCase()}.`;
      }

      // Use cached profile if available
      const cacheKey = `${username}::${args.type}`;
      const hash = computeListHash(entries);
      let profile = getCachedProfile(cacheKey, hash);
      if (!profile) {
        profile = buildTasteProfile(entries);
        setCachedProfile(cacheKey, profile, hash);
      }

      if (profile.genres.length === 0) {
        throw new UserError(
          `${username} doesn't have enough scored titles to generate a card. ` +
            `Score more titles on AniList for a taste card.`,
        );
      }

      const avatarB64 = avatarUrl ? await fetchAvatarB64(avatarUrl) : null;

      const svg = buildTasteCardSvg(username, profile, avatarB64);
      const png = await svgToPng(svg);
      return imageContent({ buffer: png });
    },
  });

  // === Compatibility Card ===

  server.addTool({
    name: "anilist_compat_card",
    description:
      "Generate a shareable compatibility card image comparing two AniList users. " +
      "Returns a PNG image showing compatibility %, genre comparison, shared favorites, " +
      "and key differences. Use when someone wants a visual comparison of taste.",
    parameters: CompatCardInputSchema,
    annotations: {
      title: "Compatibility Card",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      // Fetch both lists in parallel
      const [entries1, entries2] = await Promise.all([
        anilistClient.fetchList(args.user1, args.type, "COMPLETED"),
        anilistClient.fetchList(args.user2, args.type, "COMPLETED"),
      ]);

      if (entries1.length === 0) {
        return `${args.user1} has no completed ${args.type.toLowerCase()}.`;
      }
      if (entries2.length === 0) {
        return `${args.user2} has no completed ${args.type.toLowerCase()}.`;
      }

      const profile1 = buildTasteProfile(entries1);
      const profile2 = buildTasteProfile(entries2);

      // Find shared titles
      const scores1 = new Map(entries1.map((e) => [e.media.id, e]));
      const shared: Array<{
        title: string;
        score1: number;
        score2: number;
        id: number;
      }> = [];
      for (const e2 of entries2) {
        const e1 = scores1.get(e2.media.id);
        if (e1) {
          shared.push({
            title: getTitle(e1.media.title),
            score1: e1.score,
            score2: e2.score,
            id: e1.media.id,
          });
        }
      }

      const compatibility =
        shared.length >= 3 ? computeCompatibility(shared) : 0;

      // Shared favorites (both 8+)
      const sharedFavorites = shared
        .filter((s) => s.score1 >= 8 && s.score2 >= 8)
        .sort((a, b) => b.score1 + b.score2 - (a.score1 + a.score2))
        .slice(0, 5);

      const divergences = computeGenreDivergences(
        profile1,
        profile2,
        args.user1,
        args.user2,
      );

      // Fetch both avatars in parallel
      const [avatarUrl1, avatarUrl2] = await Promise.all([
        getAvatarUrl(args.user1),
        getAvatarUrl(args.user2),
      ]);
      const [avatar1, avatar2] = await Promise.all([
        avatarUrl1 ? fetchAvatarB64(avatarUrl1) : null,
        avatarUrl2 ? fetchAvatarB64(avatarUrl2) : null,
      ]);

      const data: CompatCardData = {
        user1: args.user1,
        user2: args.user2,
        compatibility,
        sharedCount: shared.length,
        sharedFavorites,
        divergences,
        profile1,
        profile2,
        avatar1,
        avatar2,
      };

      const svg = buildCompatCardSvg(data);
      const png = await svgToPng(svg);
      return imageContent({ buffer: png });
    },
  });

  // === Year Wrapped Card ===

  server.addTool({
    name: "anilist_wrapped_card",
    description:
      "Generate a shareable year-in-review card image for an AniList user. " +
      "Returns a PNG image showing titles completed, top genres, score distribution, " +
      "highlights, and consumption stats. Use when someone wants a visual recap of their year.",
    parameters: WrappedCardInputSchema,
    annotations: {
      title: "Year Wrapped Card",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      const username = args.username ?? getDefaultUsername();
      const year = args.year ?? new Date().getFullYear();

      const types: Array<"ANIME" | "MANGA"> =
        args.type === "BOTH"
          ? ["ANIME", "MANGA"]
          : [args.type as "ANIME" | "MANGA"];

      // Server-side date filter (FuzzyDateInt: YYYYMMDD)
      const completedAfter = year * 10000 + 100 + 1;
      const completedBefore = year * 10000 + 1231;

      // Paginate through results (types in parallel)
      async function fetchType(type: "ANIME" | "MANGA") {
        const results: AniListMediaListEntry[] = [];
        let page = 1;
        let hasNext = true;
        while (hasNext) {
          const data = await anilistClient.query<CompletedByDateResponse>(
            COMPLETED_BY_DATE_QUERY,
            {
              userName: username,
              type,
              completedAfter,
              completedBefore,
              page,
              perPage: 50,
            },
            { cache: "list" },
          );
          results.push(...data.Page.mediaList);
          hasNext = data.Page.pageInfo.hasNextPage;
          page++;
        }
        return results;
      }

      const [yearEntries, avatarUrl] = await Promise.all([
        Promise.all(types.map(fetchType)).then((r) => r.flat()),
        getAvatarUrl(username),
      ]);

      if (yearEntries.length === 0) {
        return `${username} didn't complete any titles in ${year}.`;
      }

      const stats = computeWrappedStats(yearEntries, year);

      // Fetch avatar and cover images in parallel
      const [avatarB64, topRatedCoverB64, controversialCoverB64] =
        await Promise.all([
          avatarUrl ? fetchAvatarB64(avatarUrl) : null,
          stats.topRated?.coverUrl ? fetchAvatarB64(stats.topRated.coverUrl) : null,
          stats.controversial?.coverUrl ? fetchAvatarB64(stats.controversial.coverUrl) : null,
        ]);

      const svg = buildWrappedCardSvg({
        username,
        avatarB64,
        stats,
        topRatedCoverB64,
        controversialCoverB64,
      });
      const png = await svgToPng(svg);
      return imageContent({ buffer: png });
    },
  });

  // === Seasonal Recap Card ===

  server.addTool({
    name: "anilist_seasonal_recap_card",
    description:
      "Generate a shareable seasonal recap card image for an AniList user. " +
      "Returns a PNG image showing pick/finish/drop counts, hit rate, " +
      "status breakdown, and top-scored titles from a season.",
    parameters: SeasonalRecapCardInputSchema,
    annotations: {
      title: "Seasonal Recap Card",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      const username = args.username ?? getDefaultUsername();

      // Default to current/most recent season
      const now = new Date();
      const month = now.getMonth() + 1;
      const defaultSeason =
        month <= 3
          ? "WINTER"
          : month <= 6
            ? "SPRING"
            : month <= 9
              ? "SUMMER"
              : "FALL";
      const season = args.season ?? defaultSeason;
      const year = args.year ?? now.getFullYear();

      // Fetch full list and filter to seasonal entries
      const [entries, avatarUrl] = await Promise.all([
        anilistClient.fetchList(username, "ANIME"),
        getAvatarUrl(username),
      ]);

      const seasonal = entries.filter(
        (e) => e.media.season === season && e.media.seasonYear === year,
      );

      if (seasonal.length === 0) {
        return `${username} has no entries from ${season} ${year}.`;
      }

      const finished = seasonal.filter((e) => e.status === "COMPLETED");
      const dropped = seasonal.filter((e) => e.status === "DROPPED");
      const watching = seasonal.filter(
        (e) => e.status === "CURRENT" || e.status === "PAUSED",
      );

      const scored = finished.filter((e) => e.score > 0);
      const avgScore =
        scored.length > 0
          ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length
          : 0;

      const topPickEntries = [...scored]
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      // Fetch avatar and cover images in parallel
      const [avatarB64, ...coverResults] = await Promise.all([
        avatarUrl ? fetchAvatarB64(avatarUrl) : null,
        ...topPickEntries.map((e) =>
          e.media.coverImage.extraLarge
            ? fetchAvatarB64(e.media.coverImage.extraLarge)
            : null,
        ),
      ]);

      const topPicks = topPickEntries.map((e, i) => ({
        title: getTitle(e.media.title),
        score: e.score,
        coverB64: coverResults[i],
      }));

      const data: SeasonalRecapData = {
        username,
        season,
        year,
        avatarB64,
        picked: seasonal.length,
        finished: finished.length,
        dropped: dropped.length,
        watching: watching.length,
        avgScore,
        topPicks,
      };

      const svg = buildSeasonalRecapCardSvg(data);
      const png = await svgToPng(svg);
      return imageContent({ buffer: png });
    },
  });
}

// === Helpers ===

async function getAvatarUrl(username: string): Promise<string | null> {
  try {
    const data = await anilistClient.query<UserProfileResponse>(
      USER_PROFILE_QUERY,
      { name: username },
      { cache: "stats" },
    );
    return data.User.avatar.large;
  } catch {
    return null;
  }
}

/** Social tools: activity feed, user profiles, community reviews, and social v2. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  ACTIVITY_FEED_QUERY,
  USER_PROFILE_QUERY,
  USER_STATS_QUERY,
  MEDIA_REVIEWS_QUERY,
  TOGGLE_LIKE_MUTATION,
  SAVE_ACTIVITY_REPLY_MUTATION,
  USER_FOLLOWING_QUERY,
  VIEWER_QUERY,
} from "../api/queries.js";
import {
  FeedInputSchema,
  ProfileInputSchema,
  ReviewsInputSchema,
  GroupPickInputSchema,
  SharedPlanningInputSchema,
  FollowSuggestionsInputSchema,
  ReactInputSchema,
} from "../schemas.js";
import type {
  ActivityFeedResponse,
  Activity,
  UserProfileResponse,
  UserStatsResponse,
  MediaReviewsResponse,
  ToggleLikeResponse,
  SaveActivityReplyResponse,
  UserFollowingResponse,
  ViewerResponse,
  AniListMediaListEntry,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  truncateDescription,
  throwToolError,
  paginationFooter,
} from "../utils.js";
import { buildTasteProfile } from "../engine/taste.js";
import { matchCandidates } from "../engine/matcher.js";
import { computeCompatibility } from "../engine/compare.js";
import { invalidateUserProfiles } from "../engine/profile-cache.js";

/** Register social and community tools */
export function registerSocialTools(server: FastMCP): void {
  // === Activity Feed ===

  server.addTool({
    name: "anilist_feed",
    description:
      "Get recent activity from a user's AniList feed. " +
      "Shows text posts and list updates (anime/manga status changes). " +
      "Returns numbered entries with author, date, and content. Supports pagination and type filtering.",
    parameters: FeedInputSchema,
    annotations: {
      title: "Activity Feed",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Resolve username to numeric ID for the activity query
        const userData = await anilistClient.query<UserStatsResponse>(
          USER_STATS_QUERY,
          { name: username },
          { cache: "stats" },
        );
        const userId = userData.User.id;

        const variables: Record<string, unknown> = {
          userId,
          page: args.page,
          perPage: args.limit,
        };
        if (args.type !== "ALL") variables.type = args.type;

        const data = await anilistClient.query<ActivityFeedResponse>(
          ACTIVITY_FEED_QUERY,
          variables,
          { cache: "search" },
        );

        const { activities, pageInfo } = data.Page;

        if (!activities.length) {
          return `No recent activity for ${username}.`;
        }

        const header = `Activity feed for ${username}`;
        const lines = activities.map((a, i) => formatActivity(a, i + 1));

        const footer = paginationFooter(
          args.page,
          args.limit,
          pageInfo.total,
          pageInfo.hasNextPage,
        );

        return (
          [header, "", ...lines].join("\n") + (footer ? `\n\n${footer}` : "")
        );
      } catch (error) {
        return throwToolError(error, "fetching activity feed");
      }
    },
  });

  // === User Profile ===

  server.addTool({
    name: "anilist_profile",
    description:
      "View a user's AniList profile including bio, stats, and favourites. " +
      "Returns bio, anime/manga stats summary, top favourites by category, and account age.",
    parameters: ProfileInputSchema,
    annotations: {
      title: "User Profile",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        const data = await anilistClient.query<UserProfileResponse>(
          USER_PROFILE_QUERY,
          { name: username },
          { cache: "stats" },
        );

        return formatProfile(data.User);
      } catch (error) {
        return throwToolError(error, "fetching profile");
      }
    },
  });

  // === Reviews ===

  const REVIEW_SORT_MAP: Record<string, string[]> = {
    HELPFUL: ["RATING_DESC"],
    NEWEST: ["CREATED_AT_DESC"],
  };

  server.addTool({
    name: "anilist_reviews",
    description:
      "Get community reviews for an anime or manga. " +
      "Use when the user wants to see what others think about a title. " +
      "Returns sentiment summary (positive/mixed/negative), individual review scores, summaries, and helpful ratios.",
    parameters: ReviewsInputSchema,
    annotations: {
      title: "Community Reviews",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {
          page: args.page,
          perPage: args.limit,
          sort: REVIEW_SORT_MAP[args.sort],
        };
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = args.title;

        const data = await anilistClient.query<MediaReviewsResponse>(
          MEDIA_REVIEWS_QUERY,
          variables,
          { cache: "media" },
        );

        const media = data.Media;
        const title = getTitle(media.title);
        const { nodes, pageInfo } = media.reviews;

        if (!nodes.length) {
          return `No reviews found for ${title}.`;
        }

        // Sentiment summary
        const avgScore = Math.round(
          nodes.reduce((sum, r) => sum + r.score, 0) / nodes.length,
        );
        const sentiment =
          avgScore >= 75
            ? "Generally positive"
            : avgScore >= 50
              ? "Mixed"
              : "Generally negative";
        const header = `Reviews for ${title} - ${sentiment} (avg ${avgScore}/100 across ${pageInfo.total} reviews)`;

        const formatted = nodes.map((r, i) => {
          const date = new Date(r.createdAt * 1000).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          );
          const helpful =
            r.ratingAmount > 0
              ? `${r.rating}/${r.ratingAmount} found helpful`
              : "No votes";
          const body = truncateDescription(r.body, 300);

          return [
            `${i + 1}. ${r.score}/100 by ${r.user.name} (${date})`,
            `   ${r.summary}`,
            `   ${body}`,
            `   ${helpful}`,
          ].join("\n");
        });

        const footer = paginationFooter(
          args.page,
          args.limit,
          pageInfo.total,
          pageInfo.hasNextPage,
        );

        return (
          [header, "", ...formatted].join("\n\n") +
          (footer ? `\n\n${footer}` : "")
        );
      } catch (error) {
        return throwToolError(error, "fetching reviews");
      }
    },
  });
  // === Group Recommendations ===

  server.addTool({
    name: "anilist_group_pick",
    description:
      "Find anime or manga for a group to watch together. " +
      "Finds titles on multiple users' planning lists (or highly rated by all). " +
      "Use when friends want to pick something everyone will enjoy.",
    parameters: GroupPickInputSchema,
    annotations: {
      title: "Group Recommendations",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const status = args.source === "PLANNING" ? "PLANNING" : "COMPLETED";

        // Fetch all users' lists in parallel
        const listsPromise = args.users.map((u) =>
          anilistClient.fetchList(u, args.type, status),
        );
        const allLists = await Promise.all(listsPromise);

        // Count how many users have each media ID
        const mediaCount = new Map<number, number>();
        const entryMap = new Map<number, AniListMediaListEntry>();
        for (const entries of allLists) {
          const seen = new Set<number>();
          for (const e of entries) {
            if (seen.has(e.media.id)) continue;
            seen.add(e.media.id);
            mediaCount.set(e.media.id, (mediaCount.get(e.media.id) ?? 0) + 1);
            if (!entryMap.has(e.media.id)) entryMap.set(e.media.id, e);
          }
        }

        // Titles present in every user's list
        const userCount = args.users.length;
        const shared = [...mediaCount.entries()]
          .filter(([, count]) => count === userCount)
          .map(([id]) => entryMap.get(id))
          .filter((e): e is AniListMediaListEntry => e !== undefined);

        if (shared.length === 0) {
          // Fall back to titles on most lists
          const maxOverlap = Math.max(...mediaCount.values());
          if (maxOverlap < 2) {
            return `No overlap found across ${userCount} users' ${status.toLowerCase()} lists.`;
          }

          const partial = [...mediaCount.entries()]
            .filter(([, count]) => count === maxOverlap)
            .map(([id]) => entryMap.get(id))
            .filter((e): e is AniListMediaListEntry => e !== undefined)
            .slice(0, args.limit);

          const lines = [
            `# Group Picks for ${args.users.join(", ")}`,
            `No titles on all ${userCount} lists, but ${partial.length} on ${maxOverlap}/${userCount}:`,
            "",
          ];
          for (let i = 0; i < partial.length; i++) {
            const e = partial[i];
            const title = getTitle(e.media.title);
            const score = e.media.meanScore
              ? ` (${(e.media.meanScore / 10).toFixed(1)}/10 community)`
              : "";
            lines.push(`${i + 1}. ${title}${score}`);
          }
          return lines.join("\n");
        }

        // Build a merged taste profile to rank shared titles
        const allEntries = allLists.flat();
        const scored = allEntries.filter((e) => e.score > 0);
        let rankedMedia: Array<{
          title: string;
          format: string | null;
          meanScore: number | null;
        }>;

        if (scored.length >= 5) {
          const profile = buildTasteProfile(scored);
          const matched = matchCandidates(
            shared.map((e) => e.media),
            profile,
          );
          rankedMedia = matched.slice(0, args.limit).map((m) => ({
            title: getTitle(m.media.title),
            format: m.media.format,
            meanScore: m.media.meanScore,
          }));
        } else {
          rankedMedia = shared
            .sort((a, b) => (b.media.meanScore ?? 0) - (a.media.meanScore ?? 0))
            .slice(0, args.limit)
            .map((e) => ({
              title: getTitle(e.media.title),
              format: e.media.format,
              meanScore: e.media.meanScore,
            }));
        }

        const lines = [
          `# Group Picks for ${args.users.join(", ")}`,
          `${shared.length} ${args.type.toLowerCase()} on all ${userCount} ${status.toLowerCase()} lists:`,
          "",
        ];

        for (let i = 0; i < rankedMedia.length; i++) {
          const e = rankedMedia[i];
          const parts: string[] = [];
          if (e.format) parts.push(e.format);
          if (e.meanScore) parts.push(`${(e.meanScore / 10).toFixed(1)}/10`);
          const meta = parts.length ? ` (${parts.join(" - ")})` : "";
          lines.push(`${i + 1}. ${e.title}${meta}`);
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "finding group recommendations");
      }
    },
  });

  // === Shared Planning ===

  server.addTool({
    name: "anilist_shared_planning",
    description:
      "Find titles on both users' planning lists. " +
      "Use when two users want to see what they're both planning to watch or read. " +
      "Shows overlap and unique titles.",
    parameters: SharedPlanningInputSchema,
    annotations: {
      title: "Shared Planning",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const [list1, list2] = await Promise.all([
          anilistClient.fetchList(args.user1, args.type, "PLANNING"),
          anilistClient.fetchList(args.user2, args.type, "PLANNING"),
        ]);

        const ids1 = new Set(list1.map((e) => e.media.id));
        const ids2 = new Set(list2.map((e) => e.media.id));
        const entryMap = new Map<number, AniListMediaListEntry>();
        for (const e of [...list1, ...list2]) entryMap.set(e.media.id, e);

        // Shared titles
        const sharedIds = [...ids1].filter((id) => ids2.has(id));
        const shared = sharedIds
          .map((id) => entryMap.get(id))
          .filter((e): e is AniListMediaListEntry => e !== undefined)
          .sort((a, b) => (b.media.meanScore ?? 0) - (a.media.meanScore ?? 0));

        const lines = [
          `# Shared Planning: ${args.user1} & ${args.user2}`,
          `${args.user1}: ${list1.length} | ${args.user2}: ${list2.length} | Overlap: ${shared.length}`,
          "",
        ];

        if (shared.length === 0) {
          lines.push("No titles in common on both planning lists.");
        } else {
          lines.push("Both planning to watch:");
          const show = shared.slice(0, args.limit);
          for (let i = 0; i < show.length; i++) {
            const e = show[i];
            const title = getTitle(e.media.title);
            const score = e.media.meanScore
              ? ` (${(e.media.meanScore / 10).toFixed(1)}/10)`
              : "";
            lines.push(`${i + 1}. ${title}${score}`);
          }

          if (shared.length > args.limit) {
            lines.push(`...and ${shared.length - args.limit} more`);
          }
        }

        // Unique counts
        const only1 = list1.filter((e) => !ids2.has(e.media.id)).length;
        const only2 = list2.filter((e) => !ids1.has(e.media.id)).length;
        if (only1 > 0 || only2 > 0) {
          lines.push("");
          if (only1 > 0) lines.push(`Only ${args.user1}: ${only1} titles`);
          if (only2 > 0) lines.push(`Only ${args.user2}: ${only2} titles`);
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "comparing planning lists");
      }
    },
  });

  // === Follow Suggestions ===

  server.addTool({
    name: "anilist_follow_suggestions",
    description:
      "Find AniList users with similar taste from your following list. " +
      "Ranks people you follow by taste compatibility to highlight your best matches. " +
      "Requires ANILIST_TOKEN for following list access.",
    parameters: FollowSuggestionsInputSchema,
    annotations: {
      title: "Follow Suggestions",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Resolve user ID
        const userData = await anilistClient.query<UserStatsResponse>(
          USER_STATS_QUERY,
          { name: username },
          { cache: "stats" },
        );
        const userId = userData.User.id;

        // Fetch following list (paginate up to 100)
        const following: Array<{ id: number; name: string }> = [];
        let page = 1;
        let hasNext = true;
        while (hasNext && following.length < 100) {
          const data = await anilistClient.query<UserFollowingResponse>(
            USER_FOLLOWING_QUERY,
            { userId, page, perPage: 50 },
            { cache: "stats" },
          );
          following.push(...data.Page.following);
          hasNext = data.Page.pageInfo.hasNextPage;
          page++;
        }

        if (following.length === 0) {
          return `${username} isn't following anyone on AniList.`;
        }

        // Build the target user's taste profile
        const userEntries = await anilistClient.fetchList(
          username,
          args.type,
          "COMPLETED",
        );
        if (userEntries.length < 5) {
          return `${username} needs at least 5 completed ${args.type.toLowerCase()} for taste matching.`;
        }

        const userScores = new Map(userEntries.map((e) => [e.media.id, e]));

        // Compare with each followed user (in batches to limit API load)
        const results: Array<{
          name: string;
          compatibility: number;
          sharedCount: number;
        }> = [];

        // Limit to 20 most recently followed to stay within rate limits
        const candidates = following.slice(0, 20);

        const candidateListsPromise = candidates.map(async (f) => {
          try {
            return {
              name: f.name,
              entries: await anilistClient.fetchList(
                f.name,
                args.type,
                "COMPLETED",
              ),
            };
          } catch {
            return null;
          }
        });
        const candidateLists = await Promise.all(candidateListsPromise);

        for (const cl of candidateLists) {
          if (!cl || cl.entries.length < 5) continue;

          // Find shared titles and compute compatibility
          const shared: Array<{ score1: number; score2: number }> = [];
          for (const e of cl.entries) {
            const mine = userScores.get(e.media.id);
            if (mine) {
              shared.push({ score1: mine.score, score2: e.score });
            }
          }

          if (shared.length < 3) continue;

          const compat = computeCompatibility(shared);
          results.push({
            name: cl.name,
            compatibility: compat,
            sharedCount: shared.length,
          });
        }

        if (results.length === 0) {
          return `Not enough shared titles with anyone ${username} follows to compute compatibility.`;
        }

        // Sort by compatibility
        results.sort((a, b) => b.compatibility - a.compatibility);
        const top = results.slice(0, args.limit);

        const lines = [
          `# Taste Matches for ${username}`,
          `Ranked ${results.length} followed users by ${args.type.toLowerCase()} compatibility:`,
          "",
        ];

        for (let i = 0; i < top.length; i++) {
          const r = top[i];
          lines.push(
            `${i + 1}. ${r.name} - ${r.compatibility}% compatible (${r.sharedCount} shared)`,
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "finding follow suggestions");
      }
    },
  });

  // === Activity Reactions ===

  server.addTool({
    name: "anilist_react",
    description:
      "Like or reply to an AniList activity. " +
      "Use when the user wants to interact with an activity from their feed. " +
      "Requires ANILIST_TOKEN. LIKE toggles the like state.",
    parameters: ReactInputSchema,
    annotations: {
      title: "React to Activity",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        if (!process.env.ANILIST_TOKEN) {
          throw new Error(
            "ANILIST_TOKEN is not set. Activity reactions require authentication.",
          );
        }

        if (args.action === "LIKE") {
          await anilistClient.query<ToggleLikeResponse>(
            TOGGLE_LIKE_MUTATION,
            { id: args.activityId, type: "ACTIVITY" },
            { cache: null },
          );

          // Invalidate feed cache
          const viewer = await anilistClient.query<ViewerResponse>(
            VIEWER_QUERY,
            {},
            { cache: "stats" },
          );
          anilistClient.invalidateUser(viewer.Viewer.name);

          return `Toggled like on activity ${args.activityId}.`;
        }

        // REPLY
        const data = await anilistClient.query<SaveActivityReplyResponse>(
          SAVE_ACTIVITY_REPLY_MUTATION,
          { activityId: args.activityId, text: args.text },
          { cache: null },
        );

        // Invalidate feed cache
        const viewer = await anilistClient.query<ViewerResponse>(
          VIEWER_QUERY,
          {},
          { cache: "stats" },
        );
        anilistClient.invalidateUser(viewer.Viewer.name);
        invalidateUserProfiles(viewer.Viewer.name);

        return `Reply posted on activity ${args.activityId}: "${data.SaveActivityReply.text}"`;
      } catch (error) {
        return throwToolError(error, "reacting to activity");
      }
    },
  });
}

// === Formatting Helpers ===

/** Format a user profile as text */
export function formatProfile(user: UserProfileResponse["User"]): string {
  const lines: string[] = [`# ${user.name}`, user.siteUrl, ""];

  // About/bio
  if (user.about) {
    lines.push(truncateDescription(user.about, 500), "");
  }

  // Anime stats
  const a = user.statistics.anime;
  if (a.count > 0) {
    const days = (a.minutesWatched / 1440).toFixed(1);
    lines.push(
      `## Anime: ${a.count} titles | ${a.episodesWatched} episodes | ${days} days | Mean ${a.meanScore.toFixed(1)}`,
    );
  }

  // Manga stats
  const m = user.statistics.manga;
  if (m.count > 0) {
    lines.push(
      `## Manga: ${m.count} titles | ${m.chaptersRead} chapters | ${m.volumesRead} volumes | Mean ${m.meanScore.toFixed(1)}`,
    );
  }

  // Favourites
  const fav = user.favourites;
  if (fav.anime.nodes.length) {
    lines.push(
      "",
      "Favourite Anime: " +
        fav.anime.nodes.map((n) => getTitle(n.title)).join(", "),
    );
  }
  if (fav.manga.nodes.length) {
    lines.push(
      "Favourite Manga: " +
        fav.manga.nodes.map((n) => getTitle(n.title)).join(", "),
    );
  }
  if (fav.characters.nodes.length) {
    lines.push(
      "Favourite Characters: " +
        fav.characters.nodes.map((n) => n.name.full).join(", "),
    );
  }
  if (fav.staff.nodes.length) {
    lines.push(
      "Favourite Staff: " + fav.staff.nodes.map((n) => n.name.full).join(", "),
    );
  }
  if (fav.studios.nodes.length) {
    lines.push(
      "Favourite Studios: " + fav.studios.nodes.map((n) => n.name).join(", "),
    );
  }

  // Account age
  const created = new Date(user.createdAt * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  lines.push("", `Member since ${created}`);

  return lines.join("\n");
}

/** Format a single activity entry */
function formatActivity(activity: Activity, index: number): string {
  const date = new Date(activity.createdAt * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (activity.__typename === "TextActivity") {
    const text =
      activity.text.length > 200
        ? activity.text.slice(0, 200) + "..."
        : activity.text;
    return `${index}. ${activity.user.name} posted (${date}):\n   ${text}`;
  }

  // List activity
  const title = getTitle(activity.media.title);
  const progress = activity.progress ? ` ${activity.progress}` : "";
  return `${index}. ${activity.user.name} ${activity.status}${progress} ${title} (${date})`;
}

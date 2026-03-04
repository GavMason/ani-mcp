/** Social tools: activity feed, user profiles, and community reviews. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  ACTIVITY_FEED_QUERY,
  USER_PROFILE_QUERY,
  USER_STATS_QUERY,
  MEDIA_REVIEWS_QUERY,
} from "../api/queries.js";
import {
  FeedInputSchema,
  ProfileInputSchema,
  ReviewsInputSchema,
} from "../schemas.js";
import type {
  ActivityFeedResponse,
  Activity,
  UserProfileResponse,
  UserStatsResponse,
  MediaReviewsResponse,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  truncateDescription,
  throwToolError,
  paginationFooter,
} from "../utils.js";

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

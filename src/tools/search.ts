/** Search and discovery tools: find anime/manga by query or get full details. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  SEARCH_MEDIA_QUERY,
  MEDIA_DETAILS_QUERY,
  SEASONAL_MEDIA_QUERY,
  RECOMMENDATIONS_QUERY,
} from "../api/queries.js";
import {
  SearchInputSchema,
  DetailsInputSchema,
  SeasonalInputSchema,
  RecommendationsInputSchema,
} from "../schemas.js";
import type {
  SearchMediaResponse,
  MediaDetailsResponse,
  RecommendationsResponse,
} from "../types.js";
import {
  getTitle,
  truncateDescription,
  throwToolError,
  formatMediaSummary,
  paginationFooter,
  isNsfwEnabled,
  resolveAlias,
  resolveSeasonYear,
  BROWSE_SORT_MAP,
} from "../utils.js";

// Default to popularity for broad queries
const SEARCH_SORT = ["POPULARITY_DESC"] as const;

// === Tool Registration ===

/** Register search and details tools on the MCP server */
export function registerSearchTools(server: FastMCP): void {
  server.addTool({
    name: "anilist_search",
    description:
      "Search for anime or manga by title with optional filters. " +
      "Use when the user wants to find an anime/manga by name, discover titles " +
      "in a genre, or find what aired in a specific year. Supports common abbreviations (aot, jjk, csm). " +
      "Returns ranked list with title, format, year, score, genres, episode count, studios, and AniList URL.",
    parameters: SearchInputSchema,
    annotations: {
      title: "Search Anime/Manga",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const query = resolveAlias(args.query);
        const variables: Record<string, unknown> = {
          search: query,
          type: args.type,
          page: args.page,
          perPage: args.limit,
          sort: SEARCH_SORT,
        };

        // Only include set filters
        if (args.genre) variables.genre = [args.genre];
        if (args.year) variables.year = args.year;
        if (args.format) variables.format = args.format;
        if (!args.isAdult) variables.isAdult = false;

        const data = await anilistClient.query<SearchMediaResponse>(
          SEARCH_MEDIA_QUERY,
          variables,
          { cache: "search" },
        );

        const results = data.Page.media;
        const pageInfo = data.Page.pageInfo;

        if (!results.length) {
          return `No ${args.type.toLowerCase()} found matching "${args.query}". Try a different spelling or broader search.`;
        }

        const offset = (args.page - 1) * args.limit;
        const header = [
          `Found ${pageInfo.total} ${args.type.toLowerCase()} matching "${args.query}"`,
          `Showing ${results.length} results:`,
          "",
        ].join("\n");

        const formatted = results.map(
          (m, i) => `${offset + i + 1}. ${formatMediaSummary(m)}`,
        );

        const footer = paginationFooter(
          args.page,
          args.limit,
          pageInfo.total,
          pageInfo.hasNextPage,
        );
        return (
          header + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "")
        );
      } catch (error) {
        return throwToolError(error, "searching");
      }
    },
  });

  server.addTool({
    name: "anilist_details",
    description:
      "Get full details about a specific anime or manga. " +
      "Use when the user asks about a specific title and wants synopsis, score, " +
      "episodes, studios, related works, and recommendations. " +
      "Accepts AniList ID (faster, exact) or title (fuzzy match with abbreviation support). " +
      "Returns format, status, episodes/chapters, season, score, studios, source, genres, tags, " +
      "synopsis, related works, and community recommendations.",
    parameters: DetailsInputSchema,
    annotations: {
      title: "Get Title Details",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {};
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = resolveAlias(args.title);

        const data = await anilistClient.query<MediaDetailsResponse>(
          MEDIA_DETAILS_QUERY,
          variables,
          { cache: "media" },
        );

        const m = data.Media;
        const title = getTitle(m.title);
        // Show romaji in parens when it differs from English
        const altTitle =
          m.title.english &&
          m.title.romaji &&
          m.title.english !== m.title.romaji
            ? ` (${m.title.romaji})`
            : "";

        const lines: string[] = [
          `# ${title}${altTitle}`,
          "",
          `Format: ${m.format ?? "Unknown"} | Status: ${m.status ?? "Unknown"}`,
        ];

        // Anime has episodes, manga has chapters/volumes
        if (m.episodes) lines.push(`Episodes: ${m.episodes}`);
        if (m.chapters)
          lines.push(`Chapters: ${m.chapters} (${m.volumes ?? "?"} volumes)`);
        // Seasonal anime (e.g. "FALL 2023"), otherwise just the year
        if (m.season && m.seasonYear)
          lines.push(`Season: ${m.season} ${m.seasonYear}`);
        else if (m.startDate?.year) lines.push(`Year: ${m.startDate.year}`);

        // Scoring and popularity
        lines.push(
          `Score: ${m.meanScore ? `${m.meanScore}/100` : "Not rated"} (${m.popularity?.toLocaleString() ?? 0} users)`,
        );

        if (m.studios?.nodes?.length) {
          lines.push(
            `Studio: ${m.studios.nodes.map((s) => s.name).join(", ")}`,
          );
        }

        // Convert enums like "LIGHT_NOVEL" to readable format
        if (m.source) lines.push(`Source: ${m.source.replace(/_/g, " ")}`);
        lines.push(`Genres: ${m.genres?.join(", ") || "None"}`);

        // Filter spoiler tags, show top 5 with relevance %
        const safeTags = m.tags
          ?.filter((t) => !t.isMediaSpoiler)
          .slice(0, 5)
          .map((t) => `${t.name} (${t.rank}%)`)
          .join(", ");
        if (safeTags) lines.push(`Tags: ${safeTags}`);

        lines.push("", "Synopsis:", truncateDescription(m.description));

        // Related works, capped at 5
        if (m.relations?.edges?.length) {
          lines.push("", "Related:");
          for (const edge of m.relations.edges.slice(0, 5)) {
            const relTitle =
              edge.node.title.english || edge.node.title.romaji || "?";
            const relType = edge.relationType.replace(/_/g, " ");
            lines.push(
              `  - ${relType}: ${relTitle} (${edge.node.format ?? edge.node.type})`,
            );
          }
        }

        // Community recommendations
        const recs = m.recommendations?.nodes?.filter(
          (n) => n.mediaRecommendation,
        );
        if (recs?.length) {
          lines.push("", "Recommended if you liked this:");
          for (const rec of recs) {
            const r = rec.mediaRecommendation;
            if (!r) continue;
            const recTitle = r.title.english || r.title.romaji || "?";
            lines.push(
              `  - ${recTitle} (${r.meanScore ?? "?"}/100) - ${r.genres.slice(0, 3).join(", ")}`,
            ); // top 3 genres only
          }
        }

        lines.push("", `AniList: ${m.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "looking up details");
      }
    },
  });

  // === Seasonal Browser ===

  server.addTool({
    name: "anilist_seasonal",
    description:
      "Browse anime airing in a given season. " +
      "Use when the user asks what's airing this season, what aired in a past season, " +
      "or wants to discover seasonal anime. Defaults to current season/year. " +
      "Returns ranked list with title, format, score, genres, and episode count.",
    parameters: SeasonalInputSchema,
    annotations: {
      title: "Browse Seasonal Anime",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const { season, year } = resolveSeasonYear(args.season, args.year);

        const data = await anilistClient.query<SearchMediaResponse>(
          SEASONAL_MEDIA_QUERY,
          {
            season,
            seasonYear: year,
            type: "ANIME",
            isAdult: args.isAdult ? undefined : false,
            sort: BROWSE_SORT_MAP[args.sort] ?? BROWSE_SORT_MAP.POPULARITY,
            page: args.page,
            perPage: args.limit,
          },
          { cache: "seasonal" },
        );

        const results = data.Page.media;

        if (!results.length) {
          return `No anime found for ${season} ${year}.`;
        }

        const offset = (args.page - 1) * args.limit;
        const pageInfo = data.Page.pageInfo;
        const header = [
          `${season} ${year} Anime (${pageInfo.total} total, showing ${results.length})`,
          `Sorted by: ${args.sort.toLowerCase()}`,
          "",
        ].join("\n");

        const formatted = results.map(
          (m, i) => `${offset + i + 1}. ${formatMediaSummary(m)}`,
        );

        const footer = paginationFooter(
          args.page,
          args.limit,
          pageInfo.total,
          pageInfo.hasNextPage,
        );
        return (
          header + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "")
        );
      } catch (error) {
        return throwToolError(error, "browsing seasonal anime");
      }
    },
  });

  // === Community Recommendations ===

  server.addTool({
    name: "anilist_recommendations",
    description:
      "Get community recommendations for a specific anime or manga. " +
      "Use when the user asks for shows similar to a specific title, " +
      'or says "I liked X, what else should I watch?" ' +
      "Returns titles ranked by recommendation count with format, score, and genres.",
    parameters: RecommendationsInputSchema,
    annotations: {
      title: "Get Recommendations",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {
          perPage: args.limit,
        };
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = args.title;

        const data = await anilistClient.query<RecommendationsResponse>(
          RECOMMENDATIONS_QUERY,
          variables,
          { cache: "media" },
        );

        const source = data.Media;
        const sourceTitle = getTitle(source.title);
        const nsfw = isNsfwEnabled();
        const recs = source.recommendations.nodes.filter(
          (n) =>
            n.mediaRecommendation &&
            n.rating > 0 &&
            (nsfw || !n.mediaRecommendation.isAdult),
        );

        if (!recs.length) {
          return `No community recommendations found for "${sourceTitle}".`;
        }

        const lines: string[] = [
          `# Recommendations based on ${sourceTitle}`,
          `${recs.length} community suggestion${recs.length !== 1 ? "s" : ""}:`,
          "",
        ];

        for (let i = 0; i < recs.length; i++) {
          const rec = recs[i];
          const m = rec.mediaRecommendation;
          if (!m) continue;

          lines.push(
            `${i + 1}. ${formatMediaSummary(m)}`,
            `  Recommended by ${rec.rating} user${rec.rating !== 1 ? "s" : ""}`,
            "",
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "fetching recommendations");
      }
    },
  });
}

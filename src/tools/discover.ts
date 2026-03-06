/** Discovery tools: trending and genre browsing without search terms. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  TRENDING_MEDIA_QUERY,
  GENRE_BROWSE_QUERY,
  GENRE_TAG_COLLECTION_QUERY,
} from "../api/queries.js";
import {
  TrendingInputSchema,
  GenreBrowseInputSchema,
  GenreListInputSchema,
} from "../schemas.js";
import type {
  TrendingMediaResponse,
  SearchMediaResponse,
  GenreTagCollectionResponse,
} from "../types.js";
import {
  formatMediaSummary,
  throwToolError,
  paginationFooter,
  BROWSE_SORT_MAP,
} from "../utils.js";

/** Register discovery tools on the MCP server */
export function registerDiscoverTools(server: FastMCP): void {
  // === Trending ===

  server.addTool({
    name: "anilist_trending",
    description:
      "Show what's trending on AniList right now. " +
      "Use when the user asks what's hot, trending, or generating buzz. " +
      "No search term needed. Returns ranked list with title, format, score, genres, and episode count.",
    parameters: TrendingInputSchema,
    annotations: {
      title: "Trending Now",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const data = await anilistClient.query<TrendingMediaResponse>(
          TRENDING_MEDIA_QUERY,
          {
            type: args.type,
            isAdult: args.isAdult ? undefined : false,
            page: args.page,
            perPage: args.limit,
          },
          { cache: "trending" },
        );

        const results = data.Page.media;

        if (!results.length) {
          return `No trending ${args.type.toLowerCase()} found.`;
        }

        const offset = (args.page - 1) * args.limit;
        const pageInfo = data.Page.pageInfo;
        const header = [
          `Trending ${args.type} right now (${pageInfo.total} total, showing ${results.length})`,
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
        return throwToolError(error, "fetching trending");
      }
    },
  });

  // === Genre Browse ===

  server.addTool({
    name: "anilist_genres",
    description:
      "Browse top anime or manga in a specific genre. " +
      "Use when the user asks for the best titles in a genre, " +
      'e.g. "best romance anime" or "top thriller manga from 2023". ' +
      "Supports year, status, and format filters. Returns ranked list with title, score, and genres.",
    parameters: GenreBrowseInputSchema,
    annotations: {
      title: "Browse by Genre",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {
          type: args.type,
          genre_in: [args.genre],
          sort: BROWSE_SORT_MAP[args.sort] ?? BROWSE_SORT_MAP.SCORE,
          isAdult: args.isAdult ? undefined : false,
          page: args.page,
          perPage: args.limit,
        };

        if (args.year) variables.year = args.year;
        if (args.status) variables.status = args.status;
        if (args.format) variables.format = args.format;

        const data = await anilistClient.query<SearchMediaResponse>(
          GENRE_BROWSE_QUERY,
          variables,
          { cache: "search" },
        );

        const results = data.Page.media;

        if (!results.length) {
          return `No ${args.type.toLowerCase()} found in genre "${args.genre}".`;
        }

        const filters: string[] = [];
        if (args.year) filters.push(`${args.year}`);
        if (args.status) filters.push(args.status.replace(/_/g, " "));
        if (args.format) filters.push(args.format);
        const filterStr = filters.length > 0 ? ` (${filters.join(", ")})` : "";

        const offset = (args.page - 1) * args.limit;
        const pageInfo = data.Page.pageInfo;
        const header = [
          `Top ${args.genre} ${args.type}${filterStr}`,
          `${pageInfo.total} total, showing ${results.length} by ${args.sort.toLowerCase()}`,
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
        return throwToolError(error, "browsing genres");
      }
    },
  });

  // === Genre/Tag List ===

  server.addTool({
    name: "anilist_genre_list",
    description:
      "List all valid AniList genres and content tags. " +
      "Use before genre-filtering tools to ensure valid genre names. " +
      "Returns genres and content tags grouped by category with descriptions.",
    parameters: GenreListInputSchema,
    annotations: {
      title: "List Genres & Tags",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const data = await anilistClient.query<GenreTagCollectionResponse>(
          GENRE_TAG_COLLECTION_QUERY,
          {},
          { cache: "media" },
        );

        const lines: string[] = [
          "# AniList Genres",
          "",
          data.GenreCollection.join(", "),
        ];

        // Group tags by category
        let tags = data.MediaTagCollection;
        if (!args.includeAdultTags) {
          tags = tags.filter((t) => !t.isAdult);
        }

        const categories = new Map<
          string,
          Array<{ name: string; description: string }>
        >();
        for (const tag of tags) {
          const cat = tag.category || "Other";
          const list = categories.get(cat);
          if (list) {
            list.push(tag);
          } else {
            categories.set(cat, [tag]);
          }
        }

        lines.push("", "# Content Tags");
        for (const [category, catTags] of categories) {
          lines.push("", `## ${category}`);
          for (const tag of catTags) {
            lines.push(`  ${tag.name} - ${tag.description}`);
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "fetching genre list");
      }
    },
  });
}

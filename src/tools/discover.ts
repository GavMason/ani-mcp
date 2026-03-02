/** Discovery tools: trending and genre browsing without search terms. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import { TRENDING_MEDIA_QUERY, GENRE_BROWSE_QUERY } from "../api/queries.js";
import { TrendingInputSchema, GenreBrowseInputSchema } from "../schemas.js";
import type { TrendingMediaResponse, SearchMediaResponse } from "../types.js";
import { formatMediaSummary, throwToolError, paginationFooter } from "../utils.js";

/** Register discovery tools on the MCP server */
export function registerDiscoverTools(server: FastMCP): void {
  // === Trending ===

  server.addTool({
    name: "anilist_trending",
    description:
      "Show what's trending on AniList right now. " +
      "Use when the user asks what's hot, trending, or generating buzz. " +
      "No search term needed - returns titles ranked by current trending score.",
    parameters: TrendingInputSchema,
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
          { cache: "search" },
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

        const footer = paginationFooter(args.page, args.limit, pageInfo.total, pageInfo.hasNextPage);
        return header + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "");
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
      "No search term needed - discovers by genre with optional year/status/format filters.",
    parameters: GenreBrowseInputSchema,
    execute: async (args) => {
      try {
        const sortMap: Record<string, string[]> = {
          SCORE: ["SCORE_DESC"],
          POPULARITY: ["POPULARITY_DESC"],
          TRENDING: ["TRENDING_DESC"],
        };

        const variables: Record<string, unknown> = {
          type: args.type,
          genre_in: [args.genre],
          sort: sortMap[args.sort] ?? sortMap.SCORE,
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

        const footer = paginationFooter(args.page, args.limit, pageInfo.total, pageInfo.hasNextPage);
        return header + formatted.join("\n\n") + (footer ? `\n\n${footer}` : "");
      } catch (error) {
        return throwToolError(error, "browsing genres");
      }
    },
  });
}

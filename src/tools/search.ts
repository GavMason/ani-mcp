/** Search and discovery tools: find anime/manga by query or get full details. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import { SEARCH_MEDIA_QUERY, MEDIA_DETAILS_QUERY } from "../api/queries.js";
import { SearchInputSchema, DetailsInputSchema } from "../schemas.js";
import type {
  SearchMediaResponse,
  MediaDetailsResponse,
  AniListMedia,
} from "../types.js";
import { getTitle, truncateDescription, formatToolError } from "../utils.js";

// === Shared Formatting ===

/** Format a media entry as a compact multi-line summary */
function formatMediaSummary(media: AniListMedia): string {
  const title = getTitle(media.title);
  const format = media.format ?? "Unknown format";
  // Prefer season year, fall back to start date
  const year = media.seasonYear ?? media.startDate?.year ?? "?";
  const score = media.meanScore ? `${media.meanScore}/100` : "No score";
  const genres = media.genres?.length
    ? media.genres.join(", ")
    : "No genres listed";
  const studios = media.studios?.nodes?.length
    ? media.studios.nodes.map((s) => s.name).join(", ")
    : null;

  // Anime has episodes, manga has chapters/volumes
  let length = "";
  if (media.episodes) length = `${media.episodes} episodes`;
  else if (media.chapters) length = `${media.chapters} chapters`;
  if (media.volumes) length += ` (${media.volumes} volumes)`;

  const lines = [
    `${title} (${format}, ${year}) - ${score}`,
    `  Genres: ${genres}`,
  ];

  if (length) lines.push(`  Length: ${length}`);
  if (studios) lines.push(`  Studio: ${studios}`);
  lines.push(`  URL: ${media.siteUrl}`);

  return lines.join("\n");
}

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
      "in a genre, or find what aired in a specific year. " +
      "Returns a ranked list with title, format, score, genres, and AniList URL.",
    parameters: SearchInputSchema,
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {
          search: args.query,
          type: args.type,
          page: 1, // single page only, no pagination
          perPage: args.limit,
          sort: SEARCH_SORT,
        };

        // Only include set filters
        if (args.genre) variables.genre = [args.genre];
        if (args.year) variables.year = args.year;
        if (args.format) variables.format = args.format;

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

        const header = [
          `Found ${pageInfo.total} ${args.type.toLowerCase()} matching "${args.query}"`,
          `Showing ${results.length} results:`,
          "",
        ].join("\n");

        const formatted = results.map(
          (m, i) => `${i + 1}. ${formatMediaSummary(m)}`,
        );

        return header + formatted.join("\n\n");
      } catch (error) {
        return formatToolError(error, "searching");
      }
    },
  });

  server.addTool({
    name: "anilist_details",
    description:
      "Get full details about a specific anime or manga. " +
      "Use when the user asks about a specific title and wants synopsis, score, " +
      "episodes, studios, related works, and recommendations. " +
      "Provide either an AniList ID (faster, exact) or a title (fuzzy match).",
    parameters: DetailsInputSchema,
    execute: async (args) => {
      try {
        // AniList uses "search" as the GraphQL variable name for title lookups
        const variables: Record<string, unknown> = {};
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = args.title;

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
              `  - ${recTitle} (${r.meanScore ?? "?"}/ 100) - ${r.genres.slice(0, 3).join(", ")}`,
            ); // top 3 genres only
          }
        }

        lines.push("", `AniList: ${m.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return formatToolError(error, "looking up details");
      }
    },
  });
}

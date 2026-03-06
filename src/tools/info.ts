/** Info tools: staff credits, airing schedule, character search, and auth check. */

import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { anilistClient } from "../api/client.js";
import {
  STAFF_QUERY,
  AIRING_SCHEDULE_QUERY,
  CHARACTER_SEARCH_QUERY,
  STAFF_SEARCH_QUERY,
  STUDIO_SEARCH_QUERY,
  VIEWER_QUERY,
} from "../api/queries.js";
import {
  StaffInputSchema,
  ScheduleInputSchema,
  CharacterSearchInputSchema,
  StaffSearchInputSchema,
  StudioSearchInputSchema,
} from "../schemas.js";
import type {
  StaffResponse,
  AiringScheduleResponse,
  CharacterSearchResponse,
  StaffSearchResponse,
  StudioSearchResponse,
  ViewerResponse,
} from "../types.js";
import { getTitle, throwToolError, paginationFooter } from "../utils.js";

// === Helpers ===

/** Format seconds until airing as a readable duration */
function formatTimeUntil(seconds: number): string {
  if (seconds <= 0) return "aired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// === Tool Registration ===

/** Register info tools on the MCP server */
export function registerInfoTools(server: FastMCP): void {
  // === Who Am I ===

  server.addTool({
    name: "anilist_whoami",
    description:
      "Check which AniList account is authenticated and verify the token works. " +
      "Use when the user wants to confirm their setup or debug auth issues.",
    parameters: z.object({}),
    annotations: {
      title: "Who Am I",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async () => {
      if (!process.env.ANILIST_TOKEN) {
        const lines = [
          "ANILIST_TOKEN is not set.",
          "Set it to enable authenticated features (write operations, score format detection).",
          "Get a token at: https://anilist.co/settings/developer",
        ];
        const envUser = process.env.ANILIST_USERNAME;
        if (envUser) {
          lines.push(
            "",
            `ANILIST_USERNAME is set to "${envUser}" (read-only mode).`,
          );
        }
        return lines.join("\n");
      }

      try {
        const data = await anilistClient.query<ViewerResponse>(
          VIEWER_QUERY,
          {},
          { cache: "stats" },
        );

        if (!data.Viewer) {
          return throwToolError(
            new Error("No viewer data returned"),
            "checking authentication",
          );
        }
        const v = data.Viewer;
        const lines = [
          `Authenticated as: ${v.name}`,
          `AniList ID: ${v.id}`,
          `Score format: ${v.mediaListOptions.scoreFormat}`,
          `Profile: ${v.siteUrl}`,
        ];

        // Check if Anilist username matches
        const envUser = process.env.ANILIST_USERNAME;
        if (envUser) {
          const match = envUser.toLowerCase() === v.name.toLowerCase();
          lines.push(
            "",
            match
              ? `ANILIST_USERNAME "${envUser}" matches authenticated user.`
              : `ANILIST_USERNAME "${envUser}" does not match authenticated user "${v.name}".`,
          );
        } else {
          lines.push(
            "",
            "ANILIST_USERNAME is not set. Tools will require a username argument.",
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "checking authentication");
      }
    },
  });

  // === Staff Credits ===

  server.addTool({
    name: "anilist_staff",
    description:
      "Get staff and voice actor credits for an anime or manga. " +
      "Use when the user asks who directed, wrote, or voiced characters in a title. " +
      "Returns production staff with roles and characters with Japanese voice actors.",
    parameters: StaffInputSchema,
    annotations: {
      title: "Get Staff Credits",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = {};
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = args.title;

        const data = await anilistClient.query<StaffResponse>(
          STAFF_QUERY,
          variables,
          { cache: "media" },
        );

        const m = data.Media;

        const lines: string[] = [
          `# Staff: ${getTitle(m.title)}`,
          `Format: ${m.format ?? "Unknown"}`,
          "",
        ];

        // Staff roles (director, writer, etc.)
        if (m.staff.edges.length > 0) {
          lines.push("## Production Staff");
          for (const edge of m.staff.edges) {
            const name = edge.node.name.full;
            const native = edge.node.name.native
              ? ` (${edge.node.name.native})`
              : "";
            lines.push(`  ${edge.role}: ${name}${native}`);
          }
          lines.push("");
        }

        // Characters with voice actors
        if (m.characters.edges.length > 0) {
          lines.push("## Characters & Voice Actors");
          for (const edge of m.characters.edges) {
            const charName = edge.node.name.full;
            const role = edge.role;
            const va = edge.voiceActors[0];
            const vaStr = va ? ` - VA: ${va.name.full}` : "";
            lines.push(`  ${charName} (${role})${vaStr}`);
          }
          lines.push("");
        }

        lines.push(`AniList: ${m.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "fetching staff");
      }
    },
  });

  // === Airing Schedule ===

  server.addTool({
    name: "anilist_schedule",
    description:
      "Get the airing schedule for an anime. " +
      "Use when the user asks when the next episode airs, " +
      "or wants to see upcoming episode dates for a currently airing show. " +
      "Returns next episode date/countdown and upcoming episode schedule.",
    parameters: ScheduleInputSchema,
    annotations: {
      title: "Airing Schedule",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const variables: Record<string, unknown> = { notYetAired: true };
        if (args.id) variables.id = args.id;
        if (args.title) variables.search = args.title;

        const data = await anilistClient.query<AiringScheduleResponse>(
          AIRING_SCHEDULE_QUERY,
          variables,
          { cache: "schedule" },
        );

        const m = data.Media;

        const lines: string[] = [
          `# Schedule: ${getTitle(m.title)}`,
          `Status: ${m.status?.replace(/_/g, " ") ?? "Unknown"}`,
        ];

        if (m.episodes) lines.push(`Episodes: ${m.episodes}`);

        // Next episode
        if (m.nextAiringEpisode) {
          const next = m.nextAiringEpisode;
          const date = new Date(next.airingAt * 1000);
          lines.push("");
          lines.push(`Next Episode: ${next.episode}`);
          lines.push(
            `Airs: ${date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} ` +
              `at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
          );
          lines.push(`In: ${formatTimeUntil(next.timeUntilAiring)}`);
        } else {
          lines.push("", "No upcoming episodes scheduled.");
        }

        // Upcoming episodes
        const upcoming = m.airingSchedule.nodes.filter(
          (n) => n.timeUntilAiring > 0,
        );
        if (upcoming.length > 1) {
          lines.push("", "Upcoming:");
          for (const ep of upcoming.slice(0, 8)) {
            const date = new Date(ep.airingAt * 1000);
            const dateStr = date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            lines.push(
              `  Ep ${ep.episode}: ${dateStr} (${formatTimeUntil(ep.timeUntilAiring)})`,
            );
          }
        }

        lines.push("", `AniList: ${m.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "fetching schedule");
      }
    },
  });

  // === Character Search ===

  server.addTool({
    name: "anilist_characters",
    description:
      "Search for anime/manga characters by name. " +
      "Use when the user asks about a specific character, wants to know " +
      "which series a character appears in, or who voices them. " +
      "Returns character appearances with roles and voice actors.",
    parameters: CharacterSearchInputSchema,
    annotations: {
      title: "Search Characters",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const data = await anilistClient.query<CharacterSearchResponse>(
          CHARACTER_SEARCH_QUERY,
          { search: args.query, page: args.page, perPage: args.limit },
          { cache: "search" },
        );

        const results = data.Page.characters;

        if (!results.length) {
          return `No characters found matching "${args.query}".`;
        }

        const offset = (args.page - 1) * args.limit;
        const pageInfo = data.Page.pageInfo;
        const lines: string[] = [
          `Found ${pageInfo.total} character(s) matching "${args.query}"`,
          "",
        ];

        for (let i = 0; i < results.length; i++) {
          const char = results[i];
          const native = char.name.native ? ` (${char.name.native})` : "";
          const favs =
            char.favourites > 0
              ? ` - ${char.favourites.toLocaleString()} favorites`
              : "";

          lines.push(`${offset + i + 1}. ${char.name.full}${native}${favs}`);

          // Appearances
          for (const edge of char.media.edges.slice(0, 3)) {
            const mediaTitle =
              edge.node.title.english || edge.node.title.romaji || "?";
            const va = edge.voiceActors[0];
            const vaStr = va ? ` (VA: ${va.name.full})` : "";
            lines.push(
              `   ${edge.characterRole}: ${mediaTitle} (${edge.node.format ?? edge.node.type})${vaStr}`,
            );
          }

          lines.push(`   URL: ${char.siteUrl}`);
          lines.push("");
        }

        const footer = paginationFooter(
          args.page,
          args.limit,
          pageInfo.total,
          pageInfo.hasNextPage,
        );
        return lines.join("\n") + (footer ? `\n${footer}` : "");
      } catch (error) {
        return throwToolError(error, "searching characters");
      }
    },
  });

  // === Staff Search ===

  server.addTool({
    name: "anilist_staff_search",
    description:
      "Search for anime/manga staff by name and see their works. " +
      "Use when the user asks about a director, voice actor, animator, or writer. " +
      "Returns staff occupations, works with roles, and scores.",
    parameters: StaffSearchInputSchema,
    annotations: {
      title: "Search Staff",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const data = await anilistClient.query<StaffSearchResponse>(
          STAFF_SEARCH_QUERY,
          {
            search: args.query,
            page: args.page,
            perPage: args.limit,
            mediaPerPage: args.mediaLimit,
          },
          { cache: "search" },
        );

        const results = data.Page.staff;

        if (!results.length) {
          return `No staff found matching "${args.query}".`;
        }

        const lines: string[] = [
          `Found ${data.Page.pageInfo.total} staff matching "${args.query}"`,
          "",
        ];

        for (const person of results) {
          const native = person.name.native ? ` (${person.name.native})` : "";
          const occupations = person.primaryOccupations.length
            ? ` - ${person.primaryOccupations.join(", ")}`
            : "";
          lines.push(`## ${person.name.full}${native}${occupations}`);

          // Dedupe media by ID and group roles
          const mediaMap = new Map<
            number,
            {
              title: string;
              format: string | null;
              score: number | null;
              url: string;
              roles: string[];
            }
          >();
          for (const edge of person.staffMedia.edges) {
            const existing = mediaMap.get(edge.node.id);
            if (existing) {
              existing.roles.push(edge.staffRole);
            } else {
              mediaMap.set(edge.node.id, {
                title: edge.node.title.english || edge.node.title.romaji,
                format: edge.node.format,
                score: edge.node.meanScore,
                url: edge.node.siteUrl,
                roles: [edge.staffRole],
              });
            }
          }

          if (mediaMap.size === 0) {
            lines.push("  No works found.");
          } else {
            let i = 1;
            for (const work of mediaMap.values()) {
              const format = work.format ? ` (${work.format})` : "";
              const score = work.score ? ` - ${work.score}%` : "";
              lines.push(`  ${i}. ${work.title}${format}${score}`);
              lines.push(`     Role: ${work.roles.join(", ")}`);
              i++;
            }
          }

          lines.push(`  URL: ${person.siteUrl}`, "");
        }

        const footer = paginationFooter(
          args.page,
          args.limit,
          data.Page.pageInfo.total,
          data.Page.pageInfo.hasNextPage,
        );
        return lines.join("\n") + (footer ? `\n${footer}` : "");
      } catch (error) {
        return throwToolError(error, "searching staff");
      }
    },
  });

  // === Studio Search ===

  server.addTool({
    name: "anilist_studio_search",
    description:
      "Search for an animation studio by name and see their productions. " +
      "Use when the user asks about a studio like MAPPA, Kyoto Animation, or Bones. " +
      "Returns main and supporting productions with format, score, and status.",
    parameters: StudioSearchInputSchema,
    annotations: {
      title: "Search Studios",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const data = await anilistClient.query<StudioSearchResponse>(
          STUDIO_SEARCH_QUERY,
          { search: args.query, perPage: args.limit },
          { cache: "search" },
        );

        const studio = data.Studio;
        const tag = studio.isAnimationStudio ? "Animation Studio" : "Studio";

        const lines: string[] = [`# ${studio.name} (${tag})`, ""];

        // Main productions first, then supporting
        const main = studio.media.edges.filter((e) => e.isMainStudio);
        const supporting = studio.media.edges.filter((e) => !e.isMainStudio);

        if (main.length > 0) {
          lines.push("## Main Productions");
          for (let i = 0; i < main.length; i++) {
            const m = main[i].node;
            const title = m.title.english || m.title.romaji;
            const format = m.format ? ` (${m.format})` : "";
            const score = m.meanScore ? ` - ${m.meanScore}%` : "";
            const status = m.status ? ` [${m.status.replace(/_/g, " ")}]` : "";
            lines.push(`  ${i + 1}. ${title}${format}${score}${status}`);
          }
          lines.push("");
        }

        if (supporting.length > 0) {
          lines.push("## Supporting");
          for (let i = 0; i < supporting.length; i++) {
            const m = supporting[i].node;
            const title = m.title.english || m.title.romaji;
            const format = m.format ? ` (${m.format})` : "";
            const score = m.meanScore ? ` - ${m.meanScore}%` : "";
            lines.push(`  ${i + 1}. ${title}${format}${score}`);
          }
          lines.push("");
        }

        if (main.length === 0 && supporting.length === 0) {
          lines.push("No productions found.", "");
        }

        lines.push(`AniList: ${studio.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "searching studios");
      }
    },
  });
}

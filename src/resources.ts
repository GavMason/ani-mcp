/** MCP Resources: expose user context without tool calls */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastMCP } from "fastmcp";
import { anilistClient } from "./api/client.js";
import { USER_PROFILE_QUERY } from "./api/queries.js";
import {
  buildTasteProfile,
  describeTasteProfile,
  formatTasteProfileText,
  type TasteProfile,
} from "./engine/taste.js";
import { formatProfile } from "./tools/social.js";
import { formatListEntry } from "./tools/lists.js";
import type { UserProfileResponse } from "./types.js";
import { getDefaultUsername, getScoreFormat } from "./utils.js";

// Read version from package.json at startup
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const PKG_VERSION: string = JSON.parse(readFileSync(pkgPath, "utf-8")).version;

/** Register MCP resources on the server */
export function registerResources(server: FastMCP): void {
  // === User Profile ===

  server.addResource({
    uri: "anilist://profile",
    name: "User Profile",
    description: "AniList profile with bio, anime/manga stats, and favourites.",
    mimeType: "text/plain",
    async load() {
      try {
        const username = getDefaultUsername();
        const data = await anilistClient.query<UserProfileResponse>(
          USER_PROFILE_QUERY,
          { name: username },
          { cache: "stats" },
        );
        return { text: formatProfile(data.User) };
      } catch (err) {
        return {
          text: `Error loading profile: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // === Taste Profile ===

  server.addResourceTemplate({
    uriTemplate: "anilist://taste/{type}",
    name: "Taste Profile",
    description:
      "Genre weights, top themes, scoring patterns, and format split derived from completed list.",
    mimeType: "text/plain",
    arguments: [
      {
        name: "type",
        description: "ANIME or MANGA",
        required: true,
      },
    ],
    async load({ type }) {
      try {
        const username = getDefaultUsername();
        const mediaType = String(type).toUpperCase();
        const entries = await anilistClient.fetchList(
          username,
          mediaType,
          "COMPLETED",
        );
        const profile = buildTasteProfile(entries);
        return { text: formatTasteProfile(profile, username) };
      } catch (err) {
        return {
          text: `Error loading taste profile: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // === Current List ===

  server.addResourceTemplate({
    uriTemplate: "anilist://list/{type}",
    name: "Current List",
    description:
      "Currently watching anime or reading manga entries with progress and scores.",
    mimeType: "text/plain",
    arguments: [
      {
        name: "type",
        description: "ANIME or MANGA",
        required: true,
      },
    ],
    async load({ type }) {
      try {
        const username = getDefaultUsername();
        const mediaType = String(type).toUpperCase();

        const [entries, scoreFormat] = await Promise.all([
          anilistClient.fetchList(username, mediaType, "CURRENT"),
          getScoreFormat(username),
        ]);

        if (!entries.length) {
          return {
            text: `${username} has no current ${mediaType.toLowerCase()} entries.`,
          };
        }

        const header = `${username}'s current ${mediaType.toLowerCase()} - ${entries.length} entries`;
        const formatted = entries.map((entry, i) =>
          formatListEntry(entry, i + 1, scoreFormat),
        );

        return { text: [header, "", ...formatted].join("\n\n") };
      } catch (err) {
        return {
          text: `Error loading list: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });

  // === Health Check ===

  server.addResource({
    uri: "anilist://status",
    name: "Server Status",
    description:
      "Health check showing API connectivity, auth status, cache state, and server version.",
    mimeType: "text/plain",
    async load() {
      const lines: string[] = ["# ani-mcp Status", ""];

      // Server version
      lines.push(`Version: ${PKG_VERSION}`);

      // Auth status
      const hasToken = Boolean(process.env.ANILIST_TOKEN);
      const hasUsername = Boolean(process.env.ANILIST_USERNAME);
      lines.push(
        `Auth: ${hasToken ? "token configured" : "no token (read-only mode)"}`,
      );
      lines.push(
        `Username: ${hasUsername ? process.env.ANILIST_USERNAME : "not configured"}`,
      );

      // API connectivity
      try {
        const start = Date.now();
        await anilistClient.query(
          "query Ping { Viewer { id } }",
          {},
          { cache: null },
        );
        const latency = Date.now() - start;
        lines.push(`API: connected (${latency}ms)`);
      } catch {
        lines.push("API: unreachable");
      }

      // Cache stats
      const cacheStats = anilistClient.cacheStats();
      lines.push(`Cache: ${cacheStats.size}/${cacheStats.maxSize} entries`);

      return { text: lines.join("\n") };
    },
  });
}

// === Formatting Helpers ===

/** Format a taste profile with detailed breakdowns */
function formatTasteProfile(profile: TasteProfile, username: string): string {
  const lines: string[] = [
    `# Taste Profile: ${username}`,
    "",
    describeTasteProfile(profile, username),
    ...formatTasteProfileText(profile),
  ];

  return lines.join("\n");
}

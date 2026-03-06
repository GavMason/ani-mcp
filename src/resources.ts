/** MCP Resources: expose user context without tool calls */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "./api/client.js";
import { USER_PROFILE_QUERY } from "./api/queries.js";
import {
  buildTasteProfile,
  describeTasteProfile,
  type TasteProfile,
} from "./engine/taste.js";
import { formatProfile } from "./tools/social.js";
import { formatListEntry } from "./tools/lists.js";
import type { UserProfileResponse } from "./types.js";
import { getDefaultUsername, getScoreFormat } from "./utils.js";

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
}

// === Formatting Helpers ===

/** Format a taste profile with detailed breakdowns */
function formatTasteProfile(profile: TasteProfile, username: string): string {
  const lines: string[] = [
    `# Taste Profile: ${username}`,
    "",
    describeTasteProfile(profile, username),
  ];

  // Detailed genre breakdown
  if (profile.genres.length > 0) {
    lines.push("", "Genre Weights (higher = stronger preference):");
    for (const g of profile.genres.slice(0, 10)) {
      lines.push(`  ${g.name}: ${g.weight.toFixed(2)} (${g.count} titles)`);
    }
  }

  // Detailed tag breakdown
  if (profile.tags.length > 0) {
    lines.push("", "Top Themes:");
    for (const t of profile.tags.slice(0, 10)) {
      lines.push(`  ${t.name}: ${t.weight.toFixed(2)} (${t.count} titles)`);
    }
  }

  // Score distribution
  if (profile.scoring.totalScored > 0) {
    lines.push("", "Score Distribution:");
    for (let s = 10; s >= 1; s--) {
      const count = profile.scoring.distribution[s] ?? 0;
      if (count > 0) {
        const bar = "#".repeat(Math.min(count, 30));
        lines.push(`  ${s}/10: ${bar} (${count})`);
      }
    }
  }

  return lines.join("\n");
}

/** MCP Prompts: pre-built conversation starters */

import type { FastMCP } from "fastmcp";
import { resolveSeasonYear } from "./utils.js";

/** Register MCP prompts on the server */
export function registerPrompts(server: FastMCP): void {
  // === Seasonal Review ===

  server.addPrompt({
    name: "seasonal_review",
    description: "Review this season's anime lineup against my taste profile.",
    arguments: [
      {
        name: "season",
        description:
          "Season to review: WINTER, SPRING, SUMMER, or FALL. Defaults to current.",
        required: false,
      },
      {
        name: "year",
        description: "Year to review. Defaults to current year.",
        required: false,
      },
    ],
    async load({ season, year }) {
      const resolved = resolveSeasonYear(
        season as string | undefined,
        year ? Number(year) : undefined,
      );
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Use anilist_pick with source SEASONAL to review the ${resolved.season} ${resolved.year} anime season against my taste profile. ` +
                `Show the top picks and explain why each one matches my preferences.`,
            },
          },
        ],
      };
    },
  });

  // === What To Watch ===

  server.addPrompt({
    name: "what_to_watch",
    description: "Plan what to watch right now from my current list.",
    arguments: [
      {
        name: "mood",
        description:
          "Mood filter: dark, chill, hype, action, romantic, funny, brainy, sad, etc.",
        required: false,
      },
      {
        name: "minutes",
        description: "Time budget in minutes. Defaults to 90.",
        required: false,
      },
    ],
    async load({ mood, minutes }) {
      const budget = minutes ? Number(minutes) : 90;
      const moodClause = mood ? ` in a ${mood} mood` : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `I have ${budget} minutes${moodClause}. ` +
                `Use anilist_session to plan what I should watch from my current list.`,
            },
          },
        ],
      };
    },
  });

  // === Roast My Taste ===

  server.addPrompt({
    name: "roast_my_taste",
    description: "Get a humorous roast of your anime taste.",
    arguments: [
      {
        name: "username",
        description: "Username to roast. Defaults to configured user.",
        required: false,
      },
    ],
    async load({ username }) {
      const target = username ?? "my";
      const userClause = username
        ? `Use anilist_taste for ${username}`
        : "Use anilist_taste for me";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `${userClause} and then roast ${target} anime taste. ` +
                `Be funny and specific about genre preferences and scoring patterns.`,
            },
          },
        ],
      };
    },
  });

  // === Compare Us ===

  server.addPrompt({
    name: "compare_us",
    description: "Compare my taste with another user.",
    arguments: [
      {
        name: "other_username",
        description: "The other user to compare with.",
        required: true,
      },
    ],
    async load({ other_username }) {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Use anilist_compare to compare my taste with ${other_username}. ` +
                `Highlight the biggest taste differences and shared favourites.`,
            },
          },
        ],
      };
    },
  });

  // === Year In Review ===

  server.addPrompt({
    name: "year_in_review",
    description: "Get your anime/manga year in review wrapped summary.",
    arguments: [
      {
        name: "year",
        description: "Year to review. Defaults to current year.",
        required: false,
      },
    ],
    async load({ year }) {
      const y = year ?? new Date().getFullYear().toString();
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Use anilist_wrapped to generate my ${y} anime and manga year in review. ` +
                `Summarize the highlights and interesting patterns.`,
            },
          },
        ],
      };
    },
  });

  // === Explain Title ===

  server.addPrompt({
    name: "explain_title",
    description: "Explain why you would or wouldn't like a specific title.",
    arguments: [
      {
        name: "title",
        description: "The anime or manga title to explain.",
        required: true,
      },
    ],
    async load({ title }) {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Use anilist_explain to analyze why I would or wouldn't like "${title}". ` +
                `Break down genre affinity, theme alignment, and how it compares to titles I've enjoyed.`,
            },
          },
        ],
      };
    },
  });

  // === Setup Wizard ===

  server.addPrompt({
    name: "setup",
    description:
      "Walk through connecting your AniList account to ani-mcp step by step.",
    arguments: [],
    async load() {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                "Help me set up ani-mcp. " +
                "First, use anilist_whoami to check if I'm already connected. " +
                "If not authenticated, walk me through these steps:\n" +
                "1. Find my AniList username at https://anilist.co/settings\n" +
                "2. Add ANILIST_USERNAME to my MCP server config\n" +
                "3. (Optional) Create an API token at https://anilist.co/settings/developer for write features\n" +
                "4. Add ANILIST_TOKEN to my config if I want to update my list\n" +
                "5. Restart the MCP client to apply changes\n" +
                "After setup, verify with anilist_whoami and show a quick demo with anilist_taste.",
            },
          },
        ],
      };
    },
  });

  // === OAuth Token Guide ===

  server.addPrompt({
    name: "get_token",
    description:
      "Step-by-step guide to create an AniList API token for write features (rate, update progress, etc.).",
    arguments: [],
    async load() {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                "Walk me through getting an AniList OAuth token for ani-mcp write features. " +
                "Here are the exact steps:\n" +
                "1. Go to https://anilist.co/settings/developer\n" +
                "2. Click 'Create New Client'\n" +
                "3. Set the app name to anything (e.g. 'ani-mcp')\n" +
                "4. Set the redirect URL to https://anilist.co/api/v2/oauth/pin\n" +
                "5. Save and copy your Client ID\n" +
                "6. Open this URL in a browser (replace CLIENT_ID with your actual ID):\n" +
                "   https://anilist.co/api/v2/oauth/authorize?client_id=CLIENT_ID&response_type=token\n" +
                "7. Click 'Authorize' on the AniList page\n" +
                "8. Copy the token from the page\n" +
                "9. Add ANILIST_TOKEN to your MCP server config with that token value\n" +
                "10. Restart your MCP client\n\n" +
                "After they complete the steps, verify with anilist_whoami to confirm the token works.",
            },
          },
        ],
      };
    },
  });

  // === Find Similar ===

  server.addPrompt({
    name: "find_similar",
    description: "Find titles similar to one you enjoyed.",
    arguments: [
      {
        name: "title",
        description: "The anime or manga to find similar titles for.",
        required: true,
      },
    ],
    async load({ title }) {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `Use anilist_similar to find titles similar to "${title}". ` +
                `Explain what makes each recommendation similar and whether it's on my list already.`,
            },
          },
        ],
      };
    },
  });
}

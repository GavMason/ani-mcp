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

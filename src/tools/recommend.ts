/** Recommendation tools: taste profiling, personalized picks, and user comparison. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import { DISCOVER_MEDIA_QUERY } from "../api/queries.js";
import {
  TasteInputSchema,
  PickInputSchema,
  CompareInputSchema,
  WrappedInputSchema,
} from "../schemas.js";
import type {
  SearchMediaResponse,
  AniListMediaListEntry,
  AniListMedia,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  throwToolError,
} from "../utils.js";
import {
  buildTasteProfile,
  describeTasteProfile,
  type TasteProfile,
} from "../engine/taste.js";
import { matchCandidates } from "../engine/matcher.js";
import { parseMood, hasMoodMatch } from "../engine/mood.js";
import {
  computeCompatibility,
  computeGenreDivergences,
  findCrossRecs,
} from "../engine/compare.js";

// User scores are normalized to 1-10 via score(format: POINT_10) in the list query.
// Community meanScore is 0-100. Multiply user score by 10 to compare on the same scale.
const USER_SCORE_SCALE = 10;

// === Helpers ===

/** Fetch top-rated titles in the user's preferred genres, excluding already-seen */
async function discoverByTaste(
  profile: TasteProfile,
  type: string,
  completedIds: Set<number>,
): Promise<AniListMedia[]> {
  // Top 3 genres from taste profile
  const topGenres = profile.genres.slice(0, 3).map((g) => g.name);
  if (topGenres.length === 0) return [];

  const data = await anilistClient.query<SearchMediaResponse>(
    DISCOVER_MEDIA_QUERY,
    {
      type,
      genre_in: topGenres,
      perPage: 30,
      sort: ["SCORE_DESC"],
    },
    { cache: "search" },
  );

  return data.Page.media.filter((m) => !completedIds.has(m.id));
}

/** Build a taste profile for a username, optionally merging anime and manga */
async function profileForUser(
  username: string,
  type: "ANIME" | "MANGA" | "BOTH",
): Promise<{ profile: TasteProfile; entries: AniListMediaListEntry[] }> {
  if (type === "BOTH") {
    const [anime, manga] = await Promise.all([
      anilistClient.fetchList(username, "ANIME", "COMPLETED"),
      anilistClient.fetchList(username, "MANGA", "COMPLETED"),
    ]);
    const all = [...anime, ...manga];
    return { profile: buildTasteProfile(all), entries: all };
  }

  const entries = await anilistClient.fetchList(username, type, "COMPLETED");
  return { profile: buildTasteProfile(entries), entries };
}

// === Tool Registration ===

/** Register smart tools on the MCP server */
export function registerRecommendTools(server: FastMCP): void {
  // === Taste Profile ===

  server.addTool({
    name: "anilist_taste",
    description:
      "Generate a taste profile summary from a user's completed list. " +
      "Use when the user asks about their anime/manga preferences, " +
      "what genres they like, or how they tend to score. " +
      "Analyzes genre preferences, theme weights, scoring patterns, and format split.",
    parameters: TasteInputSchema,
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const { profile } = await profileForUser(username, args.type);

        const lines: string[] = [
          `# Taste Profile: ${username}`,
          "",
          describeTasteProfile(profile, username),
        ];

        // Detailed genre breakdown
        if (profile.genres.length > 0) {
          lines.push("", "Genre Weights (higher = stronger preference):");
          for (const g of profile.genres.slice(0, 10)) {
            lines.push(
              `  ${g.name}: ${g.weight.toFixed(2)} (${g.count} titles)`,
            );
          }
        }

        // Detailed tag breakdown
        if (profile.tags.length > 0) {
          lines.push("", "Top Themes:");
          for (const t of profile.tags.slice(0, 10)) {
            lines.push(
              `  ${t.name}: ${t.weight.toFixed(2)} (${t.count} titles)`,
            );
          }
        }

        // Score distribution bar chart
        if (profile.scoring.totalScored > 0) {
          lines.push("", "Score Distribution:");
          for (let s = 10; s >= 1; s--) {
            const count = profile.scoring.distribution[s] ?? 0;
            if (count > 0) {
              // Cap at 30 chars
              const bar = "#".repeat(Math.min(count, 30));
              lines.push(`  ${s}/10: ${bar} (${count})`);
            }
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "building taste profile");
      }
    },
  });

  // === Personalized Picks ===

  server.addTool({
    name: "anilist_pick",
    description:
      '"What should I watch/read next?" Recommends from your Planning list ' +
      "based on your taste profile. Falls back to top-rated AniList titles " +
      "if the Planning list is empty. Optionally filter by mood or max episodes.",
    parameters: PickInputSchema,
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Two API calls: completed list for taste, planning list for candidates
        const [completed, planning] = await Promise.all([
          anilistClient.fetchList(username, args.type, "COMPLETED"),
          anilistClient.fetchList(username, args.type, "PLANNING"),
        ]);

        const profile = buildTasteProfile(completed);

        if (profile.genres.length === 0) {
          return (
            `${username} hasn't scored enough completed titles to build a taste profile. ` +
            `Score more titles on AniList for personalized recommendations.`
          );
        }

        // Fall back to top-rated AniList titles when Planning list is empty
        const fromDiscovery = planning.length === 0;
        let candidates: AniListMedia[];

        if (fromDiscovery) {
          const completedIds = new Set(completed.map((e) => e.media.id));
          candidates = await discoverByTaste(profile, args.type, completedIds);
        } else {
          candidates = planning.map((e) => e.media);
        }

        // Optionally filter by episode count
        const maxEps = args.maxEpisodes;
        if (maxEps) {
          candidates = candidates.filter(
            (m) => !m.episodes || m.episodes <= maxEps,
          );
        }

        if (candidates.length === 0) {
          return fromDiscovery
            ? `Could not find titles matching ${username}'s taste. Try a different mood or type.`
            : `No titles on ${username}'s Planning list match the criteria.`;
        }

        // Parse mood if provided
        const mood = args.mood ? parseMood(args.mood) : undefined;
        const results = matchCandidates(candidates, profile, mood);
        const picks = results.slice(0, args.limit);

        if (picks.length === 0) {
          return `Could not find good matches on ${username}'s Planning list.`;
        }

        const lines: string[] = [
          `# Top Picks for ${username}`,
          `Based on ${completed.length} completed titles` +
            (results.length > picks.length
              ? ` (showing ${picks.length} of ${results.length} matches)`
              : ""),
        ];

        if (fromDiscovery) {
          lines.push(
            "No Planning list found - showing top-rated titles matching your taste",
          );
        }

        // Flag unrecognized mood keywords
        if (args.mood) {
          const matched = hasMoodMatch(args.mood);
          lines.push(
            matched
              ? `Mood: "${args.mood}"`
              : `Mood: "${args.mood}" (no exact keyword match - showing general taste picks)`,
          );
        }

        lines.push("");

        // Format picks with reasons
        for (let i = 0; i < picks.length; i++) {
          const pick = picks[i];
          const m = pick.media;
          const title = getTitle(m.title);
          const score = m.meanScore ? `${m.meanScore}/100` : "Unrated";
          const eps = m.episodes ? `${m.episodes} episodes` : "";
          const format = m.format ?? "";

          lines.push(`${i + 1}. ${title}`);
          lines.push(`   ${[format, eps, score].filter(Boolean).join(" - ")}`);
          lines.push(`   Genres: ${m.genres.join(", ")}`);

          // Explain why this was recommended
          if (pick.reasons.length > 0) {
            for (const reason of pick.reasons) {
              lines.push(`   - ${reason}`);
            }
          }
          if (pick.moodFit) {
            lines.push(`   - ${pick.moodFit}`);
          }

          lines.push(`   URL: ${m.siteUrl}`);
          lines.push("");
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "picking recommendations");
      }
    },
  });

  // === User Comparison ===

  server.addTool({
    name: "anilist_compare",
    description:
      "Compare taste profiles between two AniList users. " +
      "Shows compatibility score, shared favorites, biggest disagreements, " +
      "and genre divergences. Use when someone asks to compare their taste " +
      "with another user.",
    parameters: CompareInputSchema,
    execute: async (args) => {
      try {
        // Fetch both users' completed lists in parallel
        const [entries1, entries2] = await Promise.all([
          anilistClient.fetchList(args.user1, args.type, "COMPLETED"),
          anilistClient.fetchList(args.user2, args.type, "COMPLETED"),
        ]);

        if (entries1.length === 0) {
          return `${args.user1} has no completed ${args.type.toLowerCase()}.`;
        }
        if (entries2.length === 0) {
          return `${args.user2} has no completed ${args.type.toLowerCase()}.`;
        }

        const profile1 = buildTasteProfile(entries1);
        const profile2 = buildTasteProfile(entries2);

        // Find shared titles (both users completed the same media ID)
        const scores1 = new Map(entries1.map((e) => [e.media.id, e]));
        const shared: Array<{
          title: string;
          score1: number;
          score2: number;
          id: number;
        }> = [];
        for (const e2 of entries2) {
          const e1 = scores1.get(e2.media.id);
          if (e1) {
            shared.push({
              title: getTitle(e1.media.title),
              score1: e1.score,
              score2: e2.score,
              id: e1.media.id,
            });
          }
        }

        const lines: string[] = [
          `# Taste Comparison: ${args.user1} vs ${args.user2}`,
          `${args.type} - ${entries1.length} vs ${entries2.length} completed`,
          "",
        ];

        // Compatibility score based on shared titles' score correlation
        if (shared.length >= 3) {
          const compatibility = computeCompatibility(shared);
          lines.push(`Compatibility: ${compatibility}%`);
          lines.push(`Shared titles: ${shared.length}`);
        } else {
          lines.push(
            `Only ${shared.length} shared title(s) - not enough for a compatibility score.`,
          );
        }
        lines.push("");

        // Shared favorites (both scored highly)
        const sharedFavorites = shared
          .filter((s) => s.score1 >= 8 && s.score2 >= 8)
          .sort((a, b) => b.score1 + b.score2 - (a.score1 + a.score2))
          .slice(0, 5);

        if (sharedFavorites.length > 0) {
          lines.push("Shared Favorites:");
          for (const s of sharedFavorites) {
            lines.push(
              `  ${s.title} - ${args.user1}: ${s.score1}/10, ${args.user2}: ${s.score2}/10`,
            );
          }
          lines.push("");
        }

        // Titles with 3+ point score difference
        const disagreements = shared
          .filter((s) => s.score1 > 0 && s.score2 > 0)
          .sort(
            (a, b) =>
              Math.abs(b.score1 - b.score2) - Math.abs(a.score1 - a.score2),
          )
          .slice(0, 5);

        if (
          disagreements.length > 0 &&
          Math.abs(disagreements[0].score1 - disagreements[0].score2) >= 3
        ) {
          lines.push("Biggest Disagreements:");
          for (const d of disagreements) {
            const diff = Math.abs(d.score1 - d.score2);
            if (diff < 3) break;
            lines.push(
              `  ${d.title} - ${args.user1}: ${d.score1}/10, ${args.user2}: ${d.score2}/10 (${diff} apart)`,
            );
          }
          lines.push("");
        }

        // Genre divergences
        const divergences = computeGenreDivergences(profile1, profile2, args.user1, args.user2);
        if (divergences.length > 0) {
          lines.push("Genre Differences:");
          for (const d of divergences) {
            lines.push(`  ${d}`);
          }
          lines.push("");
        }

        // Cross-recommendations: titles one user loved that the other hasn't seen
        const recs1 = findCrossRecs(entries1, entries2, args.user1);
        const recs2 = findCrossRecs(entries2, entries1, args.user2);

        if (recs1.length > 0) {
          lines.push(`${args.user2} might enjoy (from ${args.user1}'s list):`);
          for (const r of recs1.slice(0, 3)) {
            lines.push(`  ${r}`);
          }
          lines.push("");
        }

        if (recs2.length > 0) {
          lines.push(`${args.user1} might enjoy (from ${args.user2}'s list):`);
          for (const r of recs2.slice(0, 3)) {
            lines.push(`  ${r}`);
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "comparing users");
      }
    },
  });

  // === Year in Review ===

  server.addTool({
    name: "anilist_wrapped",
    description:
      "Year-in-review summary for a user. " +
      "Use when the user asks about their anime/manga year, what they watched/read " +
      "in a given year, or wants a recap. Defaults to the current year.",
    parameters: WrappedInputSchema,
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const year = args.year ?? new Date().getFullYear();

        // Fetch completed lists in parallel - filter to the target year client-side
        const types: Array<"ANIME" | "MANGA"> =
          args.type === "BOTH"
            ? ["ANIME", "MANGA"]
            : [args.type as "ANIME" | "MANGA"];

        const lists = await Promise.all(
          types.map((type) => anilistClient.fetchList(username, type, "COMPLETED")),
        );
        const allEntries = lists.flat();

        // Filter to entries completed in the target year
        const yearEntries = allEntries.filter((e) => {
          // Prefer completedAt, fall back to updatedAt
          if (e.completedAt?.year != null) return e.completedAt.year === year;
          if (e.updatedAt) {
            return new Date(e.updatedAt * 1000).getFullYear() === year;
          }
          return false;
        });

        if (yearEntries.length === 0) {
          return `${username} didn't complete any titles in ${year}.`;
        }

        // Split by media type
        const anime = yearEntries.filter((e) => e.media.type === "ANIME");
        const manga = yearEntries.filter((e) => e.media.type === "MANGA");

        const lines: string[] = [`# ${year} Wrapped for ${username}`, ""];

        // Headline stats
        const parts: string[] = [];
        if (anime.length > 0) parts.push(`${anime.length} anime`);
        if (manga.length > 0) parts.push(`${manga.length} manga`);
        lines.push(`Completed ${parts.join(" and ")} in ${year}.`);

        // Scoring overview
        const scored = yearEntries.filter((e) => e.score > 0);
        if (scored.length > 0) {
          const avgScore =
            scored.reduce((sum, e) => sum + e.score, 0) / scored.length;
          lines.push(
            `Average score: ${avgScore.toFixed(1)}/10 across ${scored.length} rated titles.`,
          );
        }

        // Highest rated
        if (scored.length > 0) {
          const topRated = [...scored].sort((a, b) => b.score - a.score);
          const top = topRated[0];
          lines.push(
            `Highest rated: ${getTitle(top.media.title)} (${top.score}/10)`,
          );
        }

        // Most controversial - biggest gap between user score and community score
        const controversial = scored
          .filter((e) => e.media.meanScore !== null)
          .map((e) => ({
            entry: e,
            gap: Math.abs(
              e.score * USER_SCORE_SCALE - (e.media.meanScore ?? 0),
            ),
          }))
          .sort((a, b) => b.gap - a.gap);

        if (controversial.length > 0 && controversial[0].gap >= 20) {
          const c = controversial[0].entry;
          const communityScore = c.media.meanScore ?? 0;
          const direction =
            c.score * USER_SCORE_SCALE > communityScore ? "above" : "below";
          lines.push(
            `Most controversial: ${getTitle(c.media.title)} ` +
              `(you: ${c.score}/10, community avg: ${(communityScore / 10).toFixed(1)}/10 - ` +
              `${(controversial[0].gap / 10).toFixed(1)} pts ${direction} consensus)`,
          );
        }

        // Genre breakdown for the year
        const genreCounts = new Map<string, number>();
        for (const entry of yearEntries) {
          for (const genre of entry.media.genres) {
            genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
          }
        }
        const topGenres = [...genreCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (topGenres.length > 0) {
          lines.push("");
          lines.push("Top genres this year:");
          for (const [genre, count] of topGenres) {
            lines.push(`  ${genre}: ${count} titles`);
          }
        }

        // Episode/chapter count (use progress, not media.episodes, for accuracy)
        const totalEps = anime.reduce((sum, e) => sum + (e.progress ?? 0), 0);
        const totalChapters = manga.reduce(
          (sum, e) => sum + (e.progress ?? 0),
          0,
        );

        lines.push("");
        const consumption: string[] = [];
        if (totalEps > 0)
          consumption.push(`${totalEps.toLocaleString()} episodes watched`);
        if (totalChapters > 0)
          consumption.push(`${totalChapters.toLocaleString()} chapters read`);
        if (consumption.length > 0) lines.push(consumption.join(", "));

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "generating year summary");
      }
    },
  });
}

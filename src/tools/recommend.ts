/** Recommendation tools: taste profiling, personalized picks, and user comparison. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  BATCH_RELATIONS_QUERY,
  DISCOVER_MEDIA_QUERY,
  MEDIA_DETAILS_QUERY,
  RECOMMENDATIONS_QUERY,
  SEASONAL_MEDIA_QUERY,
} from "../api/queries.js";
import {
  TasteInputSchema,
  PickInputSchema,
  SessionInputSchema,
  SequelAlertInputSchema,
  WatchOrderInputSchema,
  CompareInputSchema,
  WrappedInputSchema,
  ExplainInputSchema,
  SimilarInputSchema,
} from "../schemas.js";
import type {
  SearchMediaResponse,
  MediaDetailsResponse,
  RecommendationsResponse,
  BatchRelationsResponse,
  AniListMediaListEntry,
  AniListMedia,
} from "../types.js";
import {
  getTitle,
  getDefaultUsername,
  throwToolError,
  isNsfwEnabled,
  resolveSeasonYear,
  resolveAlias,
} from "../utils.js";
import { SEARCH_MEDIA_QUERY } from "../api/queries.js";
import {
  buildTasteProfile,
  describeTasteProfile,
  type TasteProfile,
} from "../engine/taste.js";
import { matchCandidates, explainMatch } from "../engine/matcher.js";
import {
  parseMood,
  hasMoodMatch,
  seasonalMoodSuggestions,
} from "../engine/mood.js";
import {
  computeCompatibility,
  computeGenreDivergences,
  findCrossRecs,
} from "../engine/compare.js";
import { rankSimilar } from "../engine/similar.js";
import { buildWatchOrder, type RelationNode } from "../engine/franchise.js";
import {
  computeListHash,
  getCachedProfile,
  setCachedProfile,
} from "../engine/profile-cache.js";

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

  const nsfw = isNsfwEnabled();
  const data = await anilistClient.query<SearchMediaResponse>(
    DISCOVER_MEDIA_QUERY,
    {
      type,
      genre_in: topGenres,
      perPage: 30,
      sort: ["SCORE_DESC"],
      ...(nsfw ? {} : { isAdult: false }),
    },
    { cache: "search" },
  );

  return data.Page.media.filter((m) => !completedIds.has(m.id));
}

/** Build a taste profile for a username, with LRU caching */
async function profileForUser(
  username: string,
  type: "ANIME" | "MANGA" | "BOTH",
): Promise<{ profile: TasteProfile; entries: AniListMediaListEntry[] }> {
  let entries: AniListMediaListEntry[];

  if (type === "BOTH") {
    const [anime, manga] = await Promise.all([
      anilistClient.fetchList(username, "ANIME", "COMPLETED"),
      anilistClient.fetchList(username, "MANGA", "COMPLETED"),
    ]);
    entries = [...anime, ...manga];
  } else {
    entries = await anilistClient.fetchList(username, type, "COMPLETED");
  }

  // Check profile cache
  const cacheKey = `${username}::${type}`;
  const hash = computeListHash(entries);
  const cached = getCachedProfile(cacheKey, hash);
  if (cached) return { profile: cached, entries };

  // Rebuild and cache
  const profile = buildTasteProfile(entries);
  setCachedProfile(cacheKey, profile, hash);
  return { profile, entries };
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
      "Returns genre weights, top themes, scoring patterns with distribution chart, and format split.",
    parameters: TasteInputSchema,
    annotations: {
      title: "Taste Profile",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
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
      "based on your taste profile. Also works for backlog analysis - " +
      '"which of my 200 Planning titles should I actually start?" ' +
      "Falls back to top-rated AniList titles if the Planning list is empty. " +
      "Optionally filter by mood or max episodes. " +
      "Returns ranked picks with match score, genre alignment, and mood fit.",
    parameters: PickInputSchema,
    annotations: {
      title: "Pick Next Watch",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const profileType = args.profileType ?? args.type;
        const source = args.source;

        // Completed list for taste profile
        const completedPromise = anilistClient.fetchList(
          username,
          profileType,
          "COMPLETED",
        );

        // Candidate source depends on mode
        let candidatePromise: Promise<AniListMedia[]>;
        let sourceLabel: string;

        if (source === "SEASONAL") {
          if (args.type === "MANGA") {
            return "SEASONAL source only works with anime. Use PLANNING or DISCOVER for manga recommendations.";
          }
          const { season, year } = resolveSeasonYear(args.season, args.year);
          sourceLabel = `${season} ${year} seasonal anime`;
          candidatePromise = (async () => {
            const vars = {
              season,
              seasonYear: year,
              type: "ANIME",
              sort: ["POPULARITY_DESC"],
              perPage: 50,
            };
            // Fetch pages 1 and 2 in parallel to cover 100 titles
            const [p1, p2] = await Promise.all([
              anilistClient.query<SearchMediaResponse>(
                SEASONAL_MEDIA_QUERY,
                { ...vars, page: 1 },
                { cache: "seasonal" },
              ),
              anilistClient.query<SearchMediaResponse>(
                SEASONAL_MEDIA_QUERY,
                { ...vars, page: 2 },
                { cache: "seasonal" },
              ),
            ]);
            return [...p1.Page.media, ...p2.Page.media];
          })();
        } else if (source === "DISCOVER") {
          sourceLabel = "top-rated titles matching your taste";
          candidatePromise = (async () => {
            const completed = await completedPromise;
            const profile = buildTasteProfile(completed);
            const completedIds = new Set(completed.map((e) => e.media.id));
            return discoverByTaste(profile, args.type, completedIds);
          })();
        } else {
          sourceLabel = "";
          candidatePromise = anilistClient
            .fetchList(username, args.type, "PLANNING")
            .then((entries) => entries.map((e) => e.media));
        }

        const [completed, candidateMedia] = await Promise.all([
          completedPromise,
          candidatePromise,
        ]);

        const profile = buildTasteProfile(completed);

        if (profile.genres.length === 0) {
          return (
            `${username} hasn't scored enough completed titles to build a taste profile. ` +
            `Score more titles on AniList for personalized recommendations.`
          );
        }

        // For PLANNING source, fall back to discover when list is empty
        const fromDiscovery =
          source === "PLANNING" && candidateMedia.length === 0;
        let candidates: AniListMedia[];

        if (fromDiscovery) {
          const completedIds = new Set(completed.map((e) => e.media.id));
          candidates = await discoverByTaste(profile, args.type, completedIds);
        } else {
          // Filter out already-completed titles for SEASONAL/DISCOVER
          if (source !== "PLANNING") {
            const completedIds = new Set(completed.map((e) => e.media.id));
            candidates = candidateMedia.filter((m) => !completedIds.has(m.id));
          } else {
            candidates = candidateMedia;
          }
        }

        // Filter adult content unless enabled
        if (!isNsfwEnabled()) {
          candidates = candidates.filter((m) => !m.isAdult);
        }

        // Optionally filter by episode count
        const maxEps = args.maxEpisodes;
        if (maxEps) {
          candidates = candidates.filter(
            (m) => !m.episodes || m.episodes <= maxEps,
          );
        }

        // Exclude previously shown IDs
        if (args.exclude?.length) {
          const excludeSet = new Set(args.exclude);
          candidates = candidates.filter((m) => !excludeSet.has(m.id));
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

        const crossMedia = profileType !== args.type;
        const lines: string[] = [
          `# Top Picks for ${username}`,
          `Based on ${completed.length} completed ${profileType.toLowerCase()} titles` +
            (crossMedia
              ? ` (cross-media: ${profileType.toLowerCase()} taste -> ${args.type.toLowerCase()} picks)`
              : "") +
            (results.length > picks.length
              ? ` (showing ${picks.length} of ${results.length} matches)`
              : ""),
        ];

        if (fromDiscovery) {
          lines.push(
            "No Planning list found - showing top-rated titles matching your taste",
          );
        } else if (sourceLabel) {
          lines.push(`Source: ${sourceLabel}`);
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

        // Seasonal mood tip when no mood was provided
        if (!args.mood) {
          const { season, moods } = seasonalMoodSuggestions();
          lines.push(
            `Tip: try a mood like "${moods.join('", "')}" for ${season.toLowerCase()} picks`,
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "picking recommendations");
      }
    },
  });

  // === Watch Session ===

  server.addTool({
    name: "anilist_session",
    description:
      "Plan a watching or reading session within a time budget. " +
      "Picks from your currently-watching list, scored by taste match and mood. " +
      "Returns a session plan with titles, episodes to watch, and estimated time.",
    parameters: SessionInputSchema,
    annotations: {
      title: "Plan Session",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // CURRENT list for candidates, COMPLETED list for taste profile
        const [current, completed] = await Promise.all([
          anilistClient.fetchList(username, args.type, "CURRENT"),
          anilistClient.fetchList(username, args.type, "COMPLETED"),
        ]);

        if (current.length === 0) {
          return `${username} has no ${args.type.toLowerCase()} currently in progress.`;
        }

        const profile = buildTasteProfile(completed);
        const mood = args.mood ? parseMood(args.mood) : undefined;

        // Score each current entry
        const isManga = args.type === "MANGA";
        const defaultUnit = isManga ? 5 : 24;
        const candidates = current.map((entry) => {
          const m = entry.media;
          const totalUnits = isManga ? m.chapters : m.episodes;
          const remaining = totalUnits ? totalUnits - entry.progress : null;
          const unitDuration = m.duration ?? defaultUnit;

          const results = matchCandidates([m], profile, mood);
          const matchScore = results.length > 0 ? results[0].score : 50;

          return { entry, remaining, unitDuration, matchScore };
        });

        // Sort by match score descending
        candidates.sort((a, b) => b.matchScore - a.matchScore);

        // Greedy knapsack: fill the time budget
        let budget = args.minutes;
        const plan: Array<{
          title: string;
          episodes: number;
          minutes: number;
          progress: string;
        }> = [];

        for (const c of candidates) {
          if (budget <= 0) break;
          const unitDuration = c.unitDuration;
          if (unitDuration > budget) continue;

          // How many units fit in remaining budget
          const maxUnits = Math.floor(budget / unitDuration);
          const availableUnits =
            c.remaining !== null ? Math.min(maxUnits, c.remaining) : maxUnits;

          if (availableUnits <= 0) continue;

          const time = availableUnits * unitDuration;
          const title = getTitle(c.entry.media.title);
          const m = c.entry.media;
          const total = (isManga ? m.chapters : m.episodes) ?? "?";
          const newProgress = c.entry.progress + availableUnits;

          plan.push({
            title,
            episodes: availableUnits,
            minutes: time,
            progress: `${newProgress}/${total}`,
          });

          budget -= time;
        }

        if (plan.length === 0) {
          const unitLabel = isManga ? "chapters" : "episodes";
          return `No ${unitLabel} fit within ${args.minutes} minutes. Try a larger time budget.`;
        }

        const totalMinutes = plan.reduce((sum, p) => sum + p.minutes, 0);
        const totalEps = plan.reduce((sum, p) => sum + p.episodes, 0);

        const lines: string[] = [
          `# Session Plan for ${username}`,
          `Budget: ${args.minutes} min | Planned: ${totalMinutes} min (${totalEps} ${isManga ? "chapters" : "episodes"})`,
        ];

        if (args.mood) {
          lines.push(`Mood: "${args.mood}"`);
        }

        lines.push("");

        for (let i = 0; i < plan.length; i++) {
          const p = plan[i];
          const unit = args.type === "MANGA" ? "ch" : "ep";
          lines.push(
            `${i + 1}. ${p.title} - ${p.episodes} ${unit} (~${p.minutes} min) -> ${p.progress}`,
          );
        }

        if (budget > 0) {
          lines.push("", `${budget} min remaining`);
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "planning session");
      }
    },
  });

  // === Sequel Alerts ===

  server.addTool({
    name: "anilist_sequels",
    description:
      "Find sequels airing this season for titles you've completed. " +
      "Use when the user asks what sequels are coming, or wants to know " +
      "if any currently airing anime continue shows they've already watched. " +
      "Returns matches with the completed prequel and the airing sequel.",
    parameters: SequelAlertInputSchema,
    annotations: {
      title: "Sequel Alerts",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const { season, year } = resolveSeasonYear(args.season, args.year);

        // Fetch seasonal anime + completed list in parallel
        const [seasonalData, completed] = await Promise.all([
          anilistClient.query<SearchMediaResponse>(
            SEASONAL_MEDIA_QUERY,
            {
              season,
              seasonYear: year,
              type: "ANIME",
              sort: ["POPULARITY_DESC"],
              perPage: 50,
              page: 1,
            },
            { cache: "seasonal" },
          ),
          anilistClient.fetchList(username, "ANIME", "COMPLETED"),
        ]);

        const seasonalMedia = seasonalData.Page.media;
        if (seasonalMedia.length === 0) {
          return `No anime found for ${season} ${year}.`;
        }

        const completedIds = new Set(completed.map((e) => e.media.id));
        const completedTitles = new Map(
          completed.map((e) => [e.media.id, getTitle(e.media.title)]),
        );

        // Batch-fetch relations for all seasonal titles
        const seasonalIds = seasonalMedia.map((m) => m.id);
        const relationsData = await anilistClient.query<BatchRelationsResponse>(
          BATCH_RELATIONS_QUERY,
          { ids: seasonalIds },
          { cache: "media" },
        );

        // Check each seasonal title for prequel/parent in completed set
        const alerts: Array<{
          sequel: string;
          sequelUrl: string;
          prequel: string;
          relation: string;
        }> = [];

        for (const media of relationsData.Page.media) {
          for (const edge of media.relations.edges) {
            const rel = edge.relationType;
            if (rel !== "PREQUEL" && rel !== "PARENT") continue;
            if (!completedIds.has(edge.node.id)) continue;

            const sequelTitle =
              media.title.english ?? media.title.romaji ?? "Unknown";
            const prequelTitle =
              completedTitles.get(edge.node.id) ??
              edge.node.title.english ??
              edge.node.title.romaji ??
              "Unknown";

            alerts.push({
              sequel: sequelTitle,
              sequelUrl: `https://anilist.co/anime/${media.id}`,
              prequel: prequelTitle,
              relation: rel === "PREQUEL" ? "sequel" : "spin-off",
            });
            break;
          }
        }

        if (alerts.length === 0) {
          return `No sequels to your completed anime found in ${season} ${year}.`;
        }

        const lines: string[] = [
          `# Sequel Alerts for ${username}`,
          `${alerts.length} sequel${alerts.length !== 1 ? "s" : ""} airing in ${season} ${year}:`,
          "",
        ];

        for (let i = 0; i < alerts.length; i++) {
          const a = alerts[i];
          lines.push(
            `${i + 1}. ${a.sequel} (${a.relation} to ${a.prequel})`,
            `   ${a.sequelUrl}`,
            "",
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "checking sequel alerts");
      }
    },
  });

  // === Watch Order ===

  server.addTool({
    name: "anilist_watch_order",
    description:
      "Suggested viewing order for a franchise. " +
      "Use when the user asks what order to watch a series, how to start a long franchise, " +
      "or wants to know the chronological release order of sequels and prequels. " +
      "Accepts any title in the franchise and traces the full chain. " +
      "Returns a numbered list from first to last.",
    parameters: WatchOrderInputSchema,
    annotations: {
      title: "Watch Order",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        // Resolve title to ID
        let mediaId: number;
        if (args.id) {
          mediaId = args.id;
        } else {
          const data = await anilistClient.query<MediaDetailsResponse>(
            MEDIA_DETAILS_QUERY,
            { search: args.title },
            { cache: "media" },
          );
          mediaId = data.Media.id;
        }

        // BFS expansion: discover all franchise IDs via batch relation queries
        const relationsMap = new Map<number, RelationNode>();
        let frontier = [mediaId];
        const maxRounds = 5;

        for (let round = 0; round < maxRounds && frontier.length > 0; round++) {
          const data = await anilistClient.query<BatchRelationsResponse>(
            BATCH_RELATIONS_QUERY,
            { ids: frontier },
            { cache: "media" },
          );

          const nextFrontier: number[] = [];

          for (const media of data.Page.media) {
            if (relationsMap.has(media.id)) continue;
            relationsMap.set(media.id, media);

            // Collect newly discovered IDs
            for (const edge of media.relations.edges) {
              if (!relationsMap.has(edge.node.id)) {
                nextFrontier.push(edge.node.id);
              }
            }
          }

          frontier = nextFrontier;
        }

        if (relationsMap.size === 0) {
          return "Could not find franchise relations for this title.";
        }

        const entries = buildWatchOrder(
          mediaId,
          relationsMap,
          args.includeSpecials,
        );

        if (entries.length === 0) {
          return "No entries found in the watch order. This title may be standalone.";
        }

        // Get the franchise name from the root entry
        const rootTitle = entries[0].title;
        const lines: string[] = [
          `# Watch Order: ${rootTitle} franchise`,
          `${entries.length} entr${entries.length !== 1 ? "ies" : "y"}${args.includeSpecials ? " (including specials)" : ""}:`,
          "",
        ];

        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const parts = [e.format ?? "Unknown format"];
          if (e.status) parts.push(e.status.replace(/_/g, " "));
          if (e.type === "special") parts.push("special");

          lines.push(`${i + 1}. ${e.title} (${parts.join(" - ")})`);
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "building watch order");
      }
    },
  });

  // === User Comparison ===

  server.addTool({
    name: "anilist_compare",
    description:
      "Compare taste profiles between two AniList users. " +
      "Use when someone asks to compare their taste with another user. " +
      "Returns compatibility %, shared favorites, biggest disagreements, " +
      "genre divergences, and cross-recommendations.",
    parameters: CompareInputSchema,
    annotations: {
      title: "Compare Users",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
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
        const divergences = computeGenreDivergences(
          profile1,
          profile2,
          args.user1,
          args.user2,
        );
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
      "in a given year, or wants a recap. Defaults to the current year. " +
      "Returns title count, average score, highest rated, most controversial, genre breakdown, and consumption stats.",
    parameters: WrappedInputSchema,
    annotations: {
      title: "Year in Review",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
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
          types.map((type) =>
            anilistClient.fetchList(username, type, "COMPLETED"),
          ),
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

  // === Explain Match ===

  server.addTool({
    name: "anilist_explain",
    description:
      "Score a specific title against a user's taste profile and explain the alignment. " +
      'Use when the user asks "why would I like this?", "is this for me?", or ' +
      "wants to know how well a specific anime/manga matches their preferences. " +
      "Returns match score, genre/theme affinity breakdown, mood fit, and existing list status.",
    parameters: ExplainInputSchema,
    annotations: {
      title: "Explain Match",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Resolve title to media ID if needed
        let mediaId = args.mediaId;
        if (!mediaId && args.title) {
          const search = resolveAlias(args.title);
          const searchData = await anilistClient.query<SearchMediaResponse>(
            SEARCH_MEDIA_QUERY,
            { search, type: "ANIME", page: 1, perPage: 1 },
            { cache: "search" },
          );
          if (!searchData.Page.media.length) {
            return `No results found for "${args.title}".`;
          }
          mediaId = searchData.Page.media[0].id;
        }

        // Fetch media details and taste profile in parallel
        const [mediaData, { profile, entries }] = await Promise.all([
          anilistClient.query<MediaDetailsResponse>(
            MEDIA_DETAILS_QUERY,
            { id: mediaId },
            { cache: "media" },
          ),
          profileForUser(username, args.type),
        ]);

        const media = mediaData.Media;
        const title = getTitle(media.title);

        if (profile.genres.length === 0) {
          return (
            `${username} hasn't scored enough completed titles to build a taste profile. ` +
            `Score more titles on AniList for personalized analysis.`
          );
        }

        // Check if user already has this on their list
        const existingEntry = entries.find((e) => e.media.id === media.id);

        const mood = args.mood ? parseMood(args.mood) : undefined;
        const result = explainMatch(media, profile, mood);
        const b = result.breakdown;

        const lines: string[] = [
          `# Match Analysis: ${title}`,
          "",
          `Match Score: ${b.finalScore}/100`,
          "",
          "## Score Breakdown",
          `  Genre affinity: ${Math.round(b.genreScore * 100)}%`,
          `  Theme affinity: ${Math.round(b.tagScore * 100)}%`,
          `  Community score: ${Math.round(b.communityScore * 100)}%`,
          `  Popularity adjustment: ${Math.round((1 - b.popularityFactor) * -100)}%`,
        ];

        if (b.moodMultiplier !== 1) {
          const sign = b.moodMultiplier > 1 ? "+" : "";
          lines.push(
            `  Mood modifier: ${sign}${Math.round((b.moodMultiplier - 1) * 100)}%`,
          );
        }

        // Genre alignment
        if (
          result.matchedGenres.length > 0 ||
          result.unmatchedGenres.length > 0
        ) {
          lines.push("", "## Genre Alignment");
          if (result.matchedGenres.length > 0) {
            lines.push(`  Matching: ${result.matchedGenres.join(", ")}`);
          }
          if (result.unmatchedGenres.length > 0) {
            lines.push(`  New for you: ${result.unmatchedGenres.join(", ")}`);
          }
        }

        // Theme alignment
        if (result.matchedTags.length > 0 || result.unmatchedTags.length > 0) {
          lines.push("", "## Theme Alignment");
          if (result.matchedTags.length > 0) {
            lines.push(
              `  Matching: ${result.matchedTags.slice(0, 5).join(", ")}`,
            );
          }
          if (result.unmatchedTags.length > 0) {
            lines.push(
              `  New for you: ${result.unmatchedTags.slice(0, 5).join(", ")}`,
            );
          }
        }

        // Mood fit
        if (result.moodFit) {
          lines.push("", `Mood: ${result.moodFit}`);
        }

        // User's existing relationship with this title
        if (existingEntry) {
          lines.push("");
          const status = existingEntry.status;
          const scorePart =
            existingEntry.score > 0
              ? ` - scored ${existingEntry.score}/10`
              : "";
          lines.push(`Note: You have this as ${status}${scorePart}`);
        }

        lines.push("", `AniList: ${media.siteUrl}`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "explaining match");
      }
    },
  });

  // === Similar Titles ===

  server.addTool({
    name: "anilist_similar",
    description:
      "Find titles similar to a specific anime or manga. " +
      "Use when the user asks for shows like a specific title, " +
      "or wants content-based recommendations without needing a user profile. " +
      "Returns ranked results with similarity %, shared genres, and community rec strength.",
    parameters: SimilarInputSchema,
    annotations: {
      title: "Find Similar",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        // Resolve title to media ID if needed
        let mediaId = args.mediaId;
        if (!mediaId && args.title) {
          const search = resolveAlias(args.title);
          const searchData = await anilistClient.query<SearchMediaResponse>(
            SEARCH_MEDIA_QUERY,
            { search, type: "ANIME", page: 1, perPage: 1 },
            { cache: "search" },
          );
          if (!searchData.Page.media.length) {
            return `No results found for "${args.title}".`;
          }
          mediaId = searchData.Page.media[0].id;
        }

        // Fetch source details and recommendations in parallel
        const [detailsData, recsData] = await Promise.all([
          anilistClient.query<MediaDetailsResponse>(
            MEDIA_DETAILS_QUERY,
            { id: mediaId },
            { cache: "media" },
          ),
          anilistClient.query<RecommendationsResponse>(
            RECOMMENDATIONS_QUERY,
            { id: mediaId, perPage: 25 },
            { cache: "media" },
          ),
        ]);

        const source = detailsData.Media;
        const sourceTitle = getTitle(source.title);

        // Build candidate list and rec rating map
        const nsfw = isNsfwEnabled();
        const candidates: AniListMedia[] = [];
        const recRatings = new Map<number, number>();

        for (const node of recsData.Media.recommendations.nodes) {
          if (!node.mediaRecommendation) continue;
          if (!nsfw && node.mediaRecommendation.isAdult) continue;
          candidates.push(node.mediaRecommendation);
          if (node.rating > 0) {
            recRatings.set(node.mediaRecommendation.id, node.rating);
          }
        }

        if (candidates.length === 0) {
          return `No similar titles found for "${sourceTitle}". This title may not have enough community recommendations yet.`;
        }

        const results = rankSimilar(source, candidates, recRatings);
        const top = results.slice(0, args.limit);

        const lines: string[] = [`# Similar to ${sourceTitle}`, ""];

        for (let i = 0; i < top.length; i++) {
          const r = top[i];
          const m = r.media;
          const title = getTitle(m.title);
          const score = m.meanScore ? `${m.meanScore}/100` : "Unrated";
          const format = m.format ?? "";
          const eps = m.episodes ? `${m.episodes} episodes` : "";

          lines.push(`${i + 1}. ${title} - ${r.similarityScore}% similar`);
          lines.push(`   ${[format, score, eps].filter(Boolean).join(" - ")}`);
          for (const reason of r.reasons) {
            lines.push(`   - ${reason}`);
          }
          lines.push(`   URL: ${m.siteUrl}`);
          lines.push("");
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "finding similar titles");
      }
    },
  });
}

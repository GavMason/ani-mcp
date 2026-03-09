/** Analytics tools: scoring calibration, drop patterns, genre evolution, and more. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import { BATCH_RELATIONS_QUERY } from "../api/queries.js";
import {
  computeCalibration,
  analyzeDrops,
  computeGenreEvolution,
} from "../engine/analytics.js";
import type { RelationNode } from "../engine/franchise.js";
import {
  CalibrationInputSchema,
  DropPatternInputSchema,
  EvolutionInputSchema,
  CompletionistInputSchema,
  SeasonalHitRateInputSchema,
  PaceInputSchema,
} from "../schemas.js";
import type { BatchRelationsResponse } from "../types.js";
import {
  getDefaultUsername,
  getTitle,
  resolveSeasonYear,
  throwToolError,
  dateToEpoch,
} from "../utils.js";

// Season order for iteration
const SEASON_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

/** Register all analytics tools */
export function registerAnalyticsTools(server: FastMCP): void {
  // === Score Calibration ===

  server.addTool({
    name: "anilist_calibration",
    description:
      "Score calibration analysis showing how a user rates compared to community consensus. " +
      "Use when the user asks if they score too high or low, which genres they're harshest " +
      "or most generous on, or how their taste compares to mainstream. " +
      "Returns overall bias, per-genre deviation, and scoring tendency.",
    parameters: CalibrationInputSchema,
    annotations: {
      title: "Score Calibration",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const entries = await anilistClient.fetchList(
          username,
          args.type,
          "COMPLETED",
        );

        const result = computeCalibration(entries);

        if (result.totalScored === 0) {
          return `${username} has no scored ${args.type.toLowerCase()} entries to calibrate.`;
        }

        const lines: string[] = [
          `# Score Calibration: ${username} (${args.type.toLowerCase()})`,
          "",
          `Based on ${result.totalScored} scored titles.`,
          "",
        ];

        // Overall tendency
        const sign = result.overallDelta >= 0 ? "+" : "";
        lines.push(
          `Overall: ${sign}${result.overallDelta.toFixed(2)} vs community (${result.tendency} scorer vs avg)`,
        );

        // Per-genre breakdown
        if (result.genreCalibrations.length > 0) {
          lines.push("", "Per-genre bias (biggest deviations first):");
          for (const g of result.genreCalibrations.slice(0, 10)) {
            const gSign = g.delta >= 0 ? "+" : "";
            const direction = g.delta >= 0 ? "higher" : "lower";
            lines.push(
              `  ${g.genre}: ${gSign}${g.delta.toFixed(2)} (you rate ${Math.abs(g.delta).toFixed(1)} ${direction} than average, ${g.count} titles)`,
            );
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "computing score calibration");
      }
    },
  });

  // === Drop Pattern Analysis ===

  server.addTool({
    name: "anilist_drops",
    description:
      "Drop pattern analysis from a user's dropped list. " +
      "Use when the user asks why they drop shows, what patterns their drops follow, " +
      "or which genres they abandon most. " +
      "Returns drop rate by genre/tag, median episode at drop, and early drop percentage.",
    parameters: DropPatternInputSchema,
    annotations: {
      title: "Drop Patterns",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Fetch dropped and all entries in parallel
        const [dropped, all] = await Promise.all([
          anilistClient.fetchList(username, args.type, "DROPPED"),
          anilistClient.fetchList(username, args.type),
        ]);

        if (dropped.length === 0) {
          return `${username} hasn't dropped any ${args.type.toLowerCase()} titles.`;
        }

        const result = analyzeDrops(dropped, all);
        const lines: string[] = [
          `# Drop Patterns: ${username} (${args.type.toLowerCase()})`,
          "",
          `${result.totalDropped} titles dropped.`,
        ];

        // Early drop stats
        if (result.totalDropped > 0) {
          const earlyPct = (
            (result.earlyDrops / result.totalDropped) *
            100
          ).toFixed(0);
          lines.push(
            `${result.earlyDrops} early drops (${earlyPct}% dropped before 25% progress)`,
          );
          if (result.avgDropProgress > 0) {
            lines.push(
              `Average drop point: ${(result.avgDropProgress * 100).toFixed(0)}% through`,
            );
          }
        }

        // Genre clusters
        const genreClusters = result.clusters.filter((c) => c.type === "genre");
        if (genreClusters.length > 0) {
          lines.push("", "Drop rate by genre:");
          for (const c of genreClusters) {
            const pct = (c.dropRate * 100).toFixed(0);
            const dropEp =
              c.medianDropPoint > 0
                ? ` (median drop at ${(c.medianDropPoint * 100).toFixed(0)}%)`
                : "";
            lines.push(
              `  ${c.label}: ${pct}% drop rate (${c.dropCount}/${c.totalCount})${dropEp}`,
            );
          }
        }

        // Tag clusters
        const tagClusters = result.clusters.filter((c) => c.type === "tag");
        if (tagClusters.length > 0) {
          lines.push("", "Drop rate by theme:");
          for (const c of tagClusters) {
            const pct = (c.dropRate * 100).toFixed(0);
            lines.push(
              `  ${c.label}: ${pct}% drop rate (${c.dropCount}/${c.totalCount})`,
            );
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "analyzing drop patterns");
      }
    },
  });

  // === Genre Evolution ===

  server.addTool({
    name: "anilist_evolution",
    description:
      "Genre evolution analysis showing how taste has shifted over time. " +
      "Use when the user asks how their taste has changed, what they used to watch vs now, " +
      "or wants a timeline of their preferences. " +
      "Returns era-by-era genre rankings and shift descriptions.",
    parameters: EvolutionInputSchema,
    annotations: {
      title: "Genre Evolution",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const entries = await anilistClient.fetchList(
          username,
          args.type,
          "COMPLETED",
        );

        const result = computeGenreEvolution(entries);

        if (result.eras.length === 0) {
          return `${username} has no dated completed ${args.type.toLowerCase()} entries to analyze.`;
        }

        const lines: string[] = [
          `# Genre Evolution: ${username} (${args.type.toLowerCase()})`,
          "",
        ];

        for (const era of result.eras) {
          lines.push(
            `${era.period} (${era.count} titles): ${era.topGenres.join(", ")}`,
          );
        }

        if (result.shifts.length > 0) {
          lines.push("", "Key shifts:");
          for (const s of result.shifts) {
            lines.push(`  ${s}`);
          }
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "analyzing genre evolution");
      }
    },
  });

  // === Completionist Stats ===

  server.addTool({
    name: "anilist_completionist",
    description:
      "Franchise completion tracker showing progress through series with sequels. " +
      "Use when the user asks what franchises they've started but not finished, " +
      "their completion rate, or what's left to watch in a series. " +
      "Returns franchise groups with completed/total counts.",
    parameters: CompletionistInputSchema,
    annotations: {
      title: "Franchise Completion",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Get all entries to know which IDs the user has interacted with
        const allEntries = await anilistClient.fetchList(username, args.type);

        if (allEntries.length === 0) {
          return `${username} has no ${args.type.toLowerCase()} entries.`;
        }

        const completedIds = new Set(
          allEntries
            .filter((e) => e.status === "COMPLETED")
            .map((e) => e.media.id),
        );
        const allIds = new Set(allEntries.map((e) => e.media.id));

        // Batch-fetch relations for all media the user has
        const relationsMap = new Map<number, RelationNode>();
        let frontier = [...allIds];
        const maxRounds = 3;

        for (let round = 0; round < maxRounds && frontier.length > 0; round++) {
          // Fetch all chunks in parallel (rate limiter queues excess)
          const chunks: number[][] = [];
          for (let i = 0; i < frontier.length; i += 50) {
            chunks.push(frontier.slice(i, i + 50));
          }
          const results = await Promise.all(
            chunks.map((chunk) =>
              anilistClient.query<BatchRelationsResponse>(
                BATCH_RELATIONS_QUERY,
                { ids: chunk },
                { cache: "media" },
              ),
            ),
          );
          for (const data of results) {
            for (const media of data.Page.media) {
              if (!relationsMap.has(media.id)) {
                relationsMap.set(media.id, media as RelationNode);
              }
            }
          }

          // Discover new IDs from relations
          const nextFrontier: number[] = [];
          for (const node of relationsMap.values()) {
            for (const edge of node.relations.edges) {
              if (
                !relationsMap.has(edge.node.id) &&
                (edge.relationType === "SEQUEL" ||
                  edge.relationType === "PREQUEL") &&
                edge.node.type === args.type
              ) {
                nextFrontier.push(edge.node.id);
              }
            }
          }
          frontier = nextFrontier;
        }

        // Group by franchise root (follow PREQUEL edges backward)
        const franchises = new Map<
          number,
          { title: string; members: number[]; completed: number }
        >();
        const assigned = new Set<number>();

        for (const id of allIds) {
          if (assigned.has(id)) continue;

          // Find root by following prequel edges
          let rootId = id;
          const visited = new Set<number>();
          while (true) {
            visited.add(rootId);
            const node = relationsMap.get(rootId);
            if (!node) break;
            const prequel = node.relations.edges.find(
              (e) => e.relationType === "PREQUEL" && !visited.has(e.node.id),
            );
            if (!prequel) break;
            rootId = prequel.node.id;
          }

          // Collect all franchise members via sequel/prequel edges
          const members = new Set<number>();
          const queue = [rootId];
          while (queue.length > 0) {
            const current = queue.shift();
            if (current === undefined || members.has(current)) continue;
            members.add(current);

            const node = relationsMap.get(current);
            if (!node) continue;
            for (const edge of node.relations.edges) {
              if (
                (edge.relationType === "SEQUEL" ||
                  edge.relationType === "PREQUEL") &&
                edge.node.type === args.type &&
                !members.has(edge.node.id)
              ) {
                queue.push(edge.node.id);
              }
            }
          }

          // Only track franchises with 2+ entries
          if (members.size < 2) continue;

          // Find a good title for the franchise
          const rootNode = relationsMap.get(rootId);
          const title = rootNode
            ? (rootNode.title.english ?? rootNode.title.romaji ?? "Unknown")
            : "Unknown";

          const memberArr = [...members];
          const completed = memberArr.filter((m) => completedIds.has(m)).length;

          for (const m of members) assigned.add(m);
          franchises.set(rootId, {
            title,
            members: memberArr,
            completed,
          });
        }

        // Sort by largest completion gap (most to finish first)
        const sorted = [...franchises.values()]
          .filter((f) => f.completed > 0 && f.completed < f.members.length)
          .sort(
            (a, b) =>
              b.members.length - b.completed - (a.members.length - a.completed),
          );

        if (sorted.length === 0) {
          return `${username} has no partially completed franchises.`;
        }

        const lines: string[] = [
          `# Franchise Completion: ${username} (${args.type.toLowerCase()})`,
          "",
        ];

        for (const f of sorted.slice(0, args.limit)) {
          const remaining = f.members.length - f.completed;
          const pct = ((f.completed / f.members.length) * 100).toFixed(0);
          lines.push(
            `${f.title}: ${f.completed}/${f.members.length} (${pct}%) - ${remaining} remaining`,
          );
        }

        if (sorted.length > args.limit) {
          lines.push(
            "",
            `${sorted.length - args.limit} more franchises not shown.`,
          );
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "computing franchise completion");
      }
    },
  });

  // === Seasonal Hit Rate ===

  server.addTool({
    name: "anilist_seasonal_stats",
    description:
      "Seasonal pick-up and completion rates. " +
      "Use when the user asks about their seasonal watching habits, how many shows " +
      "they finish vs drop each season, or their hit rate. " +
      "Returns per-season breakdown of picked, finished, dropped, and ongoing counts.",
    parameters: SeasonalHitRateInputSchema,
    annotations: {
      title: "Seasonal Hit Rate",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);

        // Fetch all entries (all statuses)
        const entries = await anilistClient.fetchList(username, "ANIME");

        if (entries.length === 0) {
          return `${username} has no anime entries.`;
        }

        // Determine target seasons to show
        const { season: currentSeason, year: currentYear } = resolveSeasonYear(
          args.season,
          args.year,
        );

        // Build list of seasons to analyze (going backward)
        const seasons: Array<{ season: string; year: number }> = [];
        let s = SEASON_ORDER.indexOf(
          currentSeason as (typeof SEASON_ORDER)[number],
        );
        let y = currentYear;

        for (let i = 0; i < args.history; i++) {
          seasons.push({ season: SEASON_ORDER[s], year: y });
          s--;
          if (s < 0) {
            s = 3;
            y--;
          }
        }

        seasons.reverse();

        const lines: string[] = [`# Seasonal Hit Rate: ${username}`, ""];

        for (const target of seasons) {
          // Match entries by the media's season/year
          const matching = entries.filter(
            (e) =>
              e.media.season === target.season &&
              e.media.seasonYear === target.year,
          );

          if (matching.length === 0) continue;

          const finished = matching.filter(
            (e) => e.status === "COMPLETED",
          ).length;
          const dropped = matching.filter((e) => e.status === "DROPPED").length;
          const current = matching.filter((e) => e.status === "CURRENT").length;
          const paused = matching.filter((e) => e.status === "PAUSED").length;
          const hitRate = ((finished / matching.length) * 100).toFixed(0);

          const parts: string[] = [];
          parts.push(`${finished} finished`);
          if (dropped > 0) parts.push(`${dropped} dropped`);
          if (current > 0) parts.push(`${current} watching`);
          if (paused > 0) parts.push(`${paused} paused`);

          lines.push(
            `${target.season} ${target.year}: ${matching.length} picked up - ${parts.join(", ")} (${hitRate}% hit rate)`,
          );
        }

        if (lines.length <= 2) {
          return `No seasonal data found for ${username} in the requested range.`;
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "computing seasonal hit rate");
      }
    },
  });

  // === Pace Estimate ===

  server.addTool({
    name: "anilist_pace",
    description:
      "Pace estimate for currently watching or reading titles. " +
      "Use when the user asks how long it'll take to finish something, " +
      "their watch rate, or wants a progress summary. " +
      "Returns estimated completion date based on historical pace.",
    parameters: PaceInputSchema,
    annotations: {
      title: "Pace Estimate",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        let entries = await anilistClient.fetchList(
          username,
          args.type,
          "CURRENT",
        );

        if (entries.length === 0) {
          return `${username} has no current ${args.type.toLowerCase()} entries.`;
        }

        // Filter to specific media if requested
        if (args.mediaId) {
          entries = entries.filter((e) => e.media.id === args.mediaId);
          if (entries.length === 0) {
            return `Media ID ${args.mediaId} is not on ${username}'s current list.`;
          }
        }

        const now = Date.now() / 1000;
        const unit = args.type === "ANIME" ? "ep" : "ch";
        const lines: string[] = [
          `# Pace Estimate: ${username} (${args.type.toLowerCase()})`,
          "",
        ];

        for (const entry of entries) {
          const title = getTitle(entry.media.title);
          const total = entry.media.episodes ?? entry.media.chapters ?? 0;
          const remaining = total > 0 ? total - entry.progress : 0;

          // Compute pace from startedAt
          const startEpoch = dateToEpoch(entry.startedAt);
          const weeksSinceStart = startEpoch
            ? (now - startEpoch) / (7 * 24 * 3600)
            : 0;

          let rateLine = "";
          let estimateLine = "";

          if (weeksSinceStart >= 1 && entry.progress > 0) {
            const perWeek = entry.progress / weeksSinceStart;

            // Stalled if less than 0.1 ep/week over 4+ weeks
            if (perWeek < 0.1 && weeksSinceStart >= 4) {
              rateLine = "Stalled";
            } else {
              rateLine = `${perWeek.toFixed(1)} ${unit}/week`;
              if (remaining > 0 && perWeek > 0) {
                const weeksLeft = remaining / perWeek;
                // Cap estimates at 1 year to avoid absurd projections
                if (weeksLeft <= 52) {
                  const finishEpoch = now + weeksLeft * 7 * 24 * 3600;
                  const finishDate = new Date(finishEpoch * 1000);
                  const dateStr = finishDate.toISOString().split("T")[0];
                  estimateLine = `~${Math.ceil(weeksLeft)} weeks (est. ${dateStr})`;
                } else {
                  estimateLine = "Stalled - no realistic estimate";
                }
              }
            }
          }

          // Progress string
          const progressStr =
            total > 0
              ? `${entry.progress}/${total} ${unit}`
              : `${entry.progress} ${unit}`;

          const parts = [progressStr];
          if (rateLine) parts.push(rateLine);
          if (estimateLine) parts.push(estimateLine);

          lines.push(`${title}: ${parts.join(" - ")}`);
        }

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "estimating pace");
      }
    },
  });
}

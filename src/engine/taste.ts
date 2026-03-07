/** Builds a weighted taste profile from a user's scored anime/manga list */

import type { AniListMediaListEntry } from "../types.js";
import { dateToEpoch } from "../utils.js";

// === Types ===

export interface WeightedItem {
  name: string;
  weight: number;
  count: number;
}

export interface ScoringPattern {
  meanScore: number;
  median: number;
  totalScored: number;
  distribution: Record<number, number>;
  tendency: "generous" | "harsh" | "average";
}

export interface FormatBreakdown {
  format: string;
  count: number;
  percent: number;
}

export interface TasteProfile {
  genres: WeightedItem[];
  tags: WeightedItem[];
  scoring: ScoringPattern;
  formats: FormatBreakdown[];
  totalCompleted: number;
}

// === Constants ===

// AniList community mean hovers around 7.0-7.2
const SITE_MEAN = 7.0;

// Minimum entries to produce a meaningful profile
const MIN_ENTRIES = 5;

// Entries scored 0 are unscored on AniList (not a real 0/10)
const UNSCORED = 0;

// Cap the number of tags returned to keep output focused
const MAX_TAGS = 20;

// Recency decay: entries from HALF_LIFE years ago get ~50% weight
const DECAY_HALF_LIFE_YEARS = 3;
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_YEARS;

// Bayesian smoothing: pull sparse observations toward a neutral prior
const BAYESIAN_PRIOR_WEIGHT = 0.5;
const BAYESIAN_PRIOR_COUNT = 3;

// === Profile Builder ===

/** Build a taste profile from scored list entries */
export function buildTasteProfile(
  entries: AniListMediaListEntry[],
): TasteProfile {
  // Filter out unscored entries (score 0 means the user didn't rate it)
  const scored = entries.filter((e) => e.score !== UNSCORED);

  if (scored.length < MIN_ENTRIES) {
    return emptyProfile(entries.length);
  }

  const genres = computeGenreWeights(scored);
  const tags = computeTagWeights(scored);
  const scoring = computeScoringPattern(scored);
  // Format breakdown uses all entries, not just scored ones
  const formats = computeFormatBreakdown(entries);

  return {
    genres,
    tags,
    scoring,
    formats,
    totalCompleted: entries.length,
  };
}

/** Summarize a taste profile as natural language */
export function describeTasteProfile(
  profile: TasteProfile,
  username: string,
): string {
  if (profile.genres.length === 0) {
    return (
      `${username} has completed ${profile.totalCompleted} titles, ` +
      `but not enough have scores to build a taste profile. ` +
      `Score more titles on AniList for a detailed breakdown.`
    );
  }

  const lines: string[] = [];

  // Top genres
  const topGenres = profile.genres
    .slice(0, 5)
    .map((g) => g.name)
    .join(", ");
  lines.push(`Top genres: ${topGenres}.`);

  // Top tags (themes)
  if (profile.tags.length > 0) {
    const topTags = profile.tags
      .slice(0, 5)
      .map((t) => t.name)
      .join(", ");
    lines.push(`Strongest themes: ${topTags}.`);
  }

  // Scoring tendency
  const { scoring } = profile;
  const tendencyDesc =
    scoring.tendency === "generous"
      ? `Scores generously (avg ${scoring.meanScore.toFixed(1)} vs site avg ${SITE_MEAN})`
      : scoring.tendency === "harsh"
        ? `Scores harshly (avg ${scoring.meanScore.toFixed(1)} vs site avg ${SITE_MEAN})`
        : `Scores close to average (avg ${scoring.meanScore.toFixed(1)})`;
  lines.push(`${tendencyDesc} across ${scoring.totalScored} rated titles.`);

  // Format preferences
  if (profile.formats.length > 0) {
    const fmtParts = profile.formats
      .slice(0, 3)
      .map((f) => `${f.format} ${f.percent}%`);
    lines.push(`Format split: ${fmtParts.join(", ")}.`);
  }

  lines.push(`Total completed: ${profile.totalCompleted}.`);

  return lines.join("\n");
}

// === Weighting Algorithms ===

/** Weight genres by how much the user liked shows in that genre */
function computeGenreWeights(entries: AniListMediaListEntry[]): WeightedItem[] {
  const genreMap = new Map<string, { weight: number; count: number }>();

  for (const entry of entries) {
    // Higher-scored and more recent shows contribute more
    const scoreWeight = (entry.score / 10) * computeDecay(entry);

    for (const genre of entry.media.genres) {
      const existing = genreMap.get(genre) ?? { weight: 0, count: 0 };
      existing.weight += scoreWeight;
      existing.count += 1;
      genreMap.set(genre, existing);
    }
  }

  return mapToSortedItems(genreMap);
}

/** Weight tags by user score multiplied by tag relevance */
function computeTagWeights(entries: AniListMediaListEntry[]): WeightedItem[] {
  const tagMap = new Map<string, { weight: number; count: number }>();

  for (const entry of entries) {
    const scoreWeight = (entry.score / 10) * computeDecay(entry);

    for (const tag of entry.media.tags) {
      if (tag.isMediaSpoiler) continue;

      // Tag rank (0-100) indicates how relevant the tag is to this media
      const relevance = tag.rank / 100;
      const existing = tagMap.get(tag.name) ?? { weight: 0, count: 0 };
      existing.weight += scoreWeight * relevance;
      existing.count += 1;
      tagMap.set(tag.name, existing);
    }
  }

  return mapToSortedItems(tagMap).slice(0, MAX_TAGS);
}

/** Score distribution and tendency classification */
function computeScoringPattern(
  entries: AniListMediaListEntry[],
): ScoringPattern {
  const scores = entries.map((e) => e.score);
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Middle value of sorted scores (average of two middle values if even count)
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // Build histogram: count of each score value (1-10)
  const distribution: Record<number, number> = {};
  for (const s of scores) {
    distribution[s] = (distribution[s] ?? 0) + 1;
  }

  // Classify based on distance from site average (7.0)
  const tendency: ScoringPattern["tendency"] =
    mean >= SITE_MEAN + 0.5
      ? "generous"
      : mean <= SITE_MEAN - 0.5
        ? "harsh"
        : "average";

  return {
    meanScore: mean,
    median,
    totalScored: scores.length,
    distribution,
    tendency,
  };
}

/** Format preferences as percentages */
function computeFormatBreakdown(
  entries: AniListMediaListEntry[],
): FormatBreakdown[] {
  const counts = new Map<string, number>();

  // Count entries per format (TV, MOVIE, OVA, etc.)
  for (const entry of entries) {
    const format = entry.media.format ?? "UNKNOWN";
    counts.set(format, (counts.get(format) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([format, count]) => ({
      format,
      count,
      percent: Math.round((count / entries.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

// === Helpers ===

/** Convert a name->weight Map into a Bayesian-smoothed sorted array */
function mapToSortedItems(
  map: Map<string, { weight: number; count: number }>,
): WeightedItem[] {
  return [...map.entries()]
    .map(([name, { weight, count }]) => ({
      name,
      // Pull sparse observations toward a neutral prior
      weight:
        (weight + BAYESIAN_PRIOR_WEIGHT * BAYESIAN_PRIOR_COUNT) /
        (count + BAYESIAN_PRIOR_COUNT),
      count,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Recency multiplier (0-1) - recent entries weigh more than old ones */
function computeDecay(entry: AniListMediaListEntry): number {
  const now = Date.now() / 1000;
  const completedEpoch = dateToEpoch(entry.completedAt);
  const epoch = completedEpoch ?? entry.updatedAt;
  if (!epoch) return 1;
  const yearsSince = (now - epoch) / (365.25 * 24 * 3600);
  return Math.exp(-DECAY_LAMBDA * Math.max(0, yearsSince));
}

/** Detailed profile breakdown: genre weights, top themes, score distribution */
export function formatTasteProfileText(profile: TasteProfile): string[] {
  const lines: string[] = [];

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

  return lines;
}

/** Empty profile for users with too few scored entries */
function emptyProfile(totalCompleted: number): TasteProfile {
  return {
    genres: [],
    tags: [],
    scoring: {
      meanScore: 0,
      median: 0,
      totalScored: 0,
      distribution: {},
      tendency: "average",
    },
    formats: [],
    totalCompleted,
  };
}

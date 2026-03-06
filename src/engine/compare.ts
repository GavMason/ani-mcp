/** User comparison: compatibility scoring, genre divergences, cross-recommendations */

import type { TasteProfile } from "./taste.js";
import type { AniListMediaListEntry } from "../types.js";
import { getTitle } from "../utils.js";

// === Types ===

export interface SharedTitle {
  title: string;
  score1: number;
  score2: number;
  id: number;
}

// === Compatibility ===

/** Pearson-ish compatibility score (0-100) from shared title scores */
export function computeCompatibility(
  shared: Array<{ score1: number; score2: number }>,
): number {
  // Filter to entries where both users actually scored
  const scored = shared.filter((s) => s.score1 > 0 && s.score2 > 0);
  if (scored.length < 3) return 0;

  const mean1 = scored.reduce((s, e) => s + e.score1, 0) / scored.length;
  const mean2 = scored.reduce((s, e) => s + e.score2, 0) / scored.length;

  // Pearson correlation coefficient
  let numerator = 0;
  let denom1 = 0;
  let denom2 = 0;

  for (const s of scored) {
    const d1 = s.score1 - mean1;
    const d2 = s.score2 - mean2;
    numerator += d1 * d2;
    denom1 += d1 * d1;
    denom2 += d2 * d2;
  }

  const denom = Math.sqrt(denom1 * denom2);
  // Identical scores - neutral 50%
  if (denom === 0) return 50;

  // Pearson r ranges from -1 to 1; map to 0-100
  const r = numerator / denom;
  return Math.round(((r + 1) / 2) * 100);
}

// === Genre Divergences ===

/** Find genre preference differences between two profiles */
export function computeGenreDivergences(
  p1: TasteProfile,
  p2: TasteProfile,
  name1 = "User 1",
  name2 = "User 2",
): string[] {
  const genres1 = new Map(p1.genres.map((g) => [g.name, g]));
  const genres2 = new Map(p2.genres.map((g) => [g.name, g]));

  const allGenres = new Set([...genres1.keys(), ...genres2.keys()]);
  const divergences: Array<{ genre: string; diff: number; desc: string }> = [];

  // Pre-compute rank maps for O(1) lookup
  const rankOf1 = new Map([...genres1.keys()].map((g, i) => [g, i]));
  const rankOf2 = new Map([...genres2.keys()].map((g, i) => [g, i]));

  // Flag genres in one user's top 5 but not the other's top 10
  for (const genre of allGenres) {
    const rank1 = rankOf1.get(genre) ?? -1;
    const rank2 = rankOf2.get(genre) ?? -1;

    if (rank1 >= 0 && rank1 < 5 && (rank2 === -1 || rank2 > 10)) {
      divergences.push({
        genre,
        diff: 10,
        desc: `${name1} loves ${genre}, ${name2} doesn't`,
      });
    } else if (rank2 >= 0 && rank2 < 5 && (rank1 === -1 || rank1 > 10)) {
      divergences.push({
        genre,
        diff: 10,
        desc: `${name2} loves ${genre}, ${name1} doesn't`,
      });
    }
  }

  return divergences.slice(0, 5).map((d) => d.desc);
}

// === Cross-Recommendations ===

/** Find titles one user rated 8+ that the other hasn't seen */
export function findCrossRecs(
  sourceEntries: AniListMediaListEntry[],
  targetEntries: AniListMediaListEntry[],
  sourceUsername: string,
): string[] {
  const targetIds = new Set(targetEntries.map((e) => e.media.id));

  // 8+ titles the other user hasn't seen
  return sourceEntries
    .filter((e) => e.score >= 8 && !targetIds.has(e.media.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((e) => {
      const title = getTitle(e.media.title);
      return `${title} (${sourceUsername} rated ${e.score}/10)`;
    });
}

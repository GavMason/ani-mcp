/** Ranks candidates by content similarity to a source title */

import type { AniListMedia } from "../types.js";
import {
  SIMILAR_GENRE_WEIGHT as GENRE_WEIGHT,
  SIMILAR_TAG_WEIGHT as TAG_WEIGHT,
  SIMILAR_REC_WEIGHT as REC_WEIGHT,
} from "../constants.js";

// === Types ===

export interface SimilarResult {
  media: AniListMedia;
  similarityScore: number;
  reasons: string[];
}

// Non-spoiler tag names from a media entry
function tagNames(media: AniListMedia): Set<string> {
  return new Set(
    media.tags.filter((t) => !t.isMediaSpoiler).map((t) => t.name),
  );
}

// === Similarity Engine ===

/** Rank candidates by genre/tag overlap and community recommendation strength */
export function rankSimilar(
  source: AniListMedia,
  candidates: AniListMedia[],
  recRatings: Map<number, number>,
): SimilarResult[] {
  if (candidates.length === 0) return [];

  // Normalize rec ratings to 0-1
  const maxRating = Math.max(1, ...recRatings.values());

  const sourceGenres = new Set(source.genres);
  const sourceTags = tagNames(source);

  const results: SimilarResult[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];

    // Genre overlap: Jaccard coefficient
    const candidateGenres = new Set(candidate.genres);
    const genreIntersection = [...sourceGenres].filter((g) =>
      candidateGenres.has(g),
    );
    const genreUnion = new Set([...sourceGenres, ...candidateGenres]);
    const genreOverlap =
      genreUnion.size > 0 ? genreIntersection.length / genreUnion.size : 0;

    if (genreIntersection.length > 0) {
      reasons.push(`Shares genres: ${genreIntersection.join(", ")}`);
    }

    // Tag overlap: Jaccard on non-spoiler tags
    const candidateTags = tagNames(candidate);
    const tagIntersection = [...sourceTags].filter((t) => candidateTags.has(t));
    const tagUnion = new Set([...sourceTags, ...candidateTags]);
    const tagOverlap =
      tagUnion.size > 0 ? tagIntersection.length / tagUnion.size : 0;

    if (tagIntersection.length > 0) {
      reasons.push(`Similar themes: ${tagIntersection.slice(0, 3).join(", ")}`);
    }

    // Community recommendation rating
    const rating = recRatings.get(candidate.id) ?? 0;
    const recBoost = rating > 0 ? rating / maxRating : 0;

    if (rating > 0) {
      reasons.push(`Recommended by community (+${rating})`);
    }

    const score =
      genreOverlap * GENRE_WEIGHT +
      tagOverlap * TAG_WEIGHT +
      recBoost * REC_WEIGHT;

    results.push({
      media: candidate,
      similarityScore: Math.round(Math.min(1, score) * 100),
      reasons,
    });
  }

  return results.sort((a, b) => b.similarityScore - a.similarityScore);
}

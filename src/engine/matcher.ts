/** Scores candidate media against a taste profile with natural-language explanations */

import type { AniListMedia } from "../types.js";
import type { TasteProfile, WeightedItem } from "./taste.js";
import type { MoodModifiers } from "./mood.js";
import {
  MATCHER_GENRE_WEIGHT as GENRE_WEIGHT,
  MATCHER_TAG_WEIGHT as TAG_WEIGHT,
  MATCHER_COMMUNITY_WEIGHT as COMMUNITY_WEIGHT,
  MOOD_BOOST,
  MOOD_PENALTY,
  MIN_COMMUNITY_SCORE,
  POPULARITY_PENALTY_MAX,
  POPULARITY_CEILING,
} from "../constants.js";

// === Types ===

export interface MatchResult {
  media: AniListMedia;
  score: number;
  reasons: string[];
  moodFit: string | null;
}

export interface ScoreBreakdown {
  genreScore: number;
  tagScore: number;
  communityScore: number;
  popularityFactor: number;
  moodMultiplier: number;
  finalScore: number;
}

export interface ExplainResult {
  media: AniListMedia;
  breakdown: ScoreBreakdown;
  matchedGenres: string[];
  unmatchedGenres: string[];
  matchedTags: string[];
  unmatchedTags: string[];
  reasons: string[];
  moodFit: string | null;
}

// === Matcher ===

/** Score and rank candidates against a user's taste profile */
export function matchCandidates(
  candidates: AniListMedia[],
  profile: TasteProfile,
  mood?: MoodModifiers,
): MatchResult[] {
  // Build lookup maps for O(1) access during scoring
  const genreWeights = toWeightMap(profile.genres);
  const tagWeights = toWeightMap(profile.tags);

  // Find max weights for normalization
  const maxGenreWeight = profile.genres[0]?.weight ?? 1;
  const maxTagWeight = profile.tags[0]?.weight ?? 1;

  const results: MatchResult[] = [];

  for (const media of candidates) {
    // Skip titles with very low community scores
    if (media.meanScore !== null && media.meanScore < MIN_COMMUNITY_SCORE) {
      continue;
    }

    const reasons: string[] = [];

    // Genre affinity: sum of user's genre weights for this title's genres
    const genreScore = computeGenreAffinity(
      media,
      genreWeights,
      maxGenreWeight,
      reasons,
    );

    // Tag affinity: sum of user's tag weights for this title's tags
    const tagScore = computeTagAffinity(
      media,
      tagWeights,
      maxTagWeight,
      reasons,
    );

    // Fall back to 70 for unrated titles so they aren't penalized or boosted
    const communityScore = (media.meanScore ?? 70) / 100;

    // Weighted combination
    let finalScore =
      genreScore * GENRE_WEIGHT +
      tagScore * TAG_WEIGHT +
      communityScore * COMMUNITY_WEIGHT;

    // Nudge niche titles up by penalizing blockbusters slightly
    finalScore *= popularityDiversityFactor(media.popularity);

    // Apply mood modifiers
    const moodFit = mood ? applyMood(media, mood, reasons) : null;
    if (moodFit === "boost") finalScore *= MOOD_BOOST;
    if (moodFit === "penalty") finalScore *= MOOD_PENALTY;

    results.push({
      media,
      score: finalScore,
      reasons,
      moodFit: moodFit
        ? moodFit === "boost"
          ? "Strong mood match"
          : "Weak mood fit"
        : null,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// === Scoring Components ===

/** How well a title's genres align with the user's genre preferences */
function computeGenreAffinity(
  media: AniListMedia,
  genreWeights: Map<string, number>,
  maxWeight: number,
  reasons: string[],
): number {
  if (media.genres.length === 0) return 0;

  let total = 0;
  const matchedGenres: string[] = [];

  // Accumulate user's preference weight for each matching genre
  for (const genre of media.genres) {
    const weight = genreWeights.get(genre);
    if (weight !== undefined) {
      total += weight;
      matchedGenres.push(genre);
    }
  }

  // Cap divisor at 3 so titles with many genres aren't unfairly diluted
  const normalized = total / (maxWeight * Math.min(media.genres.length, 3));

  if (matchedGenres.length > 0) {
    reasons.push(`Matches your taste in ${matchedGenres.join(", ")}`);
  }

  return Math.min(1, normalized);
}

/** How well a title's tags align with the user's tag preferences */
function computeTagAffinity(
  media: AniListMedia,
  tagWeights: Map<string, number>,
  maxWeight: number,
  reasons: string[],
): number {
  const nonSpoilerTags = media.tags.filter((t) => !t.isMediaSpoiler);
  if (nonSpoilerTags.length === 0) return 0;

  let total = 0;
  const matchedTags: string[] = [];

  for (const tag of nonSpoilerTags) {
    const weight = tagWeights.get(tag.name);
    if (weight !== undefined) {
      // Scale by tag relevance
      total += weight * (tag.rank / 100);
      matchedTags.push(tag.name);
    }
  }

  // Cap divisor so titles with many tags aren't unfairly diluted
  const normalized = total / (maxWeight * Math.min(nonSpoilerTags.length, 5));

  if (matchedTags.length >= 2) {
    reasons.push(`Themes you enjoy: ${matchedTags.slice(0, 3).join(", ")}`);
  }

  return Math.min(1, normalized);
}

/** Log-scale diversity factor: negligible for niche titles, up to 15% for blockbusters */
function popularityDiversityFactor(popularity: number | null): number {
  if (!popularity || popularity <= 0) return 1;
  const normalized = Math.min(
    1,
    Math.log10(popularity) / Math.log10(POPULARITY_CEILING),
  );
  return 1 - POPULARITY_PENALTY_MAX * normalized;
}

/** Apply mood boost/penalty based on genre and tag overlap */
function applyMood(
  media: AniListMedia,
  mood: MoodModifiers,
  reasons: string[],
): "boost" | "penalty" | null {
  let boostCount = 0;
  let penaltyCount = 0;

  // Count mood matches across genres and tags
  for (const genre of media.genres) {
    if (mood.boostGenres.has(genre)) boostCount++;
    if (mood.penalizeGenres.has(genre)) penaltyCount++;
  }

  for (const tag of media.tags) {
    if (tag.isMediaSpoiler) continue;
    if (mood.boostTags.has(tag.name)) boostCount++;
    if (mood.penalizeTags.has(tag.name)) penaltyCount++;
  }

  // Boost wins if it has more matches, penalty if it dominates
  if (boostCount >= 2 && boostCount > penaltyCount) {
    reasons.push("Fits the mood you described");
    return "boost";
  }
  if (penaltyCount >= 2 && penaltyCount > boostCount) {
    return "penalty";
  }

  return null;
}

// === Single-Title Explain ===

/** Score a single title against a taste profile with a detailed breakdown */
export function explainMatch(
  media: AniListMedia,
  profile: TasteProfile,
  mood?: MoodModifiers,
): ExplainResult {
  const genreWeights = toWeightMap(profile.genres);
  const tagWeights = toWeightMap(profile.tags);
  const maxGenreWeight = profile.genres[0]?.weight ?? 1;
  const maxTagWeight = profile.tags[0]?.weight ?? 1;

  const reasons: string[] = [];

  // Genre affinity with matched/unmatched tracking
  const genreScore = computeGenreAffinity(
    media,
    genreWeights,
    maxGenreWeight,
    reasons,
  );
  const matchedGenres = media.genres.filter((g) => genreWeights.has(g));
  const unmatchedGenres = media.genres.filter((g) => !genreWeights.has(g));

  // Tag affinity with matched/unmatched tracking
  const tagScore = computeTagAffinity(media, tagWeights, maxTagWeight, reasons);
  const nonSpoilerTags = media.tags.filter((t) => !t.isMediaSpoiler);
  const matchedTags = nonSpoilerTags
    .filter((t) => tagWeights.has(t.name))
    .map((t) => t.name);
  const unmatchedTags = nonSpoilerTags
    .filter((t) => !tagWeights.has(t.name))
    .map((t) => t.name);

  const communityScore = (media.meanScore ?? 70) / 100;
  const popFactor = popularityDiversityFactor(media.popularity);

  let finalScore =
    genreScore * GENRE_WEIGHT +
    tagScore * TAG_WEIGHT +
    communityScore * COMMUNITY_WEIGHT;
  finalScore *= popFactor;

  // Mood modifier
  let moodMultiplier = 1;
  const moodFit = mood ? applyMood(media, mood, reasons) : null;
  if (moodFit === "boost") {
    moodMultiplier = MOOD_BOOST;
    finalScore *= MOOD_BOOST;
  }
  if (moodFit === "penalty") {
    moodMultiplier = MOOD_PENALTY;
    finalScore *= MOOD_PENALTY;
  }

  return {
    media,
    breakdown: {
      genreScore,
      tagScore,
      communityScore,
      popularityFactor: popFactor,
      moodMultiplier,
      // Scale 0-1 to 0-100
      finalScore: Math.round(Math.min(1, finalScore) * 100),
    },
    matchedGenres,
    unmatchedGenres,
    matchedTags,
    unmatchedTags,
    reasons,
    moodFit: moodFit
      ? moodFit === "boost"
        ? "Strong mood match"
        : "Weak mood fit"
      : null,
  };
}

// === Helpers ===

/** Convert WeightedItem[] to a Map for fast lookup */
function toWeightMap(items: WeightedItem[]): Map<string, number> {
  return new Map(items.map((i) => [i.name, i.weight]));
}

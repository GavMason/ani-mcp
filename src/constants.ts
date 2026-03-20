/** Tuning constants used across multiple engine modules */

// === Undo ===

// Max undo records kept in the session stack
export const MAX_UNDO = 20;

// === Taste Profile ===

// Max tags returned in a taste profile to keep output focused
export const MAX_TAGS = 20;

// Tags must appear in at least this many entries to rank
export const MIN_TAG_COUNT = 3;

// Bayesian smoothing: pull sparse genre/tag observations toward neutral
// prior_weight blends prior with observed; prior_count is the pseudocount threshold
export const BAYESIAN_PRIOR_WEIGHT = 0.5;
export const BAYESIAN_PRIOR_COUNT = 3;

// === Franchise ===

// Max BFS depth to prevent runaway traversal on deeply linked franchises
export const MAX_DEPTH = 30;

// === Card Dimensions ===

// 800x560 fits social media previews (roughly 10:7 aspect ratio)
export const CARD_WIDTH = 800;
export const CARD_HEIGHT = 560;
export const COMPAT_CARD_HEIGHT = 640;

// === Matcher Weights ===

// Personal taste matcher (anilist_pick, anilist_explain):
// genre dominates because users identify most strongly with genre preferences,
// tags refine within genre, community score guards against niche low-quality titles
export const MATCHER_GENRE_WEIGHT = 0.5;
export const MATCHER_TAG_WEIGHT = 0.3;
export const MATCHER_COMMUNITY_WEIGHT = 0.2;

// Mood boost/penalty as a multiplier on the final score
export const MOOD_BOOST = 1.3;
export const MOOD_PENALTY = 0.6;

// Minimum community score (out of 100) to avoid poorly-rated titles
export const MIN_COMMUNITY_SCORE = 50;

// Diversity nudge: log-scale penalty for very popular titles (max 15%)
export const POPULARITY_PENALTY_MAX = 0.15;
export const POPULARITY_CEILING = 100_000;

// === Similar Weights ===

// Content similarity matcher (anilist_similar):
// genre and tag overlap are equally important for content matching,
// community recs provide a collaborative-filtering signal as a tiebreaker
export const SIMILAR_GENRE_WEIGHT = 0.4;
export const SIMILAR_TAG_WEIGHT = 0.3;
export const SIMILAR_REC_WEIGHT = 0.3;

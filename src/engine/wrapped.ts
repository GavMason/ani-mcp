/** Year-in-review stats computation shared by text and card tools */

import type { AniListMediaListEntry } from "../types.js";

// User scores are 1-10, community meanScore is 0-100
const USER_SCORE_SCALE = 10;

/** Computed year-in-review stats */
export interface WrappedStats {
  year: number;
  animeCount: number;
  mangaCount: number;
  totalEpisodes: number;
  totalChapters: number;
  avgScore: number;
  scoredCount: number;
  topRated: { title: string; score: number; coverUrl: string | null } | null;
  controversial: {
    title: string;
    userScore: number;
    communityScore: number;
    gap: number;
    direction: "above" | "below";
    coverUrl: string | null;
  } | null;
  topGenres: Array<{ name: string; count: number }>;
  scoreDistribution: Record<number, number>;
}

/** Get a display title from a media title object */
function getDisplayTitle(title: {
  romaji: string | null;
  english: string | null;
}): string {
  return title.english ?? title.romaji ?? "Unknown";
}

/** Compute year-in-review stats from completed entries */
export function computeWrappedStats(
  entries: AniListMediaListEntry[],
  year: number,
): WrappedStats {
  const anime = entries.filter((e) => e.media.type === "ANIME");
  const manga = entries.filter((e) => e.media.type === "MANGA");

  // Scoring
  const scored = entries.filter((e) => e.score > 0);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length
      : 0;

  // Top rated
  let topRated: WrappedStats["topRated"] = null;
  if (scored.length > 0) {
    const top = [...scored].sort((a, b) => b.score - a.score)[0];
    topRated = {
      title: getDisplayTitle(top.media.title),
      score: top.score,
      coverUrl: top.media.coverImage.extraLarge,
    };
  }

  // Most controversial
  let controversial: WrappedStats["controversial"] = null;
  const withCommunity = scored
    .filter((e) => e.media.meanScore !== null)
    .map((e) => ({
      entry: e,
      gap: Math.abs(e.score * USER_SCORE_SCALE - (e.media.meanScore ?? 0)),
    }))
    .sort((a, b) => b.gap - a.gap);

  if (withCommunity.length > 0 && withCommunity[0].gap >= 20) {
    const c = withCommunity[0].entry;
    const cs = c.media.meanScore ?? 0;
    controversial = {
      title: getDisplayTitle(c.media.title),
      userScore: c.score,
      communityScore: cs,
      gap: withCommunity[0].gap,
      direction: c.score * USER_SCORE_SCALE > cs ? "above" : "below",
      coverUrl: c.media.coverImage.extraLarge,
    };
  }

  // Genre breakdown
  const genreCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const genre of entry.media.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Consumption
  const totalEpisodes = anime.reduce(
    (sum, e) => sum + (e.media.episodes ?? e.progress ?? 0),
    0,
  );
  const totalChapters = manga.reduce(
    (sum, e) => sum + (e.media.chapters ?? e.progress ?? 0),
    0,
  );

  // Score distribution
  const scoreDistribution: Record<number, number> = {};
  for (const e of scored) {
    scoreDistribution[e.score] = (scoreDistribution[e.score] ?? 0) + 1;
  }

  return {
    year,
    animeCount: anime.length,
    mangaCount: manga.length,
    totalEpisodes,
    totalChapters,
    avgScore,
    scoredCount: scored.length,
    topRated,
    controversial,
    topGenres,
    scoreDistribution,
  };
}

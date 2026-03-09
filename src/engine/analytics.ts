/** Analytics engine: scoring calibration, drop patterns, and genre evolution. */

import type { AniListMediaListEntry } from "../types.js";

// === Types ===

export interface GenreCalibration {
  genre: string;
  userMean: number;
  communityMean: number;
  delta: number;
  count: number;
}

export interface CalibrationResult {
  overallDelta: number;
  tendency: "high" | "low" | "balanced";
  genreCalibrations: GenreCalibration[];
  totalScored: number;
}

export interface DropCluster {
  label: string;
  type: "genre" | "tag";
  dropCount: number;
  totalCount: number;
  dropRate: number;
  medianDropPoint: number;
}

export interface DropAnalysis {
  totalDropped: number;
  clusters: DropCluster[];
  earlyDrops: number;
  avgDropProgress: number;
}

export interface GenreEra {
  period: string;
  startYear: number;
  endYear: number;
  topGenres: string[];
  count: number;
}

export interface EvolutionResult {
  eras: GenreEra[];
  shifts: string[];
}

// === Constants ===

// Min entries per genre for meaningful calibration
const MIN_GENRE_ENTRIES = 3;

// Min drops in a cluster to report
const MIN_CLUSTER_DROPS = 3;

// Max tag clusters to report
const MAX_TAG_CLUSTERS = 10;

// === Score Calibration ===

/** Per-genre scoring bias relative to community consensus */
export function computeCalibration(
  entries: AniListMediaListEntry[],
): CalibrationResult {
  // Filter to scored entries with community scores
  const scored = entries.filter(
    (e) => e.score > 0 && e.media.meanScore != null && e.media.meanScore > 0,
  );

  if (scored.length === 0) {
    return {
      overallDelta: 0,
      tendency: "balanced",
      genreCalibrations: [],
      totalScored: 0,
    };
  }

  // Overall delta: user mean - community mean (on 1-10 scale)
  let userSum = 0;
  let communitySum = 0;
  for (const e of scored) {
    userSum += e.score;
    communitySum += (e.media.meanScore ?? 0) / 10;
  }
  const overallDelta = userSum / scored.length - communitySum / scored.length;

  // Per-genre calibration
  const genreMap = new Map<
    string,
    { userScores: number[]; communityScores: number[] }
  >();

  for (const e of scored) {
    const community = (e.media.meanScore ?? 0) / 10;
    for (const genre of e.media.genres) {
      let bucket = genreMap.get(genre);
      if (!bucket) {
        bucket = { userScores: [], communityScores: [] };
        genreMap.set(genre, bucket);
      }
      bucket.userScores.push(e.score);
      bucket.communityScores.push(community);
    }
  }

  const genreCalibrations: GenreCalibration[] = [];
  for (const [genre, bucket] of genreMap) {
    if (bucket.userScores.length < MIN_GENRE_ENTRIES) continue;
    const userMean = mean(bucket.userScores);
    const communityMean = mean(bucket.communityScores);
    genreCalibrations.push({
      genre,
      userMean,
      communityMean,
      delta: userMean - communityMean,
      count: bucket.userScores.length,
    });
  }

  // Sort by absolute delta descending
  genreCalibrations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const tendency =
    overallDelta >= 0.5
      ? "high"
      : overallDelta <= -0.5
        ? "low"
        : "balanced";

  return {
    overallDelta,
    tendency,
    genreCalibrations,
    totalScored: scored.length,
  };
}

// === Drop Pattern Analysis ===

/** Genre and tag clusters in a user's dropped titles */
export function analyzeDrops(
  droppedEntries: AniListMediaListEntry[],
  allEntries: AniListMediaListEntry[],
): DropAnalysis {
  if (droppedEntries.length === 0) {
    return { totalDropped: 0, clusters: [], earlyDrops: 0, avgDropProgress: 0 };
  }

  // Count total entries per genre/tag across all statuses
  const genreTotals = new Map<string, number>();
  const tagTotals = new Map<string, number>();
  for (const e of allEntries) {
    for (const g of e.media.genres) {
      genreTotals.set(g, (genreTotals.get(g) ?? 0) + 1);
    }
    for (const t of e.media.tags) {
      if (!t.isMediaSpoiler) {
        tagTotals.set(t.name, (tagTotals.get(t.name) ?? 0) + 1);
      }
    }
  }

  // Genre drop counts and progress at drop
  const genreDrops = new Map<string, number[]>();
  const tagDrops = new Map<string, number[]>();
  let earlyDrops = 0;
  let totalProgress = 0;
  let progressCount = 0;

  for (const e of droppedEntries) {
    const total = e.media.episodes ?? e.media.chapters ?? 0;
    const progressPct = total > 0 ? e.progress / total : 0;

    if (total > 0 && progressPct < 0.25) earlyDrops++;
    if (total > 0) {
      totalProgress += progressPct;
      progressCount++;
    }

    for (const g of e.media.genres) {
      let arr = genreDrops.get(g);
      if (!arr) {
        arr = [];
        genreDrops.set(g, arr);
      }
      if (total > 0) arr.push(progressPct);
      else arr.push(-1); // unknown progress
    }

    for (const t of e.media.tags) {
      if (t.isMediaSpoiler) continue;
      let arr = tagDrops.get(t.name);
      if (!arr) {
        arr = [];
        tagDrops.set(t.name, arr);
      }
      if (total > 0) arr.push(progressPct);
      else arr.push(-1);
    }
  }

  const clusters: DropCluster[] = [];

  // Genre clusters
  for (const [genre, progresses] of genreDrops) {
    if (progresses.length < MIN_CLUSTER_DROPS) continue;
    const total = genreTotals.get(genre) ?? progresses.length;
    const known = progresses.filter((p) => p >= 0);
    clusters.push({
      label: genre,
      type: "genre",
      dropCount: progresses.length,
      totalCount: total,
      dropRate: progresses.length / total,
      medianDropPoint: known.length > 0 ? median(known) : 0,
    });
  }

  // Tag clusters
  for (const [tag, progresses] of tagDrops) {
    if (progresses.length < MIN_CLUSTER_DROPS) continue;
    const total = tagTotals.get(tag) ?? progresses.length;
    const known = progresses.filter((p) => p >= 0);
    clusters.push({
      label: tag,
      type: "tag",
      dropCount: progresses.length,
      totalCount: total,
      dropRate: progresses.length / total,
      medianDropPoint: known.length > 0 ? median(known) : 0,
    });
  }

  // Sort by drop rate descending, cap tag clusters
  clusters.sort((a, b) => b.dropRate - a.dropRate);

  // Keep all genre clusters, cap tags
  const genreClusters = clusters.filter((c) => c.type === "genre");
  const tagClusters = clusters
    .filter((c) => c.type === "tag")
    .slice(0, MAX_TAG_CLUSTERS);
  const merged = [...genreClusters, ...tagClusters].sort(
    (a, b) => b.dropRate - a.dropRate,
  );

  return {
    totalDropped: droppedEntries.length,
    clusters: merged,
    earlyDrops,
    avgDropProgress: progressCount > 0 ? totalProgress / progressCount : 0,
  };
}

// === Genre Evolution ===

/** How genre preferences shifted across time windows */
export function computeGenreEvolution(
  entries: AniListMediaListEntry[],
  windowYears = 2,
): EvolutionResult {
  // Filter to entries with valid completion dates
  const dated = entries.filter((e) => e.completedAt.year != null);

  if (dated.length === 0) {
    return { eras: [], shifts: [] };
  }

  // Find date range
  const years = dated.map((e) => e.completedAt.year as number);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const span = maxYear - minYear + 1;

  // Use 1-year windows if span is narrow
  const winSize = span < 4 ? 1 : windowYears;

  // Build windows
  const windows: Array<{ start: number; end: number }> = [];
  let start = minYear;
  while (start <= maxYear) {
    const end = Math.min(start + winSize - 1, maxYear);
    windows.push({ start, end });
    start = end + 1;
  }

  const eras: GenreEra[] = [];

  for (const win of windows) {
    const windowEntries = dated.filter((e) => {
      const y = e.completedAt.year as number;
      return y >= win.start && y <= win.end;
    });

    if (windowEntries.length === 0) continue;

    // Count genres
    const genreCounts = new Map<string, number>();
    for (const e of windowEntries) {
      for (const g of e.media.genres) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }

    // Top 5 genres by count
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);

    const period =
      win.start === win.end ? `${win.start}` : `${win.start}-${win.end}`;

    eras.push({
      period,
      startYear: win.start,
      endYear: win.end,
      topGenres,
      count: windowEntries.length,
    });
  }

  // Generate shift descriptions
  const shifts: string[] = [];
  for (let i = 1; i < eras.length; i++) {
    const prev = eras[i - 1];
    const curr = eras[i];

    // Genres that appeared in current top 5 but not previous
    const risen = curr.topGenres.filter((g) => !prev.topGenres.includes(g));
    const dropped = prev.topGenres.filter((g) => !curr.topGenres.includes(g));

    if (risen.length > 0) {
      shifts.push(`${curr.period}: ${risen.join(", ")} rose into top genres`);
    }
    if (dropped.length > 0) {
      shifts.push(
        `${curr.period}: ${dropped.join(", ")} dropped out of top genres`,
      );
    }
  }

  return { eras, shifts };
}

// === Helpers ===

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

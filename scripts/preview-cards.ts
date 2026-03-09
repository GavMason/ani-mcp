/** Generate sample card PNGs for visual inspection (fetches real cover art) */

import { writeFileSync, mkdirSync } from "fs";
import {
  buildTasteCardSvg,
  buildCompatCardSvg,
  buildWrappedCardSvg,
  buildSeasonalRecapCardSvg,
  svgToPng,
  fetchAvatarB64,
  type CompatCardData,
  type WrappedCardData,
  type SeasonalRecapData,
} from "../src/engine/card.js";
import type { TasteProfile } from "../src/engine/taste.js";

function makeProfile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    genres: [
      { name: "Action", weight: 0.92, count: 58 },
      { name: "Drama", weight: 0.78, count: 41 },
      { name: "Comedy", weight: 0.65, count: 33 },
      { name: "Sci-Fi", weight: 0.55, count: 22 },
      { name: "Fantasy", weight: 0.48, count: 19 },
    ],
    tags: [
      { name: "Male Protagonist", weight: 0.7, count: 35 },
      { name: "Ensemble Cast", weight: 0.55, count: 20 },
      { name: "Shounen", weight: 0.5, count: 18 },
    ],
    themes: [
      { name: "Coming of Age", weight: 0.65, count: 24 },
      { name: "Revenge", weight: 0.52, count: 16 },
      { name: "Survival", weight: 0.45, count: 12 },
    ],
    scoring: {
      meanScore: 7.4,
      median: 7,
      totalScored: 142,
      distribution: { 4: 3, 5: 8, 6: 18, 7: 42, 8: 45, 9: 20, 10: 6 },
      tendency: "balanced",
    },
    formats: [
      { format: "TV", count: 95, percent: 58 },
      { format: "MOVIE", count: 35, percent: 21 },
      { format: "OVA", count: 20, percent: 12 },
      { format: "ONA", count: 14, percent: 9 },
    ],
    totalCompleted: 164,
    ...overrides,
  };
}

// Fetch cover art from AniList by media ID
async function fetchCover(mediaId: number): Promise<string | null> {
  const query = `query ($id: Int) { Media(id: $id) { coverImage { extraLarge } } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: mediaId } }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { Media?: { coverImage?: { extraLarge?: string } } } };
  const url = data.data?.Media?.coverImage?.extraLarge;
  return url ? fetchAvatarB64(url) : null;
}

async function main() {
  const dir = "preview";
  mkdirSync(dir, { recursive: true });

  const out = (name: string, buf: Buffer) => {
    writeFileSync(`${dir}/${name}.png`, buf);
    console.log(`wrote ${dir}/${name}.png (${(buf.length / 1024).toFixed(1)} KB)`);
  };

  console.log("Fetching cover art from AniList...");

  // Fetch covers in parallel
  // Frieren=154587, SAO=11757, Solo Leveling=151807, Apothecary=161645, Sakamoto=171018, Dr Stone=105333
  const [frierenCover, saoCover, soloCover, apothecCover, sakamotoCover, drstoneCover] =
    await Promise.all([
      fetchCover(154587),
      fetchCover(11757),
      fetchCover(151807),
      fetchCover(161645),
      fetchCover(171018),
      fetchCover(105333),
    ]);

  console.log("Generating cards...");

  // Taste card (no covers)
  const tasteSvg = buildTasteCardSvg("AnimeFan42", makeProfile());
  out("taste-card", await svgToPng(tasteSvg));

  // Compat card (no covers)
  const compatData: CompatCardData = {
    user1: "AnimeFan42",
    user2: "MangaLord",
    compatibility: 68,
    sharedCount: 37,
    sharedFavorites: [
      { title: "Steins;Gate", score1: 10, score2: 9 },
      { title: "Mob Psycho 100", score1: 9, score2: 9 },
      { title: "Vinland Saga", score1: 9, score2: 8 },
    ],
    divergences: [
      "AnimeFan42 loves Action, MangaLord prefers Romance",
      "MangaLord scores 1.2 points higher on average",
    ],
    profile1: makeProfile(),
    profile2: makeProfile({
      genres: [
        { name: "Romance", weight: 0.88, count: 52 },
        { name: "Slice of Life", weight: 0.75, count: 38 },
        { name: "Drama", weight: 0.7, count: 35 },
        { name: "Comedy", weight: 0.6, count: 28 },
        { name: "Fantasy", weight: 0.42, count: 15 },
      ],
      scoring: {
        meanScore: 8.1,
        median: 8,
        totalScored: 98,
        distribution: { 5: 2, 6: 5, 7: 18, 8: 38, 9: 28, 10: 7 },
        tendency: "high",
      },
    }),
  };
  out("compat-card", await svgToPng(buildCompatCardSvg(compatData)));

  // Wrapped card (with cover art)
  const wrappedData: WrappedCardData = {
    username: "AnimeFan42",
    avatarB64: null,
    topRatedCoverB64: frierenCover,
    controversialCoverB64: saoCover,
    stats: {
      year: 2025,
      animeCount: 34,
      mangaCount: 12,
      totalEpisodes: 412,
      totalChapters: 680,
      avgScore: 7.6,
      scoredCount: 40,
      topRated: { title: "Frieren: Beyond Journey's End", score: 10, coverUrl: null },
      controversial: {
        title: "Sword Art Online",
        userScore: 9,
        communityScore: 65,
        gap: 25,
        direction: "above",
        coverUrl: null,
      },
      topGenres: [
        { name: "Action", count: 22 },
        { name: "Fantasy", count: 18 },
        { name: "Drama", count: 15 },
        { name: "Sci-Fi", count: 10 },
        { name: "Comedy", count: 8 },
      ],
      scoreDistribution: { 5: 2, 6: 4, 7: 10, 8: 14, 9: 7, 10: 3 },
    },
  };
  out("wrapped-card", await svgToPng(buildWrappedCardSvg(wrappedData)));

  // Seasonal recap card (with cover art)
  const seasonalData: SeasonalRecapData = {
    username: "AnimeFan42",
    season: "WINTER",
    year: 2026,
    avatarB64: null,
    picked: 14,
    finished: 10,
    dropped: 3,
    watching: 1,
    avgScore: 7.9,
    topPicks: [
      { title: "Solo Leveling S2", score: 9, coverB64: soloCover },
      { title: "Apothecary Diaries S2", score: 9, coverB64: apothecCover },
      { title: "Sakamoto Days", score: 8, coverB64: sakamotoCover },
      { title: "Dr. Stone: Science Future", score: 8, coverB64: drstoneCover },
      { title: "UniteUp! S2", score: 7 },
    ],
  };
  out("seasonal-recap-card", await svgToPng(buildSeasonalRecapCardSvg(seasonalData)));

  console.log("\nDone!");
}

main().catch(console.error);

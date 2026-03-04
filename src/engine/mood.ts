/** Maps freeform mood strings to genre/tag boost and penalize rules */

// === Types ===

export interface MoodRule {
  boost: string[];
  penalize: string[];
}

export interface MoodModifiers {
  boostGenres: Set<string>;
  boostTags: Set<string>;
  penalizeGenres: Set<string>;
  penalizeTags: Set<string>;
}

// === Mood Keyword Rules ===

// Base mood rules keyed by canonical keyword
const BASE_MOOD_RULES: Record<string, MoodRule> = {
  dark: {
    boost: ["Psychological", "Thriller", "Horror", "Tragedy", "Drama"],
    penalize: ["Comedy", "Slice of Life"],
  },
  chill: {
    boost: ["Slice of Life", "Iyashikei", "Music", "Cgdct"],
    penalize: ["Horror", "Action", "Thriller"],
  },
  hype: {
    boost: ["Action", "Shounen", "Sports", "Mecha", "Super Power"],
    penalize: ["Slice of Life", "Drama"],
  },
  action: {
    boost: ["Action", "Shounen", "Martial Arts", "Super Power", "Mecha"],
    penalize: ["Slice of Life", "Iyashikei"],
  },
  romantic: {
    boost: ["Romance", "Drama", "Love Triangle", "Couples"],
    penalize: ["Horror", "Gore"],
  },
  funny: {
    boost: ["Comedy", "Parody", "Gag Humor", "Slapstick"],
    penalize: ["Tragedy", "Horror"],
  },
  brainy: {
    boost: ["Psychological", "Sci-Fi", "Mystery", "Philosophy", "Mind Games"],
    penalize: ["Ecchi", "Gag Humor"],
  },
  sad: {
    boost: ["Drama", "Tragedy", "Romance", "Coming of Age", "Emotional"],
    penalize: ["Comedy", "Parody"],
  },
  scary: {
    boost: ["Horror", "Thriller", "Psychological", "Survival"],
    penalize: ["Comedy", "Slice of Life", "Romance"],
  },
  epic: {
    boost: ["Fantasy", "Adventure", "Action", "Shounen", "War"],
    penalize: ["Slice of Life", "Cgdct"],
  },
  wholesome: {
    boost: ["Slice of Life", "Comedy", "Iyashikei", "Family Life", "Cgdct"],
    penalize: ["Horror", "Gore", "Tragedy"],
  },
  intense: {
    boost: ["Thriller", "Action", "Psychological", "Survival", "Battle Royale"],
    penalize: ["Slice of Life", "Iyashikei"],
  },
  mystery: {
    boost: ["Mystery", "Thriller", "Psychological", "Detective"],
    penalize: ["Slice of Life", "Sports"],
  },
  fantasy: {
    boost: ["Fantasy", "Adventure", "Magic", "Isekai"],
    penalize: [],
  },
  scifi: {
    boost: ["Sci-Fi", "Mecha", "Space", "Cyberpunk", "Time Travel"],
    penalize: [],
  },
  trippy: {
    boost: ["Psychological", "Avant Garde", "Surreal", "Experimental"],
    penalize: ["Shounen", "Sports"],
  },
  nostalgic: {
    boost: [
      "Coming of Age",
      "Drama",
      "Slice of Life",
      "School",
      "Ensemble Cast",
    ],
    penalize: ["Isekai", "Mecha"],
  },
  artistic: {
    boost: ["Avant Garde", "Drama", "Music", "Surreal", "Visual Arts"],
    penalize: ["Shounen", "Ecchi"],
  },
  competitive: {
    boost: ["Sports", "Strategy Game", "Shounen", "Tournament", "Martial Arts"],
    penalize: ["Slice of Life", "Iyashikei"],
  },
};

// Synonyms that resolve to a base keyword's rules
const MOOD_SYNONYMS: Record<string, string> = {
  // dark
  grim: "dark",
  moody: "dark",
  bleak: "dark",
  // chill
  relaxing: "chill",
  peaceful: "chill",
  cozy: "chill",
  mellow: "chill",
  // hype
  exciting: "hype",
  thrilling: "hype",
  // romantic
  romance: "romantic",
  love: "romantic",
  sweet: "romantic",
  // funny
  comedy: "funny",
  silly: "funny",
  witty: "funny",
  hilarious: "funny",
  // brainy
  smart: "brainy",
  cerebral: "brainy",
  intellectual: "brainy",
  complex: "brainy",
  // sad
  emotional: "sad",
  depressing: "sad",
  melancholic: "sad",
  bittersweet: "sad",
  // scary
  creepy: "scary",
  spooky: "scary",
  eerie: "scary",
  // epic
  grand: "epic",
  ambitious: "epic",
  // wholesome
  comforting: "wholesome",
  heartwarming: "wholesome",
  uplifting: "wholesome",
  // intense
  tense: "intense",
  gripping: "intense",
  // trippy
  surreal: "trippy",
  experimental: "trippy",
  // nostalgic
  retro: "nostalgic",
  throwback: "nostalgic",
  classic: "nostalgic",
  // artistic
  artsy: "artistic",
  beautiful: "artistic",
  aesthetic: "artistic",
  // competitive
  rivalry: "competitive",
  tournament: "competitive",
  // additional natural language terms
  psychological: "brainy",
  thoughtful: "brainy",
  battle: "action",
  fighting: "action",
  heartfelt: "sad",
  touching: "sad",
  lighthearted: "wholesome",
  feel: "wholesome",
  feels: "wholesome",
  suspense: "intense",
  suspenseful: "intense",
};

// Merge base rules and synonyms into a single lookup
const MOOD_RULES: Record<string, MoodRule> = { ...BASE_MOOD_RULES };
for (const [synonym, base] of Object.entries(MOOD_SYNONYMS)) {
  MOOD_RULES[synonym] = BASE_MOOD_RULES[base];
}

// Load user-defined mood overrides from env
export function loadCustomMoods(): void {
  const raw = process.env.ANILIST_MOOD_CONFIG;
  if (!raw) return;
  try {
    const custom = JSON.parse(raw) as Record<string, MoodRule>;
    for (const [key, rule] of Object.entries(custom)) {
      MOOD_RULES[key.toLowerCase()] = rule;
    }
  } catch {
    console.warn("[ani-mcp] Invalid ANILIST_MOOD_CONFIG JSON, using defaults.");
  }
}
loadCustomMoods();

// === Mood Parser ===

/** Parse a freeform mood string into genre/tag boost and penalize sets */
export function parseMood(mood: string): MoodModifiers {
  // Lowercase tokens, stripped of punctuation
  const words = mood
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/);

  const boostGenres = new Set<string>();
  const boostTags = new Set<string>();
  const penalizeGenres = new Set<string>();
  const penalizeTags = new Set<string>();

  for (const word of words) {
    const rule = MOOD_RULES[word];
    if (!rule) continue;

    // Add to both sets (matcher checks genres and tags separately)
    for (const name of rule.boost) {
      boostGenres.add(name);
      boostTags.add(name);
    }
    for (const name of rule.penalize) {
      penalizeGenres.add(name);
      penalizeTags.add(name);
    }
  }

  return { boostGenres, boostTags, penalizeGenres, penalizeTags };
}

/** Check whether a mood string matches any known keywords */
export function hasMoodMatch(mood: string): boolean {
  const words = mood
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/);
  return words.some((w) => w in MOOD_RULES);
}

/** List all recognized mood keywords */
export function getMoodKeywords(): string[] {
  return Object.keys(MOOD_RULES);
}

// AniList's fixed genre set (stable, rarely changes)
const ANILIST_GENRES = new Set([
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
]);

/** Extract mood keywords as separate genre and tag arrays */
export function parseMoodFilters(mood: string): {
  genres: string[];
  tags: string[];
} {
  const mods = parseMood(mood);
  const genres: string[] = [];
  const tags: string[] = [];
  for (const name of mods.boostGenres) {
    if (ANILIST_GENRES.has(name)) genres.push(name);
    else tags.push(name);
  }
  return { genres, tags };
}

// === Seasonal Suggestions ===

const SEASONAL_MOODS: Record<string, string[]> = {
  WINTER: ["cozy", "dark", "nostalgic", "brainy"],
  SPRING: ["romantic", "wholesome", "chill", "artistic"],
  SUMMER: ["hype", "action", "epic", "competitive"],
  FALL: ["mystery", "scary", "dark", "intense"],
};

/** Suggest mood keywords that fit the current anime season */
export function seasonalMoodSuggestions(): {
  season: string;
  moods: string[];
} {
  const month = new Date().getMonth() + 1;
  const season =
    month <= 3
      ? "WINTER"
      : month <= 6
        ? "SPRING"
        : month <= 9
          ? "SUMMER"
          : "FALL";
  return { season, moods: SEASONAL_MOODS[season] };
}

/** AniList API response types. */

/** Partial date from AniList (some fields may be null) */
export interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

/** User-generated tag with relevance ranking */
export interface AniListTag {
  name: string;
  rank: number;
  isMediaSpoiler: boolean;
}

/** Core media object shared across all query responses */
export interface AniListMedia {
  id: number;
  type: string;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  format: string | null;
  status: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  meanScore: number | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
  tags: AniListTag[];
  season: string | null;
  seasonYear: number | null;
  startDate: AniListDate;
  endDate: AniListDate;
  studios: {
    nodes: Array<{ name: string }>;
  };
  source: string | null;
  isAdult: boolean;
  coverImage: { large: string | null };
  siteUrl: string;
  description: string | null;
}

/** Pagination metadata from AniList's Page type */
interface AniListPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

/** Paginated search results with media entries */
export interface SearchMediaResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListMedia[];
  };
}

/** Single media with full details, relations, and recommendations */
export interface MediaDetailsResponse {
  Media: AniListMedia & {
    relations: {
      edges: Array<{
        relationType: string;
        node: {
          id: number;
          title: { romaji: string | null; english: string | null };
          format: string | null;
          status: string | null;
          type: string;
        };
      }>;
    };
    recommendations: {
      nodes: Array<{
        rating: number;
        mediaRecommendation: {
          id: number;
          title: { romaji: string | null; english: string | null };
          format: string | null;
          meanScore: number | null;
          genres: string[];
          siteUrl: string;
        } | null;
      }>;
    };
  };
}

/** User profile statistics from the User query */
export interface UserStatsResponse {
  User: {
    id: number;
    name: string;
    statistics: {
      anime: MediaTypeStats;
      manga: MediaTypeStats;
    };
  };
}

/** Per-type (anime or manga) statistics */
export interface MediaTypeStats {
  count: number;
  meanScore: number;
  minutesWatched?: number;
  episodesWatched?: number;
  chaptersRead?: number;
  volumesRead?: number;
  genres: Array<{
    genre: string;
    count: number;
    meanScore: number;
    minutesWatched?: number;
    chaptersRead?: number;
  }>;
  scores: Array<{
    score: number;
    count: number;
  }>;
  formats: Array<{
    format: string;
    count: number;
  }>;
}

/** Recommendations response for a single media */
export interface RecommendationsResponse {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    recommendations: {
      nodes: Array<{
        rating: number;
        mediaRecommendation: AniListMedia | null;
      }>;
    };
  };
}

/** Trending media extends AniListMedia with a trending score */
export interface TrendingMediaResponse {
  Page: {
    pageInfo: { total: number; hasNextPage: boolean };
    media: Array<AniListMedia & { trending: number }>;
  };
}

/** Staff and character data for a media title */
export interface StaffResponse {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    format: string | null;
    siteUrl: string;
    staff: {
      edges: Array<{
        role: string;
        node: {
          id: number;
          name: { full: string; native: string | null };
          siteUrl: string;
        };
      }>;
    };
    characters: {
      edges: Array<{
        role: string;
        node: {
          id: number;
          name: { full: string; native: string | null };
          siteUrl: string;
        };
        voiceActors: Array<{
          id: number;
          name: { full: string; native: string | null };
          siteUrl: string;
        }>;
      }>;
    };
  };
}

/** Airing schedule for a media title */
export interface AiringScheduleResponse {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    status: string | null;
    episodes: number | null;
    nextAiringEpisode: {
      episode: number;
      airingAt: number;
      timeUntilAiring: number;
    } | null;
    airingSchedule: {
      nodes: Array<{
        episode: number;
        airingAt: number;
        timeUntilAiring: number;
      }>;
    };
    siteUrl: string;
  };
}

/** Character search results */
export interface CharacterSearchResponse {
  Page: {
    pageInfo: { total: number; hasNextPage: boolean };
    characters: Array<{
      id: number;
      name: { full: string; native: string | null; alternative: string[] };
      image: { medium: string | null };
      favourites: number;
      siteUrl: string;
      media: {
        edges: Array<{
          characterRole: string;
          node: {
            id: number;
            title: { romaji: string | null; english: string | null };
            format: string | null;
            type: string;
            siteUrl: string;
          };
          voiceActors: Array<{
            id: number;
            name: { full: string };
            siteUrl: string;
          }>;
        }>;
      };
    }>;
  };
}

/** Response from saving a list entry */
export interface SaveMediaListEntryResponse {
  SaveMediaListEntry: {
    id: number;
    mediaId: number;
    status: string;
    score: number;
    progress: number;
  };
}

/** Response from deleting a list entry */
export interface DeleteMediaListEntryResponse {
  DeleteMediaListEntry: {
    deleted: boolean;
  };
}

/** Single entry from a user's anime/manga list */
export interface AniListMediaListEntry {
  id: number;
  score: number;
  progress: number;
  status: string;
  updatedAt: number;
  startedAt: AniListDate;
  completedAt: AniListDate;
  notes: string | null;
  media: AniListMedia;
}

/** User's anime/manga list, grouped by watching status */
export interface UserListResponse {
  MediaListCollection: {
    lists: Array<{
      name: string;
      status: string;
      entries: AniListMediaListEntry[];
    }>;
  };
}

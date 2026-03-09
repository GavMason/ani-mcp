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
  duration: number | null;
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
  coverImage: { large: string | null; extraLarge: string | null };
  trailer: { id: string; site: string; thumbnail: string } | null;
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
    mediaListOptions: {
      scoreFormat: ScoreFormat;
    };
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
          language: string;
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

/** Batch airing response for currently watching tracker */
export interface BatchAiringResponse {
  Page: {
    media: Array<{
      id: number;
      title: {
        romaji: string | null;
        english: string | null;
        native: string | null;
      };
      format: string | null;
      episodes: number | null;
      nextAiringEpisode: {
        episode: number;
        airingAt: number;
        timeUntilAiring: number;
      } | null;
      siteUrl: string;
    }>;
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

/** Single list entry snapshot for undo support */
export interface MediaListEntryResponse {
  MediaList: {
    id: number;
    mediaId: number;
    status: string;
    score: number;
    progress: number;
    progressVolumes: number;
    notes: string | null;
    private: boolean;
  } | null;
}

/** Response from single-entry lookup with full media details */
export interface ListLookupResponse {
  MediaList: AniListMediaListEntry | null;
}

/** Response from paginated completed-by-date query */
export interface CompletedByDateResponse {
  Page: {
    pageInfo: { hasNextPage: boolean };
    mediaList: AniListMediaListEntry[];
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
    progressVolumes: number;
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
  progressVolumes: number;
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
      isCustomList: boolean;
      entries: AniListMediaListEntry[];
    }>;
  };
}

/** Paginated staff search results with works per person */
export interface StaffSearchResponse {
  Page: {
    pageInfo: { total: number; hasNextPage: boolean };
    staff: Array<{
      id: number;
      name: { full: string; native: string | null };
      primaryOccupations: string[];
      siteUrl: string;
      staffMedia: {
        edges: Array<{
          staffRole: string;
          node: {
            id: number;
            title: { romaji: string; english: string | null };
            format: string | null;
            type: string;
            meanScore: number | null;
            siteUrl: string;
          };
        }>;
      };
    }>;
  };
}

/** AniList score format options */
export type ScoreFormat =
  | "POINT_100"
  | "POINT_10_DECIMAL"
  | "POINT_10"
  | "POINT_5"
  | "POINT_3";

/** Authenticated user info from Viewer query */
export interface ViewerResponse {
  Viewer: {
    id: number;
    name: string;
    avatar: { medium: string | null };
    siteUrl: string;
    mediaListOptions: {
      scoreFormat: ScoreFormat;
    };
  };
}

/** All valid genres and media tags */
export interface GenreTagCollectionResponse {
  GenreCollection: string[];
  MediaTagCollection: Array<{
    name: string;
    description: string;
    category: string;
    isAdult: boolean;
  }>;
}

// === 0.4.0 Social & Favourites ===

/** Response from toggling a favourite */
export interface ToggleFavouriteResponse {
  ToggleFavourite: {
    anime: { nodes: Array<{ id: number }> };
    manga: { nodes: Array<{ id: number }> };
    characters: { nodes: Array<{ id: number }> };
    staff: { nodes: Array<{ id: number }> };
    studios: { nodes: Array<{ id: number }> };
  };
}

/** Response from posting a text activity */
export interface SaveTextActivityResponse {
  SaveTextActivity: {
    id: number;
    createdAt: number;
    text: string;
    user: { name: string };
  };
}

/** Text-based activity on a user's feed */
export interface TextActivity {
  __typename: "TextActivity";
  id: number;
  text: string;
  createdAt: number;
  user: { name: string };
}

/** List update activity on a user's feed */
export interface ListActivity {
  __typename: "ListActivity";
  id: number;
  status: string;
  progress: string | null;
  createdAt: number;
  user: { name: string };
  media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    type: string;
  };
}

/** Union of activity types returned by the feed query */
export type Activity = TextActivity | ListActivity;

/** Paginated activity feed response */
export interface ActivityFeedResponse {
  Page: {
    pageInfo: { total: number; currentPage: number; hasNextPage: boolean };
    activities: Activity[];
  };
}

/** User profile with bio, stats, and favourites */
export interface UserProfileResponse {
  User: {
    id: number;
    name: string;
    about: string | null;
    avatar: { large: string | null };
    bannerImage: string | null;
    siteUrl: string;
    createdAt: number;
    updatedAt: number;
    donatorTier: number;
    statistics: {
      anime: {
        count: number;
        meanScore: number;
        episodesWatched: number;
        minutesWatched: number;
      };
      manga: {
        count: number;
        meanScore: number;
        chaptersRead: number;
        volumesRead: number;
      };
    };
    favourites: {
      anime: {
        nodes: Array<{
          id: number;
          title: {
            romaji: string | null;
            english: string | null;
            native: string | null;
          };
          siteUrl: string;
        }>;
      };
      manga: {
        nodes: Array<{
          id: number;
          title: {
            romaji: string | null;
            english: string | null;
            native: string | null;
          };
          siteUrl: string;
        }>;
      };
      characters: {
        nodes: Array<{ id: number; name: { full: string }; siteUrl: string }>;
      };
      staff: {
        nodes: Array<{ id: number; name: { full: string }; siteUrl: string }>;
      };
      studios: { nodes: Array<{ id: number; name: string; siteUrl: string }> };
    };
  };
}

/** Community reviews for a media title */
export interface MediaReviewsResponse {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    reviews: {
      pageInfo: { total: number; hasNextPage: boolean };
      nodes: Array<{
        id: number;
        score: number;
        summary: string;
        body: string;
        rating: number;
        ratingAmount: number;
        createdAt: number;
        user: { name: string; siteUrl: string };
      }>;
    };
  };
}

/** Batch relations response for sequel/prequel detection */
export interface BatchRelationsResponse {
  Page: {
    media: Array<{
      id: number;
      title: { romaji: string | null; english: string | null };
      format: string | null;
      status: string | null;
      relations: {
        edges: Array<{
          relationType: string;
          node: {
            id: number;
            title: { romaji: string | null; english: string | null };
            format: string | null;
            status: string | null;
            type: string;
            season: string | null;
            seasonYear: number | null;
          };
        }>;
      };
    }>;
  };
}

/** Response from toggling a like on an activity */
export interface ToggleLikeResponse {
  ToggleLike: Array<{ id: number; name: string }>;
}

/** Response from posting an activity reply */
export interface SaveActivityReplyResponse {
  SaveActivityReply: {
    id: number;
    text: string;
    createdAt: number;
    user: { name: string };
  };
}

/** Paginated following list */
export interface UserFollowingResponse {
  Page: {
    pageInfo: { total: number; hasNextPage: boolean };
    following: Array<{ id: number; name: string }>;
  };
}

/** Single studio with production history */
export interface StudioSearchResponse {
  Studio: {
    id: number;
    name: string;
    isAnimationStudio: boolean;
    siteUrl: string;
    media: {
      edges: Array<{
        isMainStudio: boolean;
        node: {
          id: number;
          title: { romaji: string; english: string | null };
          format: string | null;
          type: string;
          status: string | null;
          meanScore: number | null;
          siteUrl: string;
        };
      }>;
    };
  };
}

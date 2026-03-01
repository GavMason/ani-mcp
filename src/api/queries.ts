/**
 * AniList GraphQL Query Strings
 *
 * Separated from tool logic so queries are easy to find and update
 * if the AniList schema changes.
 */

/** Shared media fields, reused across all queries */
const MEDIA_FRAGMENT = `
  fragment MediaFields on Media {
    id
    type
    title {
      romaji
      english
      native
    }
    format
    status
    episodes
    chapters
    volumes
    meanScore
    averageScore
    popularity
    genres
    tags {
      name
      rank
      isMediaSpoiler
    }
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    studios(isMain: true) {
      nodes { name }
    }
    source
    isAdult
    coverImage { large }
    siteUrl
    description(asHtml: false)
  }
`;

/** Paginated search with optional genre, year, and format filters */
export const SEARCH_MEDIA_QUERY = `
  query SearchMedia(
    $search: String!
    $type: MediaType
    $genre: [String]
    $year: Int
    $format: MediaFormat
    $isAdult: Boolean
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(
        search: $search
        type: $type
        genre_in: $genre
        startDate_year: $year
        format: $format
        isAdult: $isAdult
        sort: $sort
      ) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** Full media lookup with relations and recommendations */
export const MEDIA_DETAILS_QUERY = `
  query MediaDetails($id: Int, $search: String) {
    Media(id: $id, search: $search) {
      ...MediaFields
      relations {
        edges {
          relationType
          node {
            id
            title { romaji english }
            format
            status
            type
          }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 5) {
        nodes {
          rating
          mediaRecommendation {
            id
            title { romaji english }
            format
            meanScore
            genres
            siteUrl
          }
        }
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** Discover top-rated titles by genre without a search term */
export const DISCOVER_MEDIA_QUERY = `
  query DiscoverMedia(
    $type: MediaType
    $genre_in: [String]
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      media(type: $type, genre_in: $genre_in, sort: $sort) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** Browse anime by season and year */
export const SEASONAL_MEDIA_QUERY = `
  query SeasonalMedia(
    $season: MediaSeason
    $seasonYear: Int
    $type: MediaType
    $isAdult: Boolean
    $sort: [MediaSort]
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(
        season: $season
        seasonYear: $seasonYear
        type: $type
        isAdult: $isAdult
        sort: $sort
      ) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** User profile statistics - watching/reading stats, genre/tag/score breakdowns */
export const USER_STATS_QUERY = `
  query UserStats($name: String!) {
    User(name: $name) {
      id
      name
      statistics {
        anime {
          count
          meanScore
          minutesWatched
          episodesWatched
          genres(sort: COUNT_DESC, limit: 10) {
            genre
            count
            meanScore
            minutesWatched
          }
          scores(sort: MEAN_SCORE_DESC) {
            score
            count
          }
          formats(sort: COUNT_DESC) {
            format
            count
          }
        }
        manga {
          count
          meanScore
          chaptersRead
          volumesRead
          genres(sort: COUNT_DESC, limit: 10) {
            genre
            count
            meanScore
            chaptersRead
          }
          scores(sort: MEAN_SCORE_DESC) {
            score
            count
          }
          formats(sort: COUNT_DESC) {
            format
            count
          }
        }
      }
    }
  }
`;

/** Media recommendations for a given title */
export const RECOMMENDATIONS_QUERY = `
  query MediaRecommendations($id: Int, $search: String, $perPage: Int) {
    Media(id: $id, search: $search) {
      id
      title { romaji english native }
      recommendations(sort: RATING_DESC, perPage: $perPage) {
        nodes {
          rating
          mediaRecommendation {
            ...MediaFields
          }
        }
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** User's anime/manga list, grouped by status. Omit $status to get all lists. */
export const USER_LIST_QUERY = `
  query UserMediaList(
    $userName: String!
    $type: MediaType
    $status: MediaListStatus
    $sort: [MediaListSort]
  ) {
    MediaListCollection(
      userName: $userName
      type: $type
      status: $status
      sort: $sort
    ) {
      lists {
        name
        status
        entries {
          id
          score(format: POINT_10)  # normalize to 1-10 scale regardless of user's profile setting
          progress
          status
          updatedAt
          startedAt { year month day }
          completedAt { year month day }
          notes
          media {
            ...MediaFields
          }
        }
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

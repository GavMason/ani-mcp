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
        seasonYear: $year
        format: $format
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
      pageInfo { total }
      media(type: $type, genre_in: $genre_in, sort: $sort) {
        ...MediaFields
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

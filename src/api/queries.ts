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
    duration
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
    coverImage { large extraLarge }
    trailer { id site thumbnail }
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
      mediaListOptions {
        scoreFormat
      }
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

/** Trending anime or manga right now */
export const TRENDING_MEDIA_QUERY = `
  query TrendingMedia(
    $type: MediaType
    $isAdult: Boolean
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      media(type: $type, isAdult: $isAdult, sort: TRENDING_DESC) {
        ...MediaFields
        trending
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** Browse by genre without a search term, with optional filters */
export const GENRE_BROWSE_QUERY = `
  query GenreBrowse(
    $type: MediaType
    $genre_in: [String]
    $year: Int
    $status: MediaStatus
    $format: MediaFormat
    $isAdult: Boolean
    $sort: [MediaSort]
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      media(
        type: $type
        genre_in: $genre_in
        startDate_year: $year
        status: $status
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

/** Staff and voice actors for a media title */
export const STAFF_QUERY = `
  query MediaStaff($id: Int, $search: String, $language: StaffLanguage) {
    Media(id: $id, search: $search) {
      id
      title { romaji english native }
      format
      siteUrl
      staff(sort: RELEVANCE, perPage: 15) {
        edges {
          role
          node {
            id
            name { full native }
            siteUrl
          }
        }
      }
      characters(sort: ROLE, perPage: 10) {
        edges {
          role
          node {
            id
            name { full native }
            siteUrl
          }
          voiceActors(language: $language) {
            id
            name { full native }
            language
            siteUrl
          }
        }
      }
    }
  }
`;

/** Airing schedule for currently airing anime */
export const AIRING_SCHEDULE_QUERY = `
  query AiringSchedule($id: Int, $search: String, $notYetAired: Boolean) {
    Media(id: $id, search: $search) {
      id
      title { romaji english native }
      status
      episodes
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
      airingSchedule(notYetAired: $notYetAired, perPage: 10) {
        nodes {
          episode
          airingAt
          timeUntilAiring
        }
      }
      siteUrl
    }
  }
`;

/** Batch-fetch next airing episodes for multiple media IDs */
export const BATCH_AIRING_QUERY = `
  query BatchAiring($ids: [Int], $perPage: Int) {
    Page(perPage: $perPage) {
      media(id_in: $ids, status: RELEASING) {
        id
        title { romaji english native }
        format
        episodes
        nextAiringEpisode {
          episode
          airingAt
          timeUntilAiring
        }
        siteUrl
      }
    }
  }
`;

/** Search for characters by name */
export const CHARACTER_SEARCH_QUERY = `
  query CharacterSearch($search: String!, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      characters(search: $search, sort: FAVOURITES_DESC) {
        id
        name { full native alternative }
        image { medium }
        favourites
        siteUrl
        media(sort: POPULARITY_DESC, perPage: 5) {
          edges {
            characterRole
            node {
              id
              title { romaji english }
              format
              type
              siteUrl
            }
            voiceActors(language: JAPANESE) {
              id
              name { full }
              siteUrl
            }
          }
        }
      }
    }
  }
`;

/** Create or update a list entry */
export const SAVE_MEDIA_LIST_ENTRY_MUTATION = `
  mutation SaveMediaListEntry(
    $mediaId: Int
    $status: MediaListStatus
    $scoreRaw: Int
    $progress: Int
    $progressVolumes: Int
    $notes: String
    $private: Boolean
  ) {
    SaveMediaListEntry(
      mediaId: $mediaId
      status: $status
      scoreRaw: $scoreRaw
      progress: $progress
      progressVolumes: $progressVolumes
      notes: $notes
      private: $private
    ) {
      id
      mediaId
      status
      score(format: POINT_10)
      progress
      progressVolumes
    }
  }
`;

/** Fetch a single list entry for snapshotting before mutations */
export const MEDIA_LIST_ENTRY_QUERY = `
  query MediaListEntry($id: Int, $mediaId: Int, $userName: String) {
    MediaList(id: $id, mediaId: $mediaId, userName: $userName) {
      id
      mediaId
      status
      score(format: POINT_10)
      progress
      progressVolumes
      notes
      private
    }
  }
`;

/** Fetch a single list entry with full media details */
export const LIST_LOOKUP_QUERY = `
  query ListLookup($mediaId: Int!, $userName: String!) {
    MediaList(mediaId: $mediaId, userName: $userName) {
      id
      status
      score(format: POINT_10)
      progress
      progressVolumes
      updatedAt
      startedAt { year month day }
      completedAt { year month day }
      notes
      media {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

/** Remove a list entry */
export const DELETE_MEDIA_LIST_ENTRY_MUTATION = `
  mutation DeleteMediaListEntry($id: Int!) {
    DeleteMediaListEntry(id: $id) {
      deleted
    }
  }
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
        isCustomList
        entries {
          id
          score(format: POINT_10)  # normalize to 1-10 scale regardless of user's profile setting
          progress
          progressVolumes
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

/** Completed list entries filtered by date range (server-side) */
export const COMPLETED_BY_DATE_QUERY = `
  query CompletedByDate(
    $userName: String!
    $type: MediaType
    $completedAfter: FuzzyDateInt
    $completedBefore: FuzzyDateInt
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      mediaList(
        userName: $userName
        type: $type
        status: COMPLETED
        completedAt_greater: $completedAfter
        completedAt_lesser: $completedBefore
        sort: FINISHED_ON_DESC
      ) {
        id
        score(format: POINT_10)
        progress
        progressVolumes
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
  ${MEDIA_FRAGMENT}
`;

/** Search for staff by name with their top works */
export const STAFF_SEARCH_QUERY = `
  query StaffSearch($search: String!, $page: Int, $perPage: Int, $mediaPerPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      staff(search: $search, sort: SEARCH_MATCH) {
        id
        name { full native }
        primaryOccupations
        siteUrl
        staffMedia(sort: POPULARITY_DESC, perPage: $mediaPerPage) {
          edges {
            staffRole
            node {
              id
              title { romaji english }
              format
              type
              meanScore
              siteUrl
            }
          }
        }
      }
    }
  }
`;

/** Authenticated user info */
export const VIEWER_QUERY = `
  query Viewer {
    Viewer {
      id
      name
      avatar { medium }
      siteUrl
      mediaListOptions {
        scoreFormat
      }
    }
  }
`;

/** All valid genres and media tags */
export const GENRE_TAG_COLLECTION_QUERY = `
  query GenreTagCollection {
    GenreCollection
    MediaTagCollection {
      name
      description
      category
      isAdult
    }
  }
`;

// === 0.4.0 Social & Favourites ===

/** Toggle favourite on any entity type */
export const TOGGLE_FAVOURITE_MUTATION = `
  mutation ToggleFavourite(
    $animeId: Int
    $mangaId: Int
    $characterId: Int
    $staffId: Int
    $studioId: Int
  ) {
    ToggleFavourite(
      animeId: $animeId
      mangaId: $mangaId
      characterId: $characterId
      staffId: $staffId
      studioId: $studioId
    ) {
      anime { nodes { id } }
      manga { nodes { id } }
      characters { nodes { id } }
      staff { nodes { id } }
      studios { nodes { id } }
    }
  }
`;

/** Post a text activity to the authenticated user's feed */
export const SAVE_TEXT_ACTIVITY_MUTATION = `
  mutation SaveTextActivity($text: String!) {
    SaveTextActivity(text: $text) {
      id
      createdAt
      text
      user { name }
    }
  }
`;

/** Recent activity for a user, supports text and list activity types */
export const ACTIVITY_FEED_QUERY = `
  query ActivityFeed($userId: Int, $type: ActivityType, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage hasNextPage }
      activities(userId: $userId, type: $type, sort: ID_DESC) {
        ... on TextActivity {
          __typename
          id
          text
          createdAt
          user { name }
        }
        ... on ListActivity {
          __typename
          id
          status
          progress
          createdAt
          user { name }
          media {
            id
            title { romaji english native }
            type
          }
        }
      }
    }
  }
`;

/** User profile with bio, stats summary, and top favourites */
export const USER_PROFILE_QUERY = `
  query UserProfile($name: String) {
    User(name: $name) {
      id
      name
      about
      avatar { large }
      bannerImage
      siteUrl
      createdAt
      updatedAt
      donatorTier
      statistics {
        anime {
          count
          meanScore
          episodesWatched
          minutesWatched
        }
        manga {
          count
          meanScore
          chaptersRead
          volumesRead
        }
      }
      favourites {
        anime(perPage: 5) {
          nodes { id title { romaji english native } siteUrl }
        }
        manga(perPage: 5) {
          nodes { id title { romaji english native } siteUrl }
        }
        characters(perPage: 5) {
          nodes { id name { full } siteUrl }
        }
        staff(perPage: 5) {
          nodes { id name { full } siteUrl }
        }
        studios(perPage: 5) {
          nodes { id name siteUrl }
        }
      }
    }
  }
`;

/** Community reviews for a media title */
export const MEDIA_REVIEWS_QUERY = `
  query MediaReviews($id: Int, $search: String, $page: Int, $perPage: Int, $sort: [ReviewSort]) {
    Media(id: $id, search: $search) {
      id
      title { romaji english native }
      reviews(page: $page, perPage: $perPage, sort: $sort) {
        pageInfo { total hasNextPage }
        nodes {
          id
          score
          summary
          body
          rating
          ratingAmount
          createdAt
          user { name siteUrl }
        }
      }
    }
  }
`;

/** Search for a studio by name with their productions */
export const STUDIO_SEARCH_QUERY = `
  query StudioSearch($search: String!, $perPage: Int) {
    Studio(search: $search, sort: SEARCH_MATCH) {
      id
      name
      isAnimationStudio
      siteUrl
      media(sort: POPULARITY_DESC, perPage: $perPage) {
        edges {
          isMainStudio
          node {
            id
            title { romaji english }
            format
            type
            status
            meanScore
            siteUrl
          }
        }
      }
    }
  }
`;

/** Toggle like on an activity or activity reply */
export const TOGGLE_LIKE_MUTATION = `
  mutation ToggleLike($id: Int, $type: LikeableType) {
    ToggleLike(id: $id, type: $type) {
      id
      name
    }
  }
`;

/** Post a reply to an activity */
export const SAVE_ACTIVITY_REPLY_MUTATION = `
  mutation SaveActivityReply($activityId: Int, $text: String!) {
    SaveActivityReply(activityId: $activityId, text: $text) {
      id
      text
      createdAt
      user { name }
    }
  }
`;

/** Get a user's following list */
export const USER_FOLLOWING_QUERY = `
  query UserFollowing($userId: Int!, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      following(userId: $userId) {
        id
        name
      }
    }
  }
`;

/** Batch-fetch relations for a list of media IDs */
export const BATCH_RELATIONS_QUERY = `
  query BatchRelations($ids: [Int]) {
    Page(perPage: 50) {
      media(id_in: $ids) {
        id
        title { romaji english }
        format
        status
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english }
              format
              status
              type
              season
              seasonYear
            }
          }
        }
      }
    }
  }
`;

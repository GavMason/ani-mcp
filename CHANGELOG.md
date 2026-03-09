# Changelog

All notable changes to ani-mcp are documented here.

## 0.12.0

- Add `anilist_group_pick` - find anime/manga for a group to watch together (intersection of planning lists)
- Add `anilist_shared_planning` - find overlap between two users' planning lists
- Add `anilist_follow_suggestions` - rank followed users by taste compatibility
- Add `anilist_react` - like or reply to activities in a user's feed

## 0.11.0

- Add "Try it in 30 seconds" quick-start in README (zero-config setup)
- Add `setup` prompt - guided walkthrough for connecting your AniList account
- Add `anilist_lookup` tool - check if a title is on your list without fetching everything
- Add `language` param to `anilist_staff` - support ENGLISH, KOREAN, and other VA languages (default JAPANESE)
- Switch `anilist_wrapped` to server-side date filtering via `completedAt_greater/lesser`
- Add CHANGELOG.md

## 0.10.0

- Add shareable `anilist_taste_card` and `anilist_compat_card` tools (PNG image generation)

## 0.9.0

- Add cover images and trailer URLs in responses
- Add `anilist_mal_import` - read-only MyAnimeList list import for recommendations
- Add `anilist_airing` - upcoming episodes for currently watching titles
- Add manga volume tracking in progress updates

## 0.8.0

- Add persistent taste profile cache with hash-based invalidation
- Add `anilist_batch_update` - bulk filter + action with dry-run default
- Add `anilist_unscored` - list completed but unscored titles
- Add `exclude` param to `anilist_pick` for conversational narrowing
- Add `anilist_undo` - undo last write operation from session stack

## 0.7.0

- Add `anilist_calibration` - per-genre scoring bias vs community consensus
- Add `anilist_drops` - drop pattern analysis with genre/tag clusters
- Add `anilist_evolution` - taste shift across 2-year time windows
- Add `anilist_completionist` - franchise completion tracking
- Add `anilist_seasonal_stats` - per-season pick/finish/drop rates
- Add `anilist_pace` - estimated completion date for current titles

## 0.6.0

- Add MCP resources: user profile, taste profile, and current list
- Add MCP prompts: seasonal review, what to watch, roast my taste, compare us, year in review, explain title, find similar

## 0.5.0

- Add `anilist_pick` with `source: SEASONAL` for seasonal taste-ranked picks
- Add cross-media recommendations via `profileType` param
- Add `anilist_sequels` - sequel alerts for currently airing season
- Add `anilist_watch_order` - franchise chain traversal
- Add `anilist_session` - viewing session planning within a time budget
- Add natural language mood filters and custom mood config

## 0.4.0

- Add `anilist_favourite` - toggle favourite on anime, manga, character, staff, or studio
- Add `anilist_activity` - post text activity to feed
- Add `anilist_feed` - recent user activity
- Add `anilist_profile` - user profile with bio and favourites
- Add `anilist_reviews` - community reviews with sentiment
- Add custom list support

## 0.3.0

- Add `anilist_genre_list` - list valid genres and tags
- Add NSFW filtering via `ANILIST_NSFW` env var
- Add score format support (POINT_3/5/10/10_DECIMAL/100)
- Add `anilist_whoami` - auth status check
- Add preferred title language via `ANILIST_TITLE_LANGUAGE`
- Add fuzzy title matching and alias resolution
- Improve error messaging for rate limits, auth, and timeouts

## 0.2.0

- Add pagination support to search and browse tools
- Add `anilist_staff_search` and `anilist_studio_search`
- Add `anilist_explain` and `anilist_similar`
- Add Docker support and HTTP Stream transport
- Add write operations: progress updates, list management, scoring

## 0.1.0

- Initial release
- Search, details, and user list tools
- Taste profiling and recommendation engine
- Seasonal, trending, and genre browsing
- Staff credits, airing schedule, and character search
- User statistics and year-in-review

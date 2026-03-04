/** Write tools: list mutations, favourites, and activity posting. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  SAVE_MEDIA_LIST_ENTRY_MUTATION,
  DELETE_MEDIA_LIST_ENTRY_MUTATION,
  TOGGLE_FAVOURITE_MUTATION,
  SAVE_TEXT_ACTIVITY_MUTATION,
  VIEWER_QUERY,
} from "../api/queries.js";
import {
  UpdateProgressInputSchema,
  AddToListInputSchema,
  RateInputSchema,
  DeleteFromListInputSchema,
  FavouriteInputSchema,
  PostActivityInputSchema,
} from "../schemas.js";
import type {
  SaveMediaListEntryResponse,
  DeleteMediaListEntryResponse,
  ToggleFavouriteResponse,
  SaveTextActivityResponse,
  ViewerResponse,
} from "../types.js";
import { throwToolError, formatScore, detectScoreFormat } from "../utils.js";

// === Auth Guard ===

/** Guard against unauthenticated write attempts */
function requireAuth(): void {
  if (!process.env.ANILIST_TOKEN) {
    throw new Error(
      "ANILIST_TOKEN is not set. Write operations require an authenticated AniList account.",
    );
  }
}

// === Tool Registration ===

/** Register list mutation tools */
export function registerWriteTools(server: FastMCP): void {
  // === Update Progress ===

  server.addTool({
    name: "anilist_update_progress",
    description:
      "Update your episode or chapter progress for an anime or manga. " +
      "Use when the user says they watched an episode, finished a chapter, " +
      "or wants to record progress. Requires ANILIST_TOKEN. " +
      "Returns updated status, progress count, and entry ID.",
    parameters: UpdateProgressInputSchema,
    annotations: {
      title: "Update Progress",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const variables: Record<string, unknown> = {
          mediaId: args.mediaId,
          progress: args.progress,
          status: args.status ?? "CURRENT",
        };

        const data = await anilistClient.query<SaveMediaListEntryResponse>(
          SAVE_MEDIA_LIST_ENTRY_MUTATION,
          variables,
          { cache: null },
        );

        anilistClient.clearCache();

        const entry = data.SaveMediaListEntry;
        return [
          `Progress updated.`,
          `Status: ${entry.status}`,
          `Progress: ${entry.progress}`,
          `Entry ID: ${entry.id}`,
        ].join("\n");
      } catch (error) {
        return throwToolError(error, "updating progress");
      }
    },
  });

  // === Add to List ===

  server.addTool({
    name: "anilist_add_to_list",
    description:
      "Add an anime or manga to your list with a status. " +
      "Use when the user wants to start watching, plan to watch, " +
      "or mark a title as completed. Requires ANILIST_TOKEN. " +
      "Returns status, optional score, and entry ID.",
    parameters: AddToListInputSchema,
    annotations: {
      title: "Add to List",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const variables: Record<string, unknown> = {
          mediaId: args.mediaId,
          status: args.status,
        };
        if (args.score !== undefined)
          variables.scoreRaw = Math.round(args.score * 10);

        const [data, scoreFmt] = await Promise.all([
          anilistClient.query<SaveMediaListEntryResponse>(
            SAVE_MEDIA_LIST_ENTRY_MUTATION,
            variables,
            { cache: null },
          ),
          detectScoreFormat(async () => {
            const data = await anilistClient.query<ViewerResponse>(
              VIEWER_QUERY,
              {},
              { cache: "stats" },
            );
            return data.Viewer.mediaListOptions.scoreFormat;
          }),
        ]);

        anilistClient.clearCache();

        const entry = data.SaveMediaListEntry;
        const scoreStr =
          entry.score > 0
            ? ` | Score: ${formatScore(entry.score, scoreFmt)}`
            : "";
        return [
          `Added to list.`,
          `Status: ${entry.status}${scoreStr}`,
          `Entry ID: ${entry.id}`,
        ].join("\n");
      } catch (error) {
        return throwToolError(error, "adding to list");
      }
    },
  });

  // === Rate ===

  server.addTool({
    name: "anilist_rate",
    description:
      "Score an anime or manga on your list. " +
      "Use when the user wants to give a rating (0-10). Scores display in the user's " +
      "preferred format (3/5/10/100-point). Use 0 to remove. Requires ANILIST_TOKEN.",
    parameters: RateInputSchema,
    annotations: {
      title: "Rate Title",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const [data, scoreFmt] = await Promise.all([
          anilistClient.query<SaveMediaListEntryResponse>(
            SAVE_MEDIA_LIST_ENTRY_MUTATION,
            { mediaId: args.mediaId, scoreRaw: Math.round(args.score * 10) },
            { cache: null },
          ),
          detectScoreFormat(async () => {
            const data = await anilistClient.query<ViewerResponse>(
              VIEWER_QUERY,
              {},
              { cache: "stats" },
            );
            return data.Viewer.mediaListOptions.scoreFormat;
          }),
        ]);

        anilistClient.clearCache();

        const entry = data.SaveMediaListEntry;
        const scoreDisplay =
          args.score === 0
            ? "Score removed."
            : `Score set to ${formatScore(entry.score, scoreFmt)}.`;
        return [scoreDisplay, `Entry ID: ${entry.id}`].join("\n");
      } catch (error) {
        return throwToolError(error, "rating");
      }
    },
  });

  // === Delete from List ===

  server.addTool({
    name: "anilist_delete_from_list",
    description:
      "Remove an entry from your anime or manga list. " +
      "Requires the list entry ID (not the media ID) - use anilist_list to find it. " +
      "Requires ANILIST_TOKEN.",
    parameters: DeleteFromListInputSchema,
    annotations: {
      title: "Delete from List",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const data = await anilistClient.query<DeleteMediaListEntryResponse>(
          DELETE_MEDIA_LIST_ENTRY_MUTATION,
          { id: args.entryId },
          { cache: null },
        );

        anilistClient.clearCache();

        return data.DeleteMediaListEntry.deleted
          ? `Entry ${args.entryId} deleted from your list.`
          : `Entry ${args.entryId} was not found or already removed.`;
      } catch (error) {
        return throwToolError(error, "deleting from list");
      }
    },
  });

  // === Toggle Favourite ===

  // Map entity type to mutation variable name
  const FAVOURITE_VAR_MAP: Record<string, string> = {
    ANIME: "animeId",
    MANGA: "mangaId",
    CHARACTER: "characterId",
    STAFF: "staffId",
    STUDIO: "studioId",
  };

  // Map entity type to response field name
  const FAVOURITE_FIELD_MAP: Record<
    string,
    keyof ToggleFavouriteResponse["ToggleFavourite"]
  > = {
    ANIME: "anime",
    MANGA: "manga",
    CHARACTER: "characters",
    STAFF: "staff",
    STUDIO: "studios",
  };

  server.addTool({
    name: "anilist_favourite",
    description:
      "Toggle favourite on an anime, manga, character, staff member, or studio. " +
      "Calling again on the same entity removes it from favourites. " +
      "Requires ANILIST_TOKEN.",
    parameters: FavouriteInputSchema,
    annotations: {
      title: "Toggle Favourite",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const variables = { [FAVOURITE_VAR_MAP[args.type]]: args.id };

        const data = await anilistClient.query<ToggleFavouriteResponse>(
          TOGGLE_FAVOURITE_MUTATION,
          variables,
          { cache: null },
        );

        anilistClient.clearCache();

        // Check if entity is now in favourites (added) or absent (removed)
        const field = FAVOURITE_FIELD_MAP[args.type];
        const isFavourited = data.ToggleFavourite[field].nodes.some(
          (n) => n.id === args.id,
        );
        const label = args.type.toLowerCase();

        return isFavourited
          ? `Added ${label} ${args.id} to favourites.`
          : `Removed ${label} ${args.id} from favourites.`;
      } catch (error) {
        return throwToolError(error, "toggling favourite");
      }
    },
  });

  // === Post Activity ===

  server.addTool({
    name: "anilist_activity",
    description:
      "Post a text activity to your AniList feed. " +
      "Use when the user wants to share a status update, thought, or message. " +
      "Requires ANILIST_TOKEN.",
    parameters: PostActivityInputSchema,
    annotations: {
      title: "Post Activity",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const data = await anilistClient.query<SaveTextActivityResponse>(
          SAVE_TEXT_ACTIVITY_MUTATION,
          { text: args.text },
          { cache: null },
        );

        anilistClient.clearCache();

        const activity = data.SaveTextActivity;
        const dateStr = new Date(activity.createdAt * 1000).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric" },
        );

        return [
          `Activity posted.`,
          `By: ${activity.user.name}`,
          `Date: ${dateStr}`,
          `Activity ID: ${activity.id}`,
        ].join("\n");
      } catch (error) {
        return throwToolError(error, "posting activity");
      }
    },
  });
}

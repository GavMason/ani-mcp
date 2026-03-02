/** Write tools: update progress, add to list, rate, and delete entries. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  SAVE_MEDIA_LIST_ENTRY_MUTATION,
  DELETE_MEDIA_LIST_ENTRY_MUTATION,
} from "../api/queries.js";
import {
  UpdateProgressInputSchema,
  AddToListInputSchema,
  RateInputSchema,
  DeleteFromListInputSchema,
} from "../schemas.js";
import type {
  SaveMediaListEntryResponse,
  DeleteMediaListEntryResponse,
} from "../types.js";
import { throwToolError } from "../utils.js";

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
      "or wants to record how far they are. Requires ANILIST_TOKEN.",
    parameters: UpdateProgressInputSchema,
    annotations: {
      title: "Update Progress",
      readOnlyHint: false,
      destructiveHint: false,
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
      "or mark a title as completed. Requires ANILIST_TOKEN.",
    parameters: AddToListInputSchema,
    annotations: {
      title: "Add to List",
      readOnlyHint: false,
      destructiveHint: false,
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
        if (args.score !== undefined) variables.score = args.score;

        const data = await anilistClient.query<SaveMediaListEntryResponse>(
          SAVE_MEDIA_LIST_ENTRY_MUTATION,
          variables,
          { cache: null },
        );

        anilistClient.clearCache();

        const entry = data.SaveMediaListEntry;
        const scoreStr = entry.score > 0 ? ` | Score: ${entry.score}/10` : "";
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
      "Use when the user wants to give a rating (0-10). " +
      "Use 0 to remove an existing score. Requires ANILIST_TOKEN.",
    parameters: RateInputSchema,
    annotations: {
      title: "Rate Title",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const data = await anilistClient.query<SaveMediaListEntryResponse>(
          SAVE_MEDIA_LIST_ENTRY_MUTATION,
          { mediaId: args.mediaId, score: args.score },
          { cache: null },
        );

        anilistClient.clearCache();

        const entry = data.SaveMediaListEntry;
        const scoreDisplay =
          args.score === 0
            ? "Score removed."
            : `Score set to ${entry.score}/10.`;
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
}

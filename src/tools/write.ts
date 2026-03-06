/** Write tools: list mutations, favourites, activity, undo, batch, and unscored. */

import type { FastMCP } from "fastmcp";
import { anilistClient } from "../api/client.js";
import {
  SAVE_MEDIA_LIST_ENTRY_MUTATION,
  DELETE_MEDIA_LIST_ENTRY_MUTATION,
  TOGGLE_FAVOURITE_MUTATION,
  SAVE_TEXT_ACTIVITY_MUTATION,
  VIEWER_QUERY,
  MEDIA_LIST_ENTRY_QUERY,
} from "../api/queries.js";
import type { EntrySnapshot } from "../engine/undo.js";
import { pushUndo, popUndo } from "../engine/undo.js";
import { invalidateUserProfiles } from "../engine/profile-cache.js";
import {
  UpdateProgressInputSchema,
  AddToListInputSchema,
  RateInputSchema,
  DeleteFromListInputSchema,
  FavouriteInputSchema,
  PostActivityInputSchema,
  UndoInputSchema,
  UnscoredInputSchema,
  BatchUpdateInputSchema,
} from "../schemas.js";
import type {
  SaveMediaListEntryResponse,
  DeleteMediaListEntryResponse,
  ToggleFavouriteResponse,
  SaveTextActivityResponse,
  ViewerResponse,
  MediaListEntryResponse,
} from "../types.js";
import {
  throwToolError,
  formatScore,
  getScoreFormat,
  getTitle,
  getDefaultUsername,
} from "../utils.js";

// === Auth Guard ===

/** Guard against unauthenticated write attempts */
function requireAuth(): void {
  if (!process.env.ANILIST_TOKEN) {
    throw new Error(
      "ANILIST_TOKEN is not set. Write operations require an authenticated AniList account.",
    );
  }
}

// === Undo Helpers ===

/** Get the authenticated user's username */
async function getViewerName(): Promise<string> {
  const data = await anilistClient.query<ViewerResponse>(
    VIEWER_QUERY,
    {},
    { cache: "stats" },
  );
  return data.Viewer.name;
}

/** Snapshot a list entry before mutation */
async function snapshotByMediaId(
  mediaId: number,
): Promise<EntrySnapshot | null> {
  const userName = await getViewerName();
  const data = await anilistClient.query<MediaListEntryResponse>(
    MEDIA_LIST_ENTRY_QUERY,
    { mediaId, userName },
    { cache: null },
  );
  return data.MediaList ?? null;
}

/** Snapshot a list entry by its entry ID */
async function snapshotByEntryId(
  entryId: number,
): Promise<EntrySnapshot | null> {
  const data = await anilistClient.query<MediaListEntryResponse>(
    MEDIA_LIST_ENTRY_QUERY,
    { id: entryId },
    { cache: null },
  );
  return data.MediaList ?? null;
}

/** Format an undo hint for output */
function undoHint(before: EntrySnapshot | null): string {
  if (!before) return '(New entry - say "undo" to remove)';
  const parts = [before.status];
  if (before.progress > 0) parts.push(`progress ${before.progress}`);
  if (before.score > 0) parts.push(`score ${before.score}`);
  return `(Previous: ${parts.join(", ")} - say "undo" to revert)`;
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

        // Snapshot before mutation
        const before = await snapshotByMediaId(args.mediaId);

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

        const viewerName = await getViewerName();
        anilistClient.invalidateUser(viewerName);
        invalidateUserProfiles(viewerName);

        const entry = data.SaveMediaListEntry;

        // Track for undo
        pushUndo({
          operation: before
            ? { type: "update", before }
            : { type: "create", entryId: entry.id, mediaId: args.mediaId },
          toolName: "anilist_update_progress",
          timestamp: Date.now(),
          description: `Set progress to ${args.progress} on media ${args.mediaId}`,
        });

        return [
          `Progress updated.`,
          `Status: ${entry.status}`,
          `Progress: ${entry.progress}`,
          `Entry ID: ${entry.id}`,
          undoHint(before),
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

        // Snapshot before mutation
        const before = await snapshotByMediaId(args.mediaId);

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
          getScoreFormat(),
        ]);

        const viewerName = await getViewerName();
        anilistClient.invalidateUser(viewerName);
        invalidateUserProfiles(viewerName);

        const entry = data.SaveMediaListEntry;

        // Track for undo
        pushUndo({
          operation: before
            ? { type: "update", before }
            : { type: "create", entryId: entry.id, mediaId: args.mediaId },
          toolName: "anilist_add_to_list",
          timestamp: Date.now(),
          description: `Set status to ${args.status} on media ${args.mediaId}`,
        });

        const scoreStr =
          entry.score > 0
            ? ` | Score: ${formatScore(entry.score, scoreFmt)}`
            : "";
        return [
          `Added to list.`,
          `Status: ${entry.status}${scoreStr}`,
          `Entry ID: ${entry.id}`,
          undoHint(before),
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

        // Snapshot before mutation
        const before = await snapshotByMediaId(args.mediaId);

        const [data, scoreFmt] = await Promise.all([
          anilistClient.query<SaveMediaListEntryResponse>(
            SAVE_MEDIA_LIST_ENTRY_MUTATION,
            { mediaId: args.mediaId, scoreRaw: Math.round(args.score * 10) },
            { cache: null },
          ),
          getScoreFormat(),
        ]);

        const viewerName = await getViewerName();
        anilistClient.invalidateUser(viewerName);
        invalidateUserProfiles(viewerName);

        const entry = data.SaveMediaListEntry;

        // Track for undo
        if (before) {
          pushUndo({
            operation: { type: "update", before },
            toolName: "anilist_rate",
            timestamp: Date.now(),
            description: `Set score to ${args.score} on media ${args.mediaId}`,
          });
        }

        const scoreDisplay =
          args.score === 0
            ? "Score removed."
            : `Score set to ${formatScore(entry.score, scoreFmt)}.`;
        const lines = [scoreDisplay, `Entry ID: ${entry.id}`];
        if (before) lines.push(undoHint(before));
        return lines.join("\n");
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
      "Pass either a list entry ID or a media ID. " +
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

        // Resolve mediaId to entryId if needed
        let entryId = args.entryId;
        if (!entryId && args.mediaId) {
          const snapshot = await snapshotByMediaId(args.mediaId);
          if (!snapshot) {
            return `Media ${args.mediaId} is not on your list.`;
          }
          entryId = snapshot.id;
        }

        if (!entryId) {
          return "Provide either an entryId or a mediaId.";
        }

        // Snapshot before deletion
        const before = await snapshotByEntryId(entryId);

        const data = await anilistClient.query<DeleteMediaListEntryResponse>(
          DELETE_MEDIA_LIST_ENTRY_MUTATION,
          { id: entryId },
          { cache: null },
        );

        const viewerName = await getViewerName();
        anilistClient.invalidateUser(viewerName);
        invalidateUserProfiles(viewerName);

        if (!data.DeleteMediaListEntry.deleted) {
          return `Entry ${entryId} was not found or already removed.`;
        }

        // Track for undo
        if (before) {
          pushUndo({
            operation: { type: "delete", before },
            toolName: "anilist_delete_from_list",
            timestamp: Date.now(),
            description: `Deleted entry ${entryId} (media ${before.mediaId})`,
          });
        }

        const hint = before
          ? `\n(Deleted ${before.status} entry - say "undo" to restore)`
          : "";
        return `Entry ${entryId} deleted from your list.${hint}`;
      } catch (error) {
        return throwToolError(error, "deleting from list");
      }
    },
  });

  // === Undo ===

  server.addTool({
    name: "anilist_undo",
    description:
      "Undo the last write operation (update progress, add to list, rate, delete, or batch update). " +
      "Restores the previous state of the affected list entry. " +
      "Requires ANILIST_TOKEN.",
    parameters: UndoInputSchema,
    annotations: {
      title: "Undo",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        requireAuth();

        const record = popUndo();
        if (!record) return "Nothing to undo.";

        const op = record.operation;

        if (op.type === "update") {
          // Restore previous entry state
          await anilistClient.query<SaveMediaListEntryResponse>(
            SAVE_MEDIA_LIST_ENTRY_MUTATION,
            {
              mediaId: op.before.mediaId,
              status: op.before.status,
              scoreRaw: op.before.score * 10,
              progress: op.before.progress,
            },
            { cache: null },
          );
          const viewerName = await getViewerName();
          anilistClient.invalidateUser(viewerName);
          invalidateUserProfiles(viewerName);
          return `Undone: restored media ${op.before.mediaId} to ${op.before.status}, progress ${op.before.progress}, score ${op.before.score}.`;
        }

        if (op.type === "create") {
          // Delete the newly created entry
          await anilistClient.query<DeleteMediaListEntryResponse>(
            DELETE_MEDIA_LIST_ENTRY_MUTATION,
            { id: op.entryId },
            { cache: null },
          );
          const viewerName = await getViewerName();
          anilistClient.invalidateUser(viewerName);
          invalidateUserProfiles(viewerName);
          return `Undone: removed media ${op.mediaId} from your list.`;
        }

        if (op.type === "delete") {
          // Re-create the deleted entry
          await anilistClient.query<SaveMediaListEntryResponse>(
            SAVE_MEDIA_LIST_ENTRY_MUTATION,
            {
              mediaId: op.before.mediaId,
              status: op.before.status,
              scoreRaw: op.before.score * 10,
              progress: op.before.progress,
            },
            { cache: null },
          );
          const viewerName = await getViewerName();
          anilistClient.invalidateUser(viewerName);
          invalidateUserProfiles(viewerName);
          return `Undone: restored media ${op.before.mediaId} to ${op.before.status}, progress ${op.before.progress}.`;
        }

        if (op.type === "batch") {
          // Restore all entries in the batch
          let restored = 0;
          for (const item of op.entries) {
            try {
              await anilistClient.query<SaveMediaListEntryResponse>(
                SAVE_MEDIA_LIST_ENTRY_MUTATION,
                {
                  mediaId: item.before.mediaId,
                  status: item.before.status,
                  scoreRaw: item.before.score * 10,
                  progress: item.before.progress,
                },
                { cache: null },
              );
              restored++;
            } catch {
              // Continue on individual failures
            }
          }
          const viewerName = await getViewerName();
          anilistClient.invalidateUser(viewerName);
          invalidateUserProfiles(viewerName);
          return `Undone: restored ${restored}/${op.entries.length} entries to their previous state.`;
        }

        return "Unknown undo operation type.";
      } catch (error) {
        return throwToolError(error, "undoing operation");
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

        anilistClient.invalidateUser(await getViewerName());

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

        anilistClient.invalidateUser(await getViewerName());

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

  // === Unscored Listing ===

  server.addTool({
    name: "anilist_unscored",
    description:
      "List completed anime or manga that haven't been scored yet. " +
      "Use when the user wants to catch up on scoring, find unrated titles, " +
      "or do a batch scoring session. Returns titles sorted by most recently completed.",
    parameters: UnscoredInputSchema,
    annotations: {
      title: "Unscored Titles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        const username = getDefaultUsername(args.username);
        const entries = await anilistClient.fetchList(
          username,
          args.type,
          "COMPLETED",
        );

        // Filter to unscored, sort by most recently completed
        const unscored = entries
          .filter((e) => e.score === 0)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, args.limit);

        if (unscored.length === 0) {
          const total = entries.length;
          return `All ${total} completed ${args.type.toLowerCase()} titles are scored.`;
        }

        const totalUnscored = entries.filter((e) => e.score === 0).length;
        const lines: string[] = [
          `# Unscored ${args.type.toLowerCase()} for ${username}`,
          "",
          `${totalUnscored} completed but unscored (showing ${unscored.length}).`,
          "",
        ];

        for (const e of unscored) {
          const title = getTitle(e.media.title);
          const format = e.media.format ?? "?";
          const community =
            e.media.meanScore != null
              ? ` - Community: ${e.media.meanScore}`
              : "";
          const genres =
            e.media.genres.length > 0
              ? `  Genres: ${e.media.genres.join(", ")}`
              : "";
          lines.push(`${title} (${format})${community}`);
          if (genres) lines.push(genres);
          lines.push(`  Media ID: ${e.media.id}`);
        }

        lines.push(
          "",
          "Use anilist_rate with the media ID to score each title.",
        );

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "listing unscored titles");
      }
    },
  });

  // === Batch Update ===

  server.addTool({
    name: "anilist_batch_update",
    description:
      "Apply a bulk action to multiple list entries matching a filter. " +
      "Use when the user wants to move all low-scored titles to Dropped, " +
      "add all planning titles to current, or bulk-change statuses. " +
      "Defaults to dry-run mode (preview only). Requires ANILIST_TOKEN.",
    parameters: BatchUpdateInputSchema,
    annotations: {
      title: "Batch Update",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args) => {
      try {
        requireAuth();

        const username = getDefaultUsername(args.username);

        // Fetch entries, optionally filtering by status
        const entries = await anilistClient.fetchList(
          username,
          args.type,
          args.filter.status,
        );

        // Apply client-side filters
        let matched = entries;
        const { scoreBelow, scoreAbove } = args.filter;
        if (scoreBelow !== undefined) {
          matched = matched.filter((e) => e.score > 0 && e.score < scoreBelow);
        }
        if (scoreAbove !== undefined) {
          matched = matched.filter((e) => e.score > 0 && e.score > scoreAbove);
        }
        if (args.filter.unscored) {
          matched = matched.filter((e) => e.score === 0);
        }

        // Cap at limit
        matched = matched.slice(0, args.limit);

        if (matched.length === 0) {
          return "No entries match the specified filter.";
        }

        // Build action description
        const actionParts: string[] = [];
        if (args.action.setStatus)
          actionParts.push(`status -> ${args.action.setStatus}`);
        if (args.action.setScore !== undefined)
          actionParts.push(`score -> ${args.action.setScore}`);
        const actionStr = actionParts.join(", ");

        if (args.dryRun) {
          // Preview mode
          const lines: string[] = [
            `# Batch Update Preview`,
            "",
            `Action: ${actionStr}`,
            `Matched: ${matched.length} entries`,
            "",
          ];

          for (const e of matched.slice(0, 20)) {
            const title = getTitle(e.media.title);
            const format = e.media.format ?? "?";
            const score = e.score > 0 ? `, score ${e.score}` : "";
            lines.push(`  ${title} (${format}) - ${e.status}${score}`);
          }

          if (matched.length > 20) {
            lines.push(`  ... and ${matched.length - 20} more`);
          }

          lines.push("", "Run again with dryRun: false to apply.");

          return lines.join("\n");
        }

        // Execute mutations
        const snapshots: Array<{ before: EntrySnapshot }> = [];
        let successes = 0;
        let failures = 0;

        for (const e of matched) {
          try {
            // Snapshot before mutation
            const before: EntrySnapshot = {
              id: e.id,
              mediaId: e.media.id,
              status: e.status,
              score: e.score,
              progress: e.progress,
              notes: e.notes,
              private: false,
            };

            const vars: Record<string, unknown> = { mediaId: e.media.id };
            if (args.action.setStatus) vars.status = args.action.setStatus;
            if (args.action.setScore !== undefined)
              vars.scoreRaw = Math.round(args.action.setScore * 10);

            await anilistClient.query<SaveMediaListEntryResponse>(
              SAVE_MEDIA_LIST_ENTRY_MUTATION,
              vars,
              { cache: null },
            );

            snapshots.push({ before });
            successes++;
          } catch {
            failures++;
          }
        }

        const viewerName = await getViewerName();
        anilistClient.invalidateUser(viewerName);
        invalidateUserProfiles(viewerName);

        // Track batch for undo
        if (snapshots.length > 0) {
          pushUndo({
            operation: { type: "batch", entries: snapshots },
            toolName: "anilist_batch_update",
            timestamp: Date.now(),
            description: `Batch: ${actionStr} on ${snapshots.length} entries`,
          });
        }

        const lines: string[] = [
          `# Batch Update Complete`,
          "",
          `Updated ${successes} of ${matched.length} entries (${actionStr}).`,
        ];
        if (failures > 0) lines.push(`${failures} entries failed.`);
        if (snapshots.length > 0)
          lines.push(`Say "undo" to revert all ${snapshots.length} changes.`);

        return lines.join("\n");
      } catch (error) {
        return throwToolError(error, "batch updating entries");
      }
    },
  });
}

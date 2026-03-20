/** Session-scoped undo stack for write operations. */

import { MAX_UNDO } from "../constants.js";

// === Types ===

export interface EntrySnapshot {
  id: number;
  mediaId: number;
  status: string;
  score: number;
  progress: number;
  progressVolumes: number;
  notes: string | null;
  private: boolean;
}

export type UndoOperation =
  | { type: "update"; before: EntrySnapshot }
  | { type: "create"; entryId: number; mediaId: number }
  | { type: "delete"; before: EntrySnapshot }
  | { type: "batch"; entries: Array<{ before: EntrySnapshot }> };

export interface UndoRecord {
  operation: UndoOperation;
  toolName: string;
  timestamp: number;
  description: string;
}

// === Stack ===

const stack: UndoRecord[] = [];

/** Push a record onto the undo stack, trimming oldest if full */
export function pushUndo(record: UndoRecord): void {
  stack.push(record);
  while (stack.length > MAX_UNDO) stack.shift();
}

/** Pop the most recent undo record */
export function popUndo(): UndoRecord | undefined {
  return stack.pop();
}

/** Inspect the most recent record without removing */
export function peekUndo(): UndoRecord | undefined {
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** Current stack depth */
export function undoStackSize(): number {
  return stack.length;
}

/** Clear all undo records */
export function clearUndoStack(): void {
  stack.length = 0;
}

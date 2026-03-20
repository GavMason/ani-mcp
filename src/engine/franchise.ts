/** Franchise graph traversal for watch order guidance. */

import { MAX_DEPTH } from "../constants.js";

/** Single entry in a franchise watch order */
export interface FranchiseEntry {
  id: number;
  title: string;
  format: string | null;
  status: string | null;
  type: "main" | "special";
}

/** Media entry with its relations */
export interface RelationNode {
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
      };
    }>;
  };
}

// Main formats in a franchise timeline
const MAIN_FORMATS = new Set(["TV", "MOVIE", "ONA", "TV_SHORT"]);


/** Find the earliest entry by following PREQUEL edges backward */
function findRoot(
  startId: number,
  relationsMap: Map<number, RelationNode>,
): number {
  let current = startId;
  const visited = new Set<number>();

  while (true) {
    visited.add(current);
    const node = relationsMap.get(current);
    if (!node) break;

    const prequel = node.relations.edges.find(
      (e) => e.relationType === "PREQUEL" && !visited.has(e.node.id),
    );
    if (!prequel) break;
    current = prequel.node.id;
  }

  return current;
}

/** Resolve format/status for a node from the map or from relation edges */
function resolveNodeInfo(
  id: number,
  relationsMap: Map<number, RelationNode>,
): { format: string | null; status: string | null } {
  // Direct lookup
  const node = relationsMap.get(id);
  if (node) return { format: node.format, status: node.status };

  // Fallback: scan relation edges from other nodes
  for (const n of relationsMap.values()) {
    for (const edge of n.relations.edges) {
      if (edge.node.id === id) {
        return { format: edge.node.format, status: edge.node.status };
      }
    }
  }
  return { format: null, status: null };
}

/** Result of building a franchise watch order */
export interface WatchOrderResult {
  entries: FranchiseEntry[];
  truncated: boolean;
}

/** Build a watch order by following SEQUEL edges from the franchise root */
export function buildWatchOrder(
  startId: number,
  relationsMap: Map<number, RelationNode>,
  includeSpecials: boolean,
): WatchOrderResult {
  const rootId = findRoot(startId, relationsMap);
  const entries: FranchiseEntry[] = [];
  const visited = new Set<number>();

  // BFS through sequel and side-story edges
  const queue: number[] = [rootId];
  let depth = 0;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const id = queue.shift();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    depth++;

    const node = relationsMap.get(id);
    const title = node
      ? (node.title.english ?? node.title.romaji ?? "Unknown")
      : "Unknown";
    const { format, status } = resolveNodeInfo(id, relationsMap);
    const isMain = MAIN_FORMATS.has(format ?? "");

    if (isMain || includeSpecials) {
      entries.push({
        id,
        title,
        format,
        status,
        type: isMain ? "main" : "special",
      });
    }

    if (!node) continue;

    // Collect sequels and side stories
    const sequels: number[] = [];
    const sides: number[] = [];

    for (const edge of node.relations.edges) {
      if (visited.has(edge.node.id)) continue;
      if (edge.relationType === "SEQUEL") {
        sequels.push(edge.node.id);
      } else if (
        includeSpecials &&
        (edge.relationType === "SIDE_STORY" || edge.relationType === "SPIN_OFF")
      ) {
        sides.push(edge.node.id);
      }
    }

    // Side stories appear after their parent, before the next sequel
    queue.push(...sides, ...sequels);
  }

  const truncated = queue.length > 0 && depth >= MAX_DEPTH;
  return { entries, truncated };
}

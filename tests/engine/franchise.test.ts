/** Unit tests for franchise watch order engine */

import { describe, it, expect } from "vitest";
import { buildWatchOrder, type RelationNode } from "../../src/engine/franchise.js";

// Helper to build a relations map from node definitions
function makeMap(
  nodes: Array<{
    id: number;
    title: string;
    format: string;
    status?: string;
    edges: Array<{ type: string; targetId: number; title: string; format: string; status?: string }>;
  }>,
): Map<number, RelationNode> {
  const map = new Map<number, RelationNode>();
  for (const n of nodes) {
    map.set(n.id, {
      id: n.id,
      title: { romaji: n.title, english: n.title },
      format: n.format,
      status: n.status ?? "FINISHED",
      relations: {
        edges: n.edges.map((e) => ({
          relationType: e.type,
          node: {
            id: e.targetId,
            title: { romaji: e.title, english: e.title },
            format: e.format,
            status: e.status ?? "FINISHED",
            type: "ANIME",
          },
        })),
      },
    });
  }
  return map;
}

describe("buildWatchOrder", () => {
  it("orders a simple prequel-sequel chain", () => {
    // A -> B -> C (each points SEQUEL forward, PREQUEL backward)
    const map = makeMap([
      { id: 1, title: "Part 1", format: "TV", edges: [{ type: "SEQUEL", targetId: 2, title: "Part 2", format: "TV" }] },
      { id: 2, title: "Part 2", format: "TV", edges: [
        { type: "PREQUEL", targetId: 1, title: "Part 1", format: "TV" },
        { type: "SEQUEL", targetId: 3, title: "Part 3", format: "TV" },
      ]},
      { id: 3, title: "Part 3", format: "TV", edges: [{ type: "PREQUEL", targetId: 2, title: "Part 2", format: "TV" }] },
    ]);

    const { entries } = buildWatchOrder(3, map, false);

    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe(1);
    expect(entries[1].id).toBe(2);
    expect(entries[2].id).toBe(3);
    expect(entries[0].title).toBe("Part 1");
  });

  it("finds root when starting from middle of chain", () => {
    const map = makeMap([
      { id: 1, title: "First", format: "TV", edges: [{ type: "SEQUEL", targetId: 2, title: "Second", format: "TV" }] },
      { id: 2, title: "Second", format: "TV", edges: [
        { type: "PREQUEL", targetId: 1, title: "First", format: "TV" },
        { type: "SEQUEL", targetId: 3, title: "Third", format: "TV" },
      ]},
      { id: 3, title: "Third", format: "TV", edges: [{ type: "PREQUEL", targetId: 2, title: "Second", format: "TV" }] },
    ]);

    const { entries } = buildWatchOrder(2, map, false);

    expect(entries[0].id).toBe(1);
    expect(entries).toHaveLength(3);
  });

  it("excludes non-main formats by default", () => {
    const map = makeMap([
      { id: 1, title: "Main", format: "TV", edges: [
        { type: "SEQUEL", targetId: 2, title: "OVA", format: "OVA" },
        { type: "SEQUEL", targetId: 3, title: "Season 2", format: "TV" },
      ]},
      { id: 2, title: "OVA", format: "OVA", edges: [{ type: "PREQUEL", targetId: 1, title: "Main", format: "TV" }] },
      { id: 3, title: "Season 2", format: "TV", edges: [{ type: "PREQUEL", targetId: 1, title: "Main", format: "TV" }] },
    ]);

    const { entries } = buildWatchOrder(1, map, false);

    expect(entries.every((e) => e.format === "TV")).toBe(true);
    expect(entries.find((e) => e.title === "OVA")).toBeUndefined();
  });

  it("includes specials when requested", () => {
    const map = makeMap([
      { id: 1, title: "Main", format: "TV", edges: [
        { type: "SIDE_STORY", targetId: 2, title: "Special", format: "OVA" },
        { type: "SEQUEL", targetId: 3, title: "Season 2", format: "TV" },
      ]},
      { id: 2, title: "Special", format: "OVA", edges: [{ type: "PARENT", targetId: 1, title: "Main", format: "TV" }] },
      { id: 3, title: "Season 2", format: "TV", edges: [{ type: "PREQUEL", targetId: 1, title: "Main", format: "TV" }] },
    ]);

    const { entries } = buildWatchOrder(1, map, true);

    expect(entries).toHaveLength(3);
    // Special should appear between Main and Season 2
    expect(entries[0].title).toBe("Main");
    expect(entries[1].title).toBe("Special");
    expect(entries[1].type).toBe("special");
    expect(entries[2].title).toBe("Season 2");
  });

  it("handles a standalone title with no relations", () => {
    const map = makeMap([
      { id: 1, title: "Standalone", format: "MOVIE", edges: [] },
    ]);

    const { entries, truncated } = buildWatchOrder(1, map, false);

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Standalone");
    expect(entries[0].format).toBe("MOVIE");
    expect(truncated).toBe(false);
  });

  it("prevents cycles in the graph", () => {
    // Circular: 1 -> 2 -> 3 -> 1
    const map = makeMap([
      { id: 1, title: "A", format: "TV", edges: [{ type: "SEQUEL", targetId: 2, title: "B", format: "TV" }] },
      { id: 2, title: "B", format: "TV", edges: [{ type: "SEQUEL", targetId: 3, title: "C", format: "TV" }] },
      { id: 3, title: "C", format: "TV", edges: [{ type: "SEQUEL", targetId: 1, title: "A", format: "TV" }] },
    ]);

    const { entries } = buildWatchOrder(1, map, false);

    // Should not loop forever, should visit each once
    expect(entries).toHaveLength(3);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("reports truncation when depth limit is reached", () => {
    // Build a chain of 35 nodes (MAX_DEPTH=30)
    const nodes = Array.from({ length: 35 }, (_, i) => ({
      id: i + 1,
      title: `Part ${i + 1}`,
      format: "TV",
      edges: i < 34
        ? [{ type: "SEQUEL", targetId: i + 2, title: `Part ${i + 2}`, format: "TV" }]
        : [],
    }));
    // Add PREQUEL edges
    for (let i = 1; i < 35; i++) {
      nodes[i].edges.push({
        type: "PREQUEL",
        targetId: i,
        title: `Part ${i}`,
        format: "TV",
      });
    }

    const map = makeMap(nodes);
    const { entries, truncated } = buildWatchOrder(1, map, false);

    expect(entries).toHaveLength(30);
    expect(truncated).toBe(true);
  });
});

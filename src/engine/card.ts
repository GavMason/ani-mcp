/** Generates shareable SVG cards for taste profiles and compatibility comparisons */

import sharp from "sharp";
import type { TasteProfile, WeightedItem, FormatBreakdown } from "./taste.js";

// === Constants ===

const CARD_WIDTH = 800;
const CARD_HEIGHT = 560;

// Brand palette (from assets/icon.svg)
const BRAND_BLUE = "#02A9FF";
const BRAND_BLUE_DARK = "#0284C7";
const BG_DARK = "#0f1923";
const BG_CARD = "#152232";
const TEXT_PRIMARY = "#f0f4f8";
const TEXT_SECONDARY = "#8899aa";
const TEXT_DIM = "#5c7080";
const BAR_BG = "#1e3044";
const GLOW_BLUE = "#02A9FF";

// Color cycle for charts
const PALETTE = [
  "#02A9FF",
  "#06d6a0",
  "#ffd166",
  "#ef476f",
  "#118ab2",
  "#8338ec",
];

// === Avatar ===

/** Fetch an image URL and return a base64 data URI, or null on failure */
export async function fetchAvatarB64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Circular avatar or initial-letter fallback
function avatarCircle(
  cx: number,
  cy: number,
  r: number,
  username: string,
  b64: string | null,
  color: string,
): string {
  const clipId = `av-${cx}-${cy}`;
  if (b64) {
    return [
      `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`,
      `<image x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" href="${b64}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.7"/>`,
    ].join("\n");
  }
  // Fallback: colored circle with initial
  const initial = username.charAt(0).toUpperCase();
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.15"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>`,
    `<text x="${cx}" y="${cy + r * 0.36}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${r}" font-weight="600" fill="${color}" opacity="0.9">${initial}</text>`,
  ].join("\n");
}

// === Watermark ===

function watermark(cardW: number, cardH: number): string {
  const x = cardW - 20;
  const y = cardH - 12;
  return `<text x="${x}" y="${y}" text-anchor="end" font-family="system-ui, sans-serif" font-size="9" letter-spacing="1.5" font-weight="600" fill="${BRAND_BLUE}" opacity="0.5">ANI-MCP</text>`;
}

// === Taste Profile Card ===

/** Build an SVG taste profile card */
export function buildTasteCardSvg(
  username: string,
  profile: TasteProfile,
  avatarB64: string | null = null,
): string {
  const genres = profile.genres.slice(0, 6);
  const tags = profile.themes.slice(0, 5);
  const formats = profile.formats.slice(0, 6);
  const { scoring } = profile;

  const parts: string[] = [
    svgHeader(CARD_WIDTH, CARD_HEIGHT),
    dotGrid(CARD_WIDTH, CARD_HEIGHT),
    background(CARD_WIDTH, CARD_HEIGHT),

    // Decorative glows
    glowCircle(680, 60, 120, GLOW_BLUE, 0.06),
    glowCircle(100, 480, 160, GLOW_BLUE, 0.04),

    // Avatar + username
    avatarCircle(42, 38, 18, username, avatarB64, BRAND_BLUE),
    text(username, 70, 34, 22, TEXT_PRIMARY, "700"),
    text("Taste Profile", 70, 50, 10, TEXT_DIM, "500"),
    `<rect x="40" y="62" width="${CARD_WIDTH - 80}" height="1" fill="${BRAND_BLUE}" opacity="0.15"/>`,

    // Stats row
    ...statRow(40, 74, [
      { label: "Completed", value: String(profile.totalCompleted) },
      { label: "Mean Score", value: scoring.meanScore.toFixed(1) },
      { label: "Scoring", value: capitalize(scoring.tendency) },
      { label: "Median", value: String(scoring.median) },
    ]),

    // Radar chart (left)
    sectionLabel("Genres", 40, 162),
    radarChart(200, 290, 100, genres),

    // Tags (right column)
    sectionLabel("Top Themes", 430, 162),
    ...tagList(tags, 430, 184),

    // Score distribution (bottom left)
    sectionLabel("Scores", 40, 420),
    ...scoreHistogram(scoring.distribution, 40, 438, 340, 52),

    // Format breakdown (bottom right)
    sectionLabel("Formats", 430, 420),
    ...formatBar(formats, 430, 440, 330),

    // Watermark
    watermark(CARD_WIDTH, CARD_HEIGHT),

    svgFooter(),
  ];

  return parts.join("\n");
}

// === Compatibility Card ===

export interface CompatCardData {
  user1: string;
  user2: string;
  compatibility: number;
  sharedCount: number;
  sharedFavorites: Array<{ title: string; score1: number; score2: number }>;
  divergences: string[];
  profile1: TasteProfile;
  profile2: TasteProfile;
  avatar1?: string | null;
  avatar2?: string | null;
}

/** Build an SVG compatibility comparison card */
export function buildCompatCardSvg(data: CompatCardData): string {
  const topGenres1 = data.profile1.genres.slice(0, 5);
  const topGenres2 = data.profile2.genres.slice(0, 5);

  const parts: string[] = [
    svgHeader(CARD_WIDTH, CARD_HEIGHT),
    dotGrid(CARD_WIDTH, CARD_HEIGHT),
    background(CARD_WIDTH, CARD_HEIGHT),

    // Decorative glows
    glowCircle(CARD_WIDTH / 2, 140, 200, GLOW_BLUE, 0.05),
    glowCircle(60, 520, 140, "#06d6a0", 0.04),
    glowCircle(740, 520, 140, "#ef476f", 0.04),

    // Avatars flanking the title
    avatarCircle(110, 38, 20, data.user1, data.avatar1 ?? null, BRAND_BLUE),
    avatarCircle(
      CARD_WIDTH - 110,
      38,
      20,
      data.user2,
      data.avatar2 ?? null,
      "#06d6a0",
    ),

    // Title
    text(
      `${escapeXml(data.user1)}  vs  ${escapeXml(data.user2)}`,
      CARD_WIDTH / 2,
      46,
      24,
      TEXT_PRIMARY,
      "800",
      "middle",
    ),

    `<rect x="40" y="66" width="${CARD_WIDTH - 80}" height="1" fill="${BRAND_BLUE}" opacity="0.15"/>`,

    // Compatibility ring
    compatRing(CARD_WIDTH / 2, 140, data.compatibility),
    text(
      `${data.sharedCount} shared titles`,
      CARD_WIDTH / 2,
      216,
      12,
      TEXT_SECONDARY,
      "normal",
      "middle",
    ),

    // Genre comparison columns
    sectionLabel(data.user1, 40, 240),
    ...genreBars(topGenres1, 40, 258, 340, BRAND_BLUE),

    sectionLabel(data.user2, 430, 240),
    ...genreBars(topGenres2, 430, 258, 340, "#06d6a0"),

    // Divider line
    `<line x1="${CARD_WIDTH / 2}" y1="232" x2="${CARD_WIDTH / 2}" y2="395" stroke="${BAR_BG}" stroke-width="1"/>`,

    // Shared favorites
    sectionLabel("Shared Favorites", 40, 420),
    ...sharedFavoritesList(
      data.sharedFavorites.slice(0, 3),
      40,
      440,
      data.user1,
      data.user2,
    ),

    // Divergences
    sectionLabel("Key Differences", 430, 420),
    ...divergenceList(data.divergences.slice(0, 3), 430, 442, data.user1),

    // Watermark
    watermark(CARD_WIDTH, CARD_HEIGHT),

    svgFooter(),
  ];

  return parts.join("\n");
}

// === SVG to PNG ===

/** Render an SVG string to a PNG buffer */
export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// === SVG Primitives ===

function svgHeader(w: number, h: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `  <linearGradient id="bgGrad" x1="0" y1="0" x2="0.4" y2="1">`,
    `    <stop offset="0%" stop-color="${BG_DARK}"/>`,
    `    <stop offset="100%" stop-color="${BG_CARD}"/>`,
    `  </linearGradient>`,
    `  <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">`,
    `    <stop offset="0%" stop-color="${BRAND_BLUE}"/>`,
    `    <stop offset="100%" stop-color="${BRAND_BLUE_DARK}"/>`,
    `  </linearGradient>`,
    `  <filter id="glow"><feGaussianBlur stdDeviation="20" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    `  <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">`,
    `    <circle cx="2" cy="2" r="0.8" fill="white" opacity="0.06"/>`,
    `  </pattern>`,
    `</defs>`,
  ].join("\n");
}

function svgFooter(): string {
  return `</svg>`;
}

function dotGrid(w: number, h: number): string {
  return `<rect width="${w}" height="${h}" rx="20" fill="url(#dots)"/>`;
}

function background(w: number, h: number): string {
  return [
    `<rect width="${w}" height="${h}" rx="20" fill="url(#bgGrad)"/>`,
    // Dot grid overlay
    `<rect width="${w}" height="${h}" rx="20" fill="url(#dots)"/>`,
    // Border
    `<rect width="${w}" height="${h}" rx="20" fill="none" stroke="${BRAND_BLUE}" stroke-opacity="0.12"/>`,
  ].join("\n");
}

function glowCircle(
  cx: number,
  cy: number,
  r: number,
  color: string,
  opacity: number,
): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#glow)"/>`;
}

function text(
  content: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  weight = "normal",
  anchor = "start",
): string {
  const escaped = escapeXml(content);
  return `<text x="${x}" y="${y}" font-family="system-ui, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escaped}</text>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionLabel(label: string, x: number, y: number): string {
  return text(label, x, y, 12, TEXT_DIM, "600");
}

// === Radar Chart ===

function radarChart(
  cx: number,
  cy: number,
  r: number,
  genres: WeightedItem[],
): string {
  const n = genres.length;
  if (n < 3) return "";

  const maxWeight = Math.max(...genres.map((g) => g.weight));
  const lines: string[] = [];

  // Compute vertex positions for each axis
  const axisAngle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const px = (i: number, ratio: number) =>
    cx + Math.cos(axisAngle(i)) * r * ratio;
  const py = (i: number, ratio: number) =>
    cy + Math.sin(axisAngle(i)) * r * ratio;

  // Concentric guide rings
  for (const ring of [0.33, 0.66, 1.0]) {
    const points = Array.from(
      { length: n },
      (_, i) => `${px(i, ring)},${py(i, ring)}`,
    ).join(" ");
    lines.push(
      `<polygon points="${points}" fill="none" stroke="${BAR_BG}" stroke-width="1" opacity="0.5"/>`,
    );
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    lines.push(
      `<line x1="${cx}" y1="${cy}" x2="${px(i, 1)}" y2="${py(i, 1)}" stroke="${BAR_BG}" stroke-width="1" opacity="0.4"/>`,
    );
  }

  // Filled shape
  const dataPoints = genres.map((g, i) => {
    const ratio = maxWeight > 0 ? g.weight / maxWeight : 0;
    return `${px(i, Math.max(ratio, 0.08))},${py(i, Math.max(ratio, 0.08))}`;
  });
  lines.push(
    `<polygon points="${dataPoints.join(" ")}" fill="${BRAND_BLUE}" fill-opacity="0.2" stroke="${BRAND_BLUE}" stroke-width="2" stroke-opacity="0.8"/>`,
  );

  // Vertex dots and labels
  for (let i = 0; i < n; i++) {
    const ratio = maxWeight > 0 ? genres[i].weight / maxWeight : 0;
    const dotX = px(i, Math.max(ratio, 0.08));
    const dotY = py(i, Math.max(ratio, 0.08));

    lines.push(
      `<circle cx="${dotX}" cy="${dotY}" r="4" fill="${PALETTE[i % PALETTE.length]}" stroke="${BG_DARK}" stroke-width="1.5"/>`,
    );

    // Genre label outside the chart
    const labelR = r + 16;
    const lx = cx + Math.cos(axisAngle(i)) * labelR;
    const ly = cy + Math.sin(axisAngle(i)) * labelR;
    const anchor =
      Math.abs(Math.cos(axisAngle(i))) < 0.3
        ? "middle"
        : Math.cos(axisAngle(i)) > 0
          ? "start"
          : "end";

    lines.push(
      text(
        genres[i].name,
        lx,
        ly + 4,
        10,
        PALETTE[i % PALETTE.length],
        "600",
        anchor,
      ),
    );
  }

  return lines.join("\n");
}

// === Card Components ===

function statRow(
  x: number,
  y: number,
  stats: Array<{ label: string; value: string }>,
): string[] {
  const cellWidth = 140;
  return stats.map((s, i) => {
    const cx = x + i * cellWidth;
    return [
      `<rect x="${cx}" y="${y}" width="${cellWidth - 10}" height="52" rx="10" fill="${BAR_BG}" opacity="0.6"/>`,
      `<rect x="${cx + 10}" y="${y + 50}" width="${cellWidth - 30}" height="2" rx="1" fill="${BRAND_BLUE}" opacity="0.5"/>`,
      text(
        s.value,
        cx + (cellWidth - 10) / 2,
        y + 24,
        18,
        TEXT_PRIMARY,
        "700",
        "middle",
      ),
      text(
        s.label,
        cx + (cellWidth - 10) / 2,
        y + 42,
        10,
        TEXT_SECONDARY,
        "normal",
        "middle",
      ),
    ].join("\n");
  });
}

function genreBars(
  genres: WeightedItem[],
  x: number,
  y: number,
  maxWidth: number,
  accentColor?: string,
): string[] {
  if (genres.length === 0) return [];
  const maxWeight = genres[0].weight;
  const barHeight = 22;
  const gap = 4;

  return genres.map((g, i) => {
    const cy = y + i * (barHeight + gap);
    const ratio = maxWeight > 0 ? g.weight / maxWeight : 0;
    const barWidth = ratio * (maxWidth - 90);
    const color = accentColor ?? PALETTE[i % PALETTE.length];
    return [
      `<rect x="${x}" y="${cy}" width="${maxWidth}" height="${barHeight}" rx="6" fill="${BAR_BG}" opacity="0.5"/>`,
      `<rect x="${x}" y="${cy}" width="${Math.max(barWidth, 6)}" height="${barHeight}" rx="6" fill="${color}" opacity="0.75"/>`,
      text(g.name, x + 8, cy + 15, 11, TEXT_PRIMARY, "600"),
      text(
        g.weight.toFixed(2),
        x + maxWidth - 6,
        cy + 15,
        10,
        TEXT_DIM,
        "normal",
        "end",
      ),
    ].join("\n");
  });
}

function tagList(tags: WeightedItem[], x: number, y: number): string[] {
  if (tags.length === 0) return [];
  return tags.map((t, i) => {
    const cy = y + i * 28;
    return [
      `<rect x="${x}" y="${cy - 6}" width="330" height="24" rx="6" fill="${BAR_BG}" opacity="0.35"/>`,
      `<circle cx="${x + 12}" cy="${cy + 6}" r="4" fill="${PALETTE[i % PALETTE.length]}"/>`,
      text(t.name, x + 24, cy + 10, 12, TEXT_PRIMARY),
      text(
        `${t.count} titles`,
        x + 310,
        cy + 10,
        10,
        TEXT_DIM,
        "normal",
        "end",
      ),
    ].join("\n");
  });
}

function formatBar(
  formats: FormatBreakdown[],
  x: number,
  y: number,
  totalWidth: number,
): string[] {
  const barHeight = 16;
  const rx = 8;
  const colors = [BRAND_BLUE, "#06d6a0", "#ffd166", "#ef476f", "#b388ff", "#4dd0e1"];
  const lines: string[] = [];

  // Rounded container clip
  const clipId = `fbar-${x}-${y}`;
  lines.push(
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${totalWidth}" height="${barHeight}" rx="${rx}"/></clipPath>`,
  );
  lines.push(`<g clip-path="url(#${clipId})">`);
  let cx = x;
  for (let i = 0; i < formats.length; i++) {
    const w = (formats[i].percent / 100) * totalWidth;
    lines.push(
      `<rect x="${cx}" y="${y}" width="${Math.max(w, 2)}" height="${barHeight}" fill="${colors[i % colors.length]}" opacity="0.85"/>`,
    );
    cx += w;
  }
  lines.push(`</g>`);

  for (let i = 0; i < formats.length; i++) {
    const ly = y + barHeight + 10 + Math.floor(i / 2) * 22;
    const lx = x + (i % 2) * 170;
    lines.push(
      `<rect x="${lx}" y="${ly}" width="10" height="10" rx="3" fill="${colors[i % colors.length]}"/>`,
    );
    lines.push(
      text(
        `${formatName(formats[i].format)} ${formats[i].percent}%`,
        lx + 16,
        ly + 9,
        11,
        TEXT_SECONDARY,
      ),
    );
  }

  return lines;
}

function scoreHistogram(
  distribution: Record<number, number>,
  x: number,
  y: number,
  width: number,
  height: number,
): string[] {
  const lines: string[] = [];
  const maxCount = Math.max(...Object.values(distribution), 1);
  const barCount = 10;
  const gap = 4;
  const barWidth = (width - (barCount - 1) * gap) / barCount;

  for (let s = 1; s <= 10; s++) {
    const count = distribution[s] ?? 0;
    const ratio = maxCount > 0 ? count / maxCount : 0;
    const barH = ratio * height;
    const bx = x + (s - 1) * (barWidth + gap);
    const by = y + height - barH;

    const hue = 195 + (s - 1) * 3;
    const color = s <= 5 ? `hsl(${hue}, 70%, 45%)` : `hsl(${hue}, 80%, 55%)`;

    lines.push(
      `<rect x="${bx}" y="${by}" width="${barWidth}" height="${Math.max(barH, 2)}" rx="3" fill="${color}" opacity="0.85"/>`,
    );
    if (count > 0) {
      lines.push(
        text(
          String(count),
          bx + barWidth / 2,
          by - 4,
          8,
          TEXT_DIM,
          "normal",
          "middle",
        ),
      );
    }
    lines.push(
      text(
        String(s),
        bx + barWidth / 2,
        y + height + 14,
        10,
        TEXT_SECONDARY,
        "normal",
        "middle",
      ),
    );
  }

  return lines;
}

function compatRing(cx: number, cy: number, pct: number): string {
  const r = 50;
  const strokeW = 10;
  const circumference = 2 * Math.PI * r;
  const filled = (pct / 100) * circumference;
  const color = pct >= 70 ? "#06d6a0" : pct >= 40 ? "#ffd166" : "#ef476f";

  return [
    `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="${color}" opacity="0.08" filter="url(#glow)"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BAR_BG}" stroke-width="${strokeW}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-dasharray="${filled} ${circumference}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>`,
    text(`${pct}%`, cx, cy + 8, 26, TEXT_PRIMARY, "800", "middle"),
    text("compatibility", cx, cy + 24, 10, TEXT_SECONDARY, "normal", "middle"),
  ].join("\n");
}

function sharedFavoritesList(
  favorites: Array<{ title: string; score1: number; score2: number }>,
  x: number,
  y: number,
  name1: string,
  name2: string,
): string[] {
  if (favorites.length === 0) {
    return [text("No shared 8+ favorites", x, y + 7, 11, TEXT_DIM)];
  }
  return favorites.map((f, i) => {
    const cy = y + i * 32;
    const title = f.title.length > 26 ? f.title.slice(0, 24) + "..." : f.title;
    return [
      `<rect x="${x}" y="${cy - 2}" width="350" height="28" rx="6" fill="${BAR_BG}" opacity="0.3"/>`,
      text(title, x + 8, cy + 12, 12, TEXT_PRIMARY, "600"),
      text(
        `${name1}: ${f.score1}  ${name2}: ${f.score2}`,
        x + 8,
        cy + 24,
        9,
        TEXT_DIM,
      ),
    ].join("\n");
  });
}

function divergenceList(
  divergences: string[],
  x: number,
  y: number,
  user1: string,
): string[] {
  if (divergences.length === 0) {
    return [text("No major differences", x, y + 7, 11, TEXT_DIM)];
  }
  // Parse differences into structured display
  return divergences.map((d, i) => {
    const cy = y + i * 28;
    const lovesMatch = d.match(/^(.+?) loves (.+?),/);
    if (lovesMatch) {
      const who = lovesMatch[1];
      const genre = lovesMatch[2];
      const isUser1 = who === user1;
      const color = isUser1 ? BRAND_BLUE : "#06d6a0";
      return [
        `<rect x="${x}" y="${cy - 2}" width="340" height="24" rx="6" fill="${BAR_BG}" opacity="0.3"/>`,
        `<circle cx="${x + 12}" cy="${cy + 10}" r="3" fill="${color}"/>`,
        text(genre, x + 22, cy + 14, 11, TEXT_PRIMARY, "600"),
        text(who, x + 320, cy + 14, 9, color, "normal", "end"),
      ].join("\n");
    }
    return [
      `<rect x="${x}" y="${cy - 2}" width="340" height="24" rx="6" fill="${BAR_BG}" opacity="0.3"/>`,
      `<circle cx="${x + 12}" cy="${cy + 10}" r="3" fill="#ef476f"/>`,
      text(d, x + 22, cy + 14, 10, TEXT_PRIMARY),
    ].join("\n");
  });
}

// === Helpers ===

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Title-case format names, keeping acronyms like TV/OVA/ONA
function formatName(f: string): string {
  if (f === "MOVIE") return "Movie";
  if (f === "SPECIAL") return "Special";
  return f;
}

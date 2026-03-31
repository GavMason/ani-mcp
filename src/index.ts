#!/usr/bin/env node
/** ani-mcp - AniList MCP Server */

import "dotenv/config";
import { FastMCP } from "fastmcp";
import { warmCache } from "./api/client.js";
import { registerSearchTools } from "./tools/search.js";
import { registerListTools } from "./tools/lists.js";
import { registerRecommendTools } from "./tools/recommend.js";
import { registerDiscoverTools } from "./tools/discover.js";
import { registerInfoTools } from "./tools/info.js";
import { registerWriteTools } from "./tools/write.js";
import { registerSocialTools } from "./tools/social.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerImportTools } from "./tools/import.js";
import { registerCardTools } from "./tools/cards.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

// Sanitize env vars: clear unresolved templates, placeholders, or invalid values
for (const key of ["ANILIST_USERNAME", "ANILIST_TOKEN"] as const) {
  const val = process.env[key] ?? "";
  if (!val || val.startsWith("${") || val === "undefined" || val === "null") {
    process.env[key] = "";
  }
}
// AniList tokens are long JWT-like strings (100+ chars)
if (process.env.ANILIST_TOKEN && process.env.ANILIST_TOKEN.length < 30) {
  console.warn("[ani-mcp] ANILIST_TOKEN looks invalid (too short), ignoring.");
  process.env.ANILIST_TOKEN = "";
}

// Both vars are optional - warn on missing so operators know what's available
if (!process.env.ANILIST_USERNAME) {
  console.warn(
    "ANILIST_USERNAME not set - tools will require a username argument.",
  );
}
if (!process.env.ANILIST_TOKEN) {
  console.warn("ANILIST_TOKEN not set - authenticated features unavailable.");
}

const server = new FastMCP({
  name: "ani-mcp",
  version: "0.15.3",
  instructions:
    "ani-mcp is a local MCP server for AniList. " +
    "Read-only tools work without authentication. " +
    "Write tools require ANILIST_TOKEN set in the server's environment config. " +
    "If a tool says the token is not set, tell the user to add ANILIST_TOKEN " +
    "to their MCP server config and restart. " +
    "There is no in-app AniList integration or settings page to connect.",
});

registerSearchTools(server);
registerListTools(server);
registerRecommendTools(server);
registerDiscoverTools(server);
registerInfoTools(server);
registerWriteTools(server);
registerSocialTools(server);
registerAnalyticsTools(server);
registerImportTools(server);
registerCardTools(server);
registerResources(server);
registerPrompts(server);

// Pre-fetch default user's lists
warmCache();

// === Transport ===
const transport = process.env.MCP_TRANSPORT === "http" ? "httpStream" : "stdio";

if (transport === "httpStream") {
  const port = Number(process.env.MCP_PORT) || 3000;
  const host = process.env.MCP_HOST || "localhost";
  console.error(`Listening on http://${host}:${port}/mcp`);
  server.start({
    transportType: "httpStream",
    httpStream: { port, host },
  });
} else {
  server.start({ transportType: "stdio" });
}

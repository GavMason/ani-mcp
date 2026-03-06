#!/usr/bin/env node
/** ani-mcp - AniList MCP Server */

import "dotenv/config";
import { FastMCP } from "fastmcp";
import { registerSearchTools } from "./tools/search.js";
import { registerListTools } from "./tools/lists.js";
import { registerRecommendTools } from "./tools/recommend.js";
import { registerDiscoverTools } from "./tools/discover.js";
import { registerInfoTools } from "./tools/info.js";
import { registerWriteTools } from "./tools/write.js";
import { registerSocialTools } from "./tools/social.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

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
  version: "0.8.2",
});

registerSearchTools(server);
registerListTools(server);
registerRecommendTools(server);
registerDiscoverTools(server);
registerInfoTools(server);
registerWriteTools(server);
registerSocialTools(server);
registerAnalyticsTools(server);
registerResources(server);
registerPrompts(server);

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

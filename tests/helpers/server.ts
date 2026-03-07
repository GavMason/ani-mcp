/** Test helper: create a FastMCPSession + MCP Client over InMemoryTransport */

import { FastMCPSession } from "fastmcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerSearchTools } from "../../src/tools/search.js";
import { registerListTools } from "../../src/tools/lists.js";
import { registerRecommendTools } from "../../src/tools/recommend.js";
import { registerDiscoverTools } from "../../src/tools/discover.js";
import { registerInfoTools } from "../../src/tools/info.js";
import { registerWriteTools } from "../../src/tools/write.js";
import { registerSocialTools } from "../../src/tools/social.js";
import { registerAnalyticsTools } from "../../src/tools/analytics.js";
import { registerImportTools } from "../../src/tools/import.js";
import { registerResources } from "../../src/resources.js";
import { registerPrompts } from "../../src/prompts.js";

// Capture tool, resource, and prompt definitions via a proxy
function collectAll() {
  const tools: unknown[] = [];
  const resources: unknown[] = [];
  const resourcesTemplates: unknown[] = [];
  const prompts: unknown[] = [];

  const proxy = {
    addTool(item: unknown) {
      tools.push(item);
    },
    addResource(item: unknown) {
      resources.push(item);
    },
    addResourceTemplate(item: unknown) {
      resourcesTemplates.push(item);
    },
    addPrompt(item: unknown) {
      prompts.push(item);
    },
  };

  registerSearchTools(proxy as never);
  registerListTools(proxy as never);
  registerRecommendTools(proxy as never);
  registerDiscoverTools(proxy as never);
  registerInfoTools(proxy as never);
  registerWriteTools(proxy as never);
  registerSocialTools(proxy as never);
  registerAnalyticsTools(proxy as never);
  registerImportTools(proxy as never);
  registerResources(proxy as never);
  registerPrompts(proxy as never);

  return { tools, resources, resourcesTemplates, prompts };
}

const all = collectAll();

/** Create a connected MCP test client */
export async function createTestClient() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const session = new FastMCPSession({
    name: "ani-mcp-test",
    version: "0.0.0",
    tools: all.tools as never,
    prompts: all.prompts as never,
    resources: all.resources as never,
    resourcesTemplates: all.resourcesTemplates as never,
    transportType: "stdio",
    logger: { debug() {}, log() {}, info() {}, warn() {}, error() {} },
  });

  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([
    client.connect(clientTransport),
    session.connect(serverTransport),
  ]);

  return {
    /** Call a tool and return the text content */
    async callTool(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<string> {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as Array<{ type: string; text: string }>;
      return content[0]?.text ?? "";
    },

    /** Read a resource and return its text content */
    async readResource(uri: string): Promise<string> {
      const result = await client.readResource({ uri });
      const content = result.contents as Array<{ text?: string }>;
      return content[0]?.text ?? "";
    },

    /** Get a prompt and return the message text */
    async getPrompt(
      name: string,
      args: Record<string, string> = {},
    ): Promise<string> {
      const result = await client.getPrompt({ name, arguments: args });
      const msg = result.messages[0];
      if (msg?.content && typeof msg.content === "object" && "text" in msg.content) {
        return msg.content.text as string;
      }
      return "";
    },

    /** Tear down the test connection */
    async cleanup() {
      await client.close();
      await session.close();
    },
  };
}

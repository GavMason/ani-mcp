/** Test helper: create a FastMCPSession + MCP Client over InMemoryTransport */

import { FastMCPSession } from "fastmcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerSearchTools } from "../../src/tools/search.js";
import { registerListTools } from "../../src/tools/lists.js";
import { registerRecommendTools } from "../../src/tools/recommend.js";

// Capture tool definitions via a proxy
function collectTools() {
  const tools: Parameters<FastMCPSession["addPrompt"]>[] = [];
  const proxy = {
    addTool(tool: unknown) {
      tools.push(tool as never);
    },
  };

  registerSearchTools(proxy as never);
  registerListTools(proxy as never);
  registerRecommendTools(proxy as never);

  return tools;
}

const allTools = collectTools();

/** Create a connected MCP test client */
export async function createTestClient() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const session = new FastMCPSession({
    name: "ani-mcp-test",
    version: "0.0.0",
    tools: allTools as never,
    prompts: [],
    resources: [],
    resourcesTemplates: [],
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

    /** Tear down the test connection */
    async cleanup() {
      await client.close();
      await session.close();
    },
  };
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = new McpServer({ name: "graylog", version: "0.1.0" });
  registerTools(server, config);

  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol; log to stderr only.
  const instances = config.instances
    .map((i) => `${i.name}=${i.baseUrl}${i.verifySsl ? "" : " (verifySsl=false)"}`)
    .join(", ");
  console.error(`mcp-graylog connected (${instances}; default=${config.defaultInstance})`);
}

main().catch((err) => {
  console.error("mcp-graylog failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});

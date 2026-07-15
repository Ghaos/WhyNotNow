import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = path.resolve("server/index.mjs");

test("MCP client discovers and calls the ping tool over stdio", async (t) => {
  const client = new Client({
    name: "why-not-now-test-client",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  t.after(async () => {
    await client.close();
  });

  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ["ping"]);

  const result = await client.callTool({ name: "ping", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: "pong" }]);
});

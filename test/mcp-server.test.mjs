import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const serverPath = path.resolve("server/index.mjs");

test("MCP client discovers tools and completes form elicitation over stdio", async (t) => {
  const client = new Client(
    {
      name: "why-not-now-test-client",
      version: "0.1.0",
    },
    {
      capabilities: {
        elicitation: { form: {} },
      },
    },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });
  let elicitationRequest;

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    elicitationRequest = request.params;
    return {
      action: "accept",
      content: { direction: "why_not_now" },
    };
  });

  t.after(async () => {
    await client.close();
  });

  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["ping", "choose_direction"],
  );

  const result = await client.callTool({ name: "ping", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: "pong" }]);

  const choiceResult = await client.callTool({
    name: "choose_direction",
    arguments: {},
  });
  assert.equal(elicitationRequest.mode, "form");
  assert.equal(elicitationRequest.requestedSchema.required[0], "direction");
  assert.deepEqual(choiceResult.structuredContent, {
    direction: "why_not_now",
  });
  assert.deepEqual(choiceResult.content, [
    { type: "text", text: "選択: why_not_now" },
  ]);
});

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createConversation,
  getConversation,
} from "../.agents/skills/why-not-now/scripts/store.mjs";

const serverPath = path.resolve(
  process.env.WHYNOTNOW_MCP_SERVER_PATH ?? "server/index.mjs",
);

test("MCP client discovers tools and completes form elicitation over stdio", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const conversation = await createConversation(
    { task_text: "Form elicitationを試す" },
    storeOptions,
  );
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
    env: {
      ...getDefaultEnvironment(),
      WHYNOTNOW_HOME: dataRoot,
    },
  });
  let elicitationRequest;

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    elicitationRequest = request.params;
    return {
      action: "accept",
      content: {
        action: "why_not_now",
        note: "まず理由を整理する",
      },
    };
  });

  t.after(async () => {
    await client.close();
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["ping", "choose_action"],
  );

  const result = await client.callTool({ name: "ping", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: "pong" }]);

  const choiceResult = await client.callTool({
    name: "choose_action",
    arguments: {
      conversation_id: conversation.conversation_id,
      expected_revision: conversation.revision,
    },
  });
  assert.equal(elicitationRequest.mode, "form");
  assert.equal(elicitationRequest.requestedSchema.required[0], "action");
  assert.equal(
    elicitationRequest.requestedSchema.properties.action.oneOf.length,
    4,
  );
  assert.deepEqual(choiceResult.structuredContent, {
    action: "why_not_now",
    note: "まず理由を整理する",
    conversation_id: conversation.conversation_id,
    revision: 2,
    conversation_state: "active",
    decision: "not_now",
    enrichment: "none",
  });
  assert.deepEqual(choiceResult.content, [
    { type: "text", text: "選択を保存しました: why_not_now" },
  ]);

  const saved = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(saved.revision, 2);
  assert.equal(saved.decision, "not_now");
  assert.equal(saved.notes.at(-1).text, "まず理由を整理する");
  assert.equal(saved.events.at(-1).type, "decision_updated");

  const staleResult = await client.callTool({
    name: "choose_action",
    arguments: {
      conversation_id: conversation.conversation_id,
      expected_revision: conversation.revision,
    },
  });
  assert.equal(staleResult.isError, true);
  assert.match(staleResult.content[0].text, /最新のrevision/);

  const unchanged = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(unchanged.revision, 2);
  assert.equal(unchanged.notes.length, 1);
});

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createConversation, getConversation } from "../.agents/skills/wnn/scripts/store.mjs";

const serverPath = path.resolve(process.env.WHYNOTNOW_MCP_SERVER_PATH ?? "server/index.mjs");

test("MCP action and research follow-ups persist choices over stdio", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const conversation = await createConversation({ task_text: "Form elicitationを試す" }, storeOptions);
  const cancelledConversation = await createConversation({ task_text: "キャンセルを試す" }, storeOptions);
  const responses = [
    { action: "accept", content: { action: "why_not_now", note: "まず理由を整理する" } },
    { action: "accept", content: { action: "research" } },
    { action: "decline" },
    { action: "accept", content: { action: "end" } },
    { action: "accept", content: { action: "research" } },
  ];
  const requests = [];
  const client = new Client({ name: "why-not-now-test-client", version: "1.0.0" }, { capabilities: { elicitation: { form: {} } } });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...getDefaultEnvironment(), WHYNOTNOW_HOME: dataRoot },
  });

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    requests.push(request.params);
    return responses.shift();
  });
  t.after(async () => { await client.close(); await fs.rm(dataRoot, { recursive: true, force: true }); });
  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ["ping", "choose_action", "choose_research"]);
  const result = await client.callTool({ name: "ping", arguments: {} });
  assert.deepEqual(result.content, [{ type: "text", text: "pong" }]);

  const choiceResult = await client.callTool({ name: "choose_action", arguments: {
    conversation_id: conversation.conversation_id, expected_revision: conversation.revision,
  } });
  assert.equal(requests[0].requestedSchema.properties.action.oneOf.length, 2);
  assert.equal(choiceResult.structuredContent.action, "why_not_now");
  assert.equal(choiceResult.structuredContent.revision, 2);

  const researchResult = await client.callTool({ name: "choose_research", arguments: {
    conversation_id: conversation.conversation_id, expected_revision: choiceResult.structuredContent.revision, context: "reason",
  } });
  assert.equal(requests[1].requestedSchema.properties.action.oneOf.length, 2);
  assert.equal(researchResult.structuredContent.action, "research");
  assert.equal(researchResult.structuredContent.revision, 3);
  const saved = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(saved.decision, "not_now");
  assert.equal(saved.notes.at(-1).text, "まず理由を整理する");
  assert.equal(saved.events.at(-1).type, "research_requested");

  const cancelledResult = await client.callTool({ name: "choose_action", arguments: {
    conversation_id: cancelledConversation.conversation_id, expected_revision: cancelledConversation.revision,
  } });
  assert.deepEqual(cancelledResult.structuredContent, {
    action: "cancelled", conversation_id: cancelledConversation.conversation_id, revision: 1,
  });
  const unchanged = await getConversation(cancelledConversation.conversation_id, storeOptions);
  assert.equal(unchanged.revision, 1);
  assert.equal(unchanged.conversation_state, "active");
  assert.equal(unchanged.decision, "undecided");

  const endResult = await client.callTool({ name: "choose_research", arguments: {
    conversation_id: cancelledConversation.conversation_id, expected_revision: cancelledConversation.revision, context: "cancelled_action",
  } });
  assert.equal(endResult.structuredContent.action, "end");
  assert.equal(endResult.structuredContent.conversation_state, "ended");
  const ended = await getConversation(cancelledConversation.conversation_id, storeOptions);
  assert.equal(ended.events.at(-1).type, "ended");

  const staleResult = await client.callTool({ name: "choose_research", arguments: {
    conversation_id: conversation.conversation_id, expected_revision: 1, context: "reason",
  } });
  assert.equal(staleResult.isError, true);
  assert.match(staleResult.content[0].text, /latest revision/);
});

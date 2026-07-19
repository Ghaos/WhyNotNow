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

test("MCP action and plain-text assistance choices persist choices over stdio", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const conversation = await createConversation({ task_text: "Form elicitationを試す" }, storeOptions);
  const cancelledConversation = await createConversation({ task_text: "キャンセルを試す" }, storeOptions);
  const responses = [
    { action: "accept", content: { action: "why_not_now", note: "まず理由を整理する" } },
    { action: "decline" },
  ];
  const requests = [];
  const client = new Client({ name: "why-not-now-test-client", version: "1.0.0" }, { capabilities: { elicitation: { form: {} } } });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...getDefaultEnvironment(), WHYNOTNOW_HOME: dataRoot, WHYNOTNOW_DASHBOARD_PORT: "0" },
  });

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    requests.push(request.params);
    return responses.shift();
  });
  t.after(async () => { await client.close(); await fs.rm(dataRoot, { recursive: true, force: true }); });
  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), [
    "create_conversation", "update_conversation", "get_conversation_context", "list_conversation_summaries",
    "complete_conversation", "reopen_conversation", "archive_conversation", "ping", "choose_action",
    "offer_assistance",
  ]);
  const result = await client.callTool({ name: "ping", arguments: {} });
  assert.deepEqual(result.content, [{ type: "text", text: "pong" }]);

  const choiceResult = await client.callTool({ name: "choose_action", arguments: {
    conversation_id: conversation.conversation_id, expected_revision: conversation.revision,
  } });
  assert.equal(requests[0].requestedSchema.properties.action.oneOf.length, 2);
  assert.equal(choiceResult.structuredContent.action, "why_not_now");
  assert.equal(choiceResult.structuredContent.revision, 2);
  assert.deepEqual(choiceResult.content, []);

  const researchResult = await client.callTool({ name: "offer_assistance", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: choiceResult.structuredContent.revision,
    reason_id: "against_compatibility",
    problem_summary: "対応環境が分からない",
    proposed_scope: "公式の互換性要件だけを確認する",
    expected_result: "対応可否と不足している条件を短く整理する",
    action: "research",
  } });
  assert.equal(researchResult.structuredContent.action, "research");
  assert.equal(researchResult.structuredContent.revision, 3);
  assert.deepEqual(researchResult.content, []);
  assert.equal(requests.length, 1, "assistance consent is collected in a plain-text assistant message, not an elicitation form");
  const contextResult = await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: conversation.conversation_id,
  } });
  assert.equal(contextResult.structuredContent.conversation.decision, "not_now");
  assert.equal(contextResult.structuredContent.conversation.revision, 3);
  assert.equal(contextResult.structuredContent.conversation.conversation_id, conversation.conversation_id);
  assert.match(contextResult.structuredContent.conversation.updated_at, /^\d{4}-/);
  assert.equal(contextResult.structuredContent.conversation.notes.at(-1).text, "まず理由を整理する");
  const saved = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(saved.events.at(-1).type, "assistance_accepted");
  assert.equal(saved.events.at(-1).data.reason_id, "against_compatibility");

  const declinedResult = await client.callTool({ name: "offer_assistance", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: researchResult.structuredContent.revision,
    reason_id: "against_compatibility",
    problem_summary: "対応環境が分からない",
    proposed_scope: "公式の互換性要件だけを確認する",
    expected_result: "対応可否と不足している条件を短く整理する",
    action: "decline",
  } });
  assert.equal(declinedResult.structuredContent.action, "decline");
  await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: conversation.conversation_id,
  } });
  const declined = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(declined.events.at(-1).type, "assistance_declined");
  assert.equal(declined.conversation_state, "active");

  const completedResult = await client.callTool({ name: "complete_conversation", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: declinedResult.structuredContent.revision,
  } });
  assert.equal(completedResult.structuredContent.revision, 5);
  await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: conversation.conversation_id } });
  assert.equal((await getConversation(conversation.conversation_id, storeOptions)).lifecycle, "completed");

  const reopenedResult = await client.callTool({ name: "reopen_conversation", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: completedResult.structuredContent.revision,
  } });
  assert.equal(reopenedResult.structuredContent.revision, 6);
  await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: conversation.conversation_id } });
  const reopened = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(reopened.lifecycle, "open");
  assert.equal(reopened.decision, "not_now");

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

  const staleResult = await client.callTool({ name: "offer_assistance", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: 1,
    reason_id: "against_compatibility",
    problem_summary: "対応環境が分からない",
    proposed_scope: "公式の互換性要件だけを確認する",
    expected_result: "対応可否と不足している条件を短く整理する",
    action: "research",
  } });
  assert.equal(staleResult.isError, true);
  assert.match(staleResult.content[0].text, /changed elsewhere/);
});

test("MCP persistence operations hide raw records and flush queued writes before reading", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-storage-test-"));
  const client = new Client({ name: "why-not-now-storage-client", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...getDefaultEnvironment(), WHYNOTNOW_HOME: dataRoot, WHYNOTNOW_DASHBOARD_PORT: "0" },
  });
  t.after(async () => { await client.close(); await fs.rm(dataRoot, { recursive: true, force: true }); });
  await client.connect(transport);

  const created = await client.callTool({ name: "create_conversation", arguments: { record: { task_text: "非表示で保存" } } });
  assert.deepEqual(created.content, []);
  assert.match(created.structuredContent.conversation_id, /^wnn_/);
  assert.equal("task_text" in created.structuredContent, false);

  const context = await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: created.structuredContent.conversation_id,
  } });
  assert.deepEqual(context.content, []);
  assert.equal(context.structuredContent.conversation.task_text, "非表示で保存");
  assert.equal(context.structuredContent.conversation.revision, 1);
  assert.equal("events" in context.structuredContent.conversation, false);

  const listed = await client.callTool({ name: "list_conversation_summaries", arguments: {} });
  assert.equal(listed.structuredContent.conversations.length, 1);
  assert.equal(listed.structuredContent.conversations[0].revision, 1);
  assert.equal(listed.structuredContent.conversations[0].task_text, "非表示で保存");
});

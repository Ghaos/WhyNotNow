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

test("MCP action, assistance, and cancellation follow-ups persist choices over stdio", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const conversation = await createConversation({ task_text: "Form elicitationを試す" }, storeOptions);
  const cancelledConversation = await createConversation({ task_text: "キャンセルを試す" }, storeOptions);
  const responses = [
    { action: "accept", content: { action: "why_not_now", note: "まず理由を整理する" } },
    { action: "accept", content: { action: "research" } },
    { action: "accept", content: { action: "decline" } },
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
  assert.deepEqual(tools.tools.map((tool) => tool.name), [
    "create_conversation", "update_conversation", "get_conversation_context", "list_conversation_summaries",
    "archive_conversation", "ping", "choose_action", "offer_assistance", "choose_cancel_followup",
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
  } });
  assert.equal(requests[1].requestedSchema.properties.action.oneOf.length, 2);
  assert.match(requests[1].message, /対応環境が分からない/);
  assert.match(requests[1].message, /公式の互換性要件だけを確認する/);
  assert.equal(researchResult.structuredContent.action, "research");
  assert.equal(researchResult.structuredContent.revision, 3);
  assert.deepEqual(researchResult.content, []);
  const contextResult = await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: conversation.conversation_id,
  } });
  assert.equal(contextResult.structuredContent.conversation.decision, "not_now");
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
  } });
  assert.equal(declinedResult.structuredContent.action, "decline");
  await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: conversation.conversation_id,
  } });
  const declined = await getConversation(conversation.conversation_id, storeOptions);
  assert.equal(declined.events.at(-1).type, "assistance_declined");
  assert.equal(declined.conversation_state, "active");

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

  const endResult = await client.callTool({ name: "choose_cancel_followup", arguments: {
    conversation_id: cancelledConversation.conversation_id, expected_revision: cancelledConversation.revision,
  } });
  assert.equal(endResult.structuredContent.action, "end");
  assert.equal(endResult.structuredContent.conversation_state, "ended");
  await client.callTool({ name: "get_conversation_context", arguments: {
    conversation_id: cancelledConversation.conversation_id,
  } });
  const ended = await getConversation(cancelledConversation.conversation_id, storeOptions);
  assert.equal(ended.events.at(-1).type, "ended");

  const staleResult = await client.callTool({ name: "offer_assistance", arguments: {
    conversation_id: conversation.conversation_id,
    expected_revision: 1,
    reason_id: "against_compatibility",
    problem_summary: "対応環境が分からない",
    proposed_scope: "公式の互換性要件だけを確認する",
    expected_result: "対応可否と不足している条件を短く整理する",
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
    env: { ...getDefaultEnvironment(), WHYNOTNOW_HOME: dataRoot },
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
  assert.equal("events" in context.structuredContent.conversation, false);
});

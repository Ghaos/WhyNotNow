import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getConversation } from "../.agents/skills/wnn/scripts/store.mjs";

const serverPath = path.resolve(process.env.WHYNOTNOW_MCP_SERVER_PATH ?? "server/index.mjs");

function internalResult(result) {
  assert.equal("structuredContent" in result, false);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(result.content[0].annotations, { audience: ["assistant"] });
  return JSON.parse(result.content[0].text);
}

async function mcpClient(dataRoot) {
  const client = new Client({ name: "why-not-now-test-client", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...getDefaultEnvironment(), WHYNOTNOW_HOME: dataRoot, WHYNOTNOW_DASHBOARD_PORT: "0" },
  });
  await client.connect(transport);
  return client;
}

test("MCP exposes only the minimal structured conversation tools", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-test-"));
  const client = await mcpClient(root);
  t.after(async () => { await client.close(); await fs.rm(root, { recursive: true, force: true }); });

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), [
    "create_conversation", "update_conversation", "get_conversation_context",
    "list_conversation_summaries", "offer_assistance", "ping",
  ]);
  assert.deepEqual((await client.callTool({ name: "ping", arguments: {} })).content, [{ type: "text", text: "pong" }]);

  const created = internalResult(await client.callTool({
    name: "create_conversation",
    arguments: { record: { task_text: "直接記録する", status: "before" } },
  }));
  await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: created.conversation_id } });
  const saved = await getConversation(created.conversation_id, { env: { WHYNOTNOW_HOME: root } });
  assert.equal(saved.status, "considering");

  const updated = internalResult(await client.callTool({
    name: "update_conversation",
    arguments: {
      conversation_id: created.conversation_id,
      expected_revision: created.revision,
      patch: {
        status: "executed",
        interpretation: { goal: "判断材料を集める" },
        why_not_now: { reasons: [{ id: "against_time", text: "時間がない", origin: "user", confirmation: "confirmed" }] },
      },
      append_notes: [{ text: "優先度を確認した", origin: "user" }],
    },
  }));
  assert.equal(updated.revision, 2);
  await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: created.conversation_id } });
  const afterUpdate = await getConversation(created.conversation_id, { env: { WHYNOTNOW_HOME: root } });
  assert.equal(afterUpdate.status, "considering", "MCP dialogue updates cannot change dashboard status");
  assert.equal(afterUpdate.interpretation.goal, "判断材料を集める");
  assert.equal(afterUpdate.notes[0].text, "優先度を確認した");

  const assistance = internalResult(await client.callTool({
    name: "offer_assistance",
    arguments: {
      conversation_id: created.conversation_id,
      expected_revision: updated.revision,
      reason_id: "against_time",
      problem_summary: "所要時間が分からない",
      proposed_scope: "既存資料だけを確認する",
      expected_result: "概算だけを整理する",
      action: "research",
    },
  }));
  assert.deepEqual(assistance, { action: "research", revision: 3 });
  await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: created.conversation_id } });
  const afterAssistance = await getConversation(created.conversation_id, { env: { WHYNOTNOW_HOME: root } });
  assert.equal(afterAssistance.assistance_choices[0].action, "research");
  assert.equal(afterAssistance.assistance_choices[0].reason_id, "against_time");

  const stale = await client.callTool({
    name: "update_conversation",
    arguments: { conversation_id: created.conversation_id, expected_revision: 1, patch: { title: "古い更新" } },
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /changed elsewhere/);
});

test("MCP reads flush queued writes and never exposes raw storage details", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-mcp-storage-test-"));
  const client = await mcpClient(root);
  t.after(async () => { await client.close(); await fs.rm(root, { recursive: true, force: true }); });

  const created = internalResult(await client.callTool({ name: "create_conversation", arguments: { record: { task_text: "非表示で保存" } } }));
  assert.match(created.conversation_id, /^wnn_/);
  assert.equal("task_text" in created, false);

  const context = internalResult(await client.callTool({ name: "get_conversation_context", arguments: { conversation_id: created.conversation_id } })).conversation;
  assert.equal(context.task_text, "非表示で保存");
  assert.equal(context.status, "considering");
  assert.equal("events" in context, false);
  assert.equal("dialogue_thread_id" in context, false);

  const listed = internalResult(await client.callTool({ name: "list_conversation_summaries", arguments: { view: "considering" } }));
  assert.equal(listed.conversations.length, 1);
  assert.equal(listed.conversations[0].task_text, "非表示で保存");
});

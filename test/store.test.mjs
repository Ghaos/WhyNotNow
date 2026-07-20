import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  conversationsDirectory,
  createConversation,
  getConversation,
  listConversations,
  normalizeUrlEntry,
  resolveDataRoot,
  SCHEMA_VERSION,
  updateConversation,
} from "../.agents/skills/wnn/scripts/store.mjs";

const cliPath = path.resolve(".agents/skills/wnn/scripts/whynotnow.mjs");

function runCli(args, { env, input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`CLI exited with ${code}: ${stderr}`)));
    child.stdin.end(input);
  });
}

async function withStore(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-test-"));
  const previous = process.env.WHYNOTNOW_HOME;
  process.env.WHYNOTNOW_HOME = root;
  try { await run(root); }
  finally {
    if (previous === undefined) delete process.env.WHYNOTNOW_HOME;
    else process.env.WHYNOTNOW_HOME = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("uses a fresh v4 storage directory", () => {
  const options = { env: { WHYNOTNOW_HOME: "./custom" } };
  assert.equal(resolveDataRoot(options), path.resolve("./custom"));
  assert.equal(conversationsDirectory(options), path.join(path.resolve("./custom"), "conversations-v4"));
});

test("creates direct captures as considering and stores structured context", async () => {
  await withStore(async () => {
    const created = await createConversation({
      task_text: "導入を検討する",
      source_thread_id: "must-not-survive",
      interpretation: {
        goal: "導入の可否を判断する",
        current_situation: "優先度が不明",
        desired_outcome: "試行範囲を決める",
        completion_conditions: ["対応環境が分かる"],
        execution_prompt: "must-not-survive",
        hidden_reasoning: "must-not-survive",
      },
      dialogue: {
        active_focus: { kind: "constraint", summary: "準備時間がない" },
        covered_topics: ["constraint", "unknown"],
        private_reasoning: "must-not-survive",
      },
    });
    assert.equal(created.schema_version, SCHEMA_VERSION);
    assert.equal(created.status, "considering");
    assert.equal("source_thread_id" in created, false);
    assert.equal("events" in created, false);
    assert.equal("execution_prompt" in created.interpretation, false);
    assert.equal("hidden_reasoning" in created.interpretation, false);
    assert.equal("private_reasoning" in created.dialogue, false);
    assert.deepEqual(created.dialogue.covered_topics, ["constraint"]);
  });
});

test("updates structured information and append-only notes without transcripts", async () => {
  await withStore(async () => {
    const created = await createConversation({ task_text: "Taskmasterを試す" });
    const updated = await updateConversation(created.conversation_id, {
      patch: {
        enrichment: "partial",
        transcript: [{ role: "user", content: "must-not-survive" }],
        reasons_for: [{ text: "便利そう", origin: "user", confirmation: "confirmed" }],
        why_not_now: { reasons: [{ text: "難しそう", origin: "user", confirmation: "confirmed", solutions: ["最小構成で試す"] }] },
      },
      append_notes: [{ text: "公式要件を確認した", origin: "ai_research" }],
    }, { expectedRevision: 1 });
    assert.equal(updated.revision, 2);
    assert.equal(updated.reasons_for[0].origin, "user");
    assert.deepEqual(updated.why_not_now.reasons[0].solutions, ["最小構成で試す"]);
    assert.equal(updated.notes[0].text, "公式要件を確認した");
    assert.equal("transcript" in updated, false);
  });
});

test("lists the three statuses and compact summaries without session links", async () => {
  await withStore(async () => {
    const before = await createConversation({ task_text: "実行前", status: "before" });
    await createConversation({ task_text: "検討中" });
    await createConversation({ task_text: "実行済み", status: "executed" });
    const listed = await listConversations({ view: "before" });
    assert.equal(listed.conversations.length, 1);
    assert.equal(listed.conversations[0].conversation_id, before.conversation_id);
    assert.equal(listed.conversations[0].status, "before");
    assert.equal("execution_url" in listed.conversations[0], false);
    assert.equal("dialogue_thread_id" in listed.conversations[0], false);
    assert.equal((await listConversations({ view: "all" })).conversations.length, 3);
  });
});

test("rejects stale revisions without overwriting the record", async () => {
  await withStore(async () => {
    const created = await createConversation({ task_text: "競合テスト" });
    await updateConversation(created.conversation_id, { patch: { title: "更新済み" } }, { expectedRevision: 1 });
    await assert.rejects(
      updateConversation(created.conversation_id, { patch: { title: "古い更新" } }, { expectedRevision: 1 }),
      (error) => error.code === "REVISION_CONFLICT",
    );
    assert.equal((await getConversation(created.conversation_id)).title, "更新済み");
  });
});

test("normalizes and deduplicates related URLs", async () => {
  const normalized = normalizeUrlEntry({ url: "https://user:secret@example.com/path?utm_source=x&topic=ai&access_token=secret#section" });
  assert.equal(normalized.url, "https://example.com/path?topic=ai");
  await withStore(async () => {
    const created = await createConversation({ task_text: "URL", related_urls: ["https://example.com/?utm_source=a", "https://example.com/?utm_source=b"] });
    assert.equal(created.related_urls.length, 1);
  });
});

test("CLI creates and lists the new views", async () => {
  await withStore(async (root) => {
    const env = { ...process.env, WHYNOTNOW_HOME: root };
    const created = JSON.parse((await runCli(["create"], { env, input: JSON.stringify({ task_text: "CLIから作成" }) })).stdout);
    assert.equal(created.status, "considering");
    const listed = JSON.parse((await runCli(["list", "--view", "considering"], { env })).stdout);
    assert.equal(listed.conversations[0].task_text, "CLIから作成");
  });
});

test("ignores the legacy directory and rejects wrong schemas in v4", async () => {
  await withStore(async (root) => {
    await fs.mkdir(path.join(root, "conversations"), { recursive: true });
    await fs.writeFile(path.join(root, "conversations", "legacy.json"), JSON.stringify({ schema_version: 3 }), "utf8");
    assert.equal((await listConversations({ view: "all" })).errors.length, 0);

    const created = await createConversation({ task_text: "新形式" });
    const file = path.join(root, "conversations-v4", `${created.conversation_id}.json`);
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    record.schema_version = 3;
    await fs.writeFile(file, JSON.stringify(record), "utf8");
    await assert.rejects(getConversation(created.conversation_id), (error) => error.code === "UNSUPPORTED_SCHEMA");
  });
});

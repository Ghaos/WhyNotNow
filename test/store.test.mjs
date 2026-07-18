import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  archiveConversation,
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
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`CLI exited with ${code}: ${stderr}`));
    });
    child.stdin.end(input);
  });
}

async function withStore(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-test-"));
  const previous = process.env.WHYNOTNOW_HOME;
  process.env.WHYNOTNOW_HOME = root;
  try {
    await run(root);
  } finally {
    if (previous === undefined) delete process.env.WHYNOTNOW_HOME;
    else process.env.WHYNOTNOW_HOME = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("uses the explicit data directory override", () => {
  assert.equal(resolveDataRoot({ env: { WHYNOTNOW_HOME: "./custom" } }), path.resolve("./custom"));
});

test("creates an incomplete conversation and updates it once per turn", async () => {
  await withStore(async () => {
    const created = await createConversation({ task_text: "Taskmasterを試す" });
    assert.equal(created.schema_version, SCHEMA_VERSION);
    assert.equal(created.revision, 1);
    assert.equal(created.conversation_state, "active");
    assert.deepEqual(created.reasons_for, []);
    assert.deepEqual(created.related_urls, []);

    const updated = await updateConversation(created.conversation_id, {
      patch: {
        decision: "not_now",
        enrichment: "partial",
        reasons_for: [{
          text: "ゲーム開発に組み込めれば便利そう",
          origin: "user",
          confirmation: "confirmed"
        }],
        why_not_now: {
          reasons: [{
            text: "大規模で難しそう",
            origin: "user",
            confirmation: "confirmed",
            solvable: true,
            solutions: ["最小構成だけ試す"],
            children: []
          }]
        }
      },
      append_events: [{ type: "decision_updated", data: { decision: "not_now" } }]
    }, { expectedRevision: 1 });

    assert.equal(updated.revision, 2);
    assert.equal(updated.reasons_for[0].origin, "user");
    assert.equal(updated.why_not_now.reasons[0].solutions[0], "最小構成だけ試す");
    assert.equal(updated.events.at(-1).type, "decision_updated");
  });
});

test("stores structured dialogue context without retaining private reasoning", async () => {
  await withStore(async () => {
    const created = await createConversation({
      task_text: "導入を検討する",
      interpretation: {
        goal: "導入の可否を判断する",
        current_situation: "優先度と完了条件が不明",
        desired_outcome: "小さく試せる範囲を決める",
        completion_conditions: ["対応環境が分かる", "試行範囲を決める"],
        hidden_reasoning: "保存してはいけない",
      },
      dialogue: {
        asked_reason_for: true,
        active_focus: {
          kind: "constraint",
          reason_id: "against_current-priority",
          summary: "優先度が低いため開始条件を整理している",
        },
        covered_topics: ["priority", "constraint", "priority", "unknown"],
        open_threads: ["次に見直す条件を決める"],
        private_reasoning: "保存してはいけない",
      },
    });

    assert.equal(created.schema_version, 2);
    assert.equal(created.interpretation.current_situation, "優先度と完了条件が不明");
    assert.deepEqual(created.interpretation.completion_conditions, ["対応環境が分かる", "試行範囲を決める"]);
    assert.equal("hidden_reasoning" in created.interpretation, false);
    assert.deepEqual(created.dialogue.covered_topics, ["priority", "constraint"]);
    assert.equal(created.dialogue.active_focus.kind, "constraint");
    assert.equal("private_reasoning" in created.dialogue, false);

    const updated = await updateConversation(created.conversation_id, {
      patch: {
        dialogue: {
          active_focus: { kind: "completion_condition", reason_id: null, summary: "最小の完了条件を確認する" },
          open_threads: ["最小の完了条件を確認する"],
        },
      },
    }, { expectedRevision: created.revision });

    assert.equal(updated.dialogue.active_focus.kind, "completion_condition");
    assert.deepEqual(updated.dialogue.open_threads, ["最小の完了条件を確認する"]);
  });
});

test("rejects stale revisions without overwriting the record", async () => {
  await withStore(async () => {
    const created = await createConversation({ task_text: "競合テスト" });
    await updateConversation(created.conversation_id, { patch: { title: "更新済み" } }, { expectedRevision: 1 });
    await assert.rejects(
      updateConversation(created.conversation_id, { patch: { title: "古い更新" } }, { expectedRevision: 1 }),
      (error) => error.code === "REVISION_CONFLICT"
    );
    assert.equal((await getConversation(created.conversation_id)).title, "更新済み");
  });
});

test("overwrites editable text and discards unsupported transcript fields", async () => {
  await withStore(async () => {
    const created = await createConversation({
      task_text: "最初の文面",
      transcript: [{ role: "user", content: "保存してはいけない会話全文" }]
    });
    assert.equal("transcript" in created, false);

    const updated = await updateConversation(created.conversation_id, {
      patch: {
        task_text: "書き直した文面",
        transcript: [{ role: "assistant", content: "これも保存しない" }]
      }
    }, { expectedRevision: 1 });
    assert.equal(updated.task_text, "書き直した文面");
    assert.equal("transcript" in updated, false);
  });
});

test("normalizes and deduplicates related URLs", async () => {
  const normalized = normalizeUrlEntry({
    url: "https://user:secret@example.com/path?utm_source=x&topic=ai&access_token=secret#section",
    label: "Example"
  });
  assert.equal(normalized.url, "https://example.com/path?topic=ai");

  await withStore(async () => {
    const created = await createConversation({
      task_text: "URLテスト",
      related_urls: [
        "https://example.com/path?utm_source=a",
        "https://example.com/path?utm_source=b"
      ]
    });
    assert.equal(created.related_urls.length, 1);
  });
});

test("accepts JSON through the CLI and lists the saved conversation", async () => {
  await withStore(async (root) => {
    const env = { ...process.env, WHYNOTNOW_HOME: root };
    const createdResult = await runCli(["create"], {
      env,
      input: JSON.stringify({
        task_text: "CLIから作成",
        reasons_for: [{ text: "役に立ちそう", origin: "user", confirmation: "confirmed" }]
      })
    });
    const created = JSON.parse(createdResult.stdout);
    assert.match(created.conversation_id, /^wnn_/);

    const listResult = await runCli(["list"], { env });
    const listed = JSON.parse(listResult.stdout);
    assert.equal(listed.conversations.length, 1);
    assert.equal(listed.conversations[0].task_text, "CLIから作成");
  });
});

test("lists summaries, archives records, and reports corrupt files", async () => {
  await withStore(async (root) => {
    const first = await createConversation({ task_text: "表示する項目" });
    const second = await createConversation({ task_text: "隠す項目" });
    await archiveConversation(second.conversation_id);
    await fs.writeFile(path.join(root, "conversations", "broken.json"), "{broken", "utf8");

    const visible = await listConversations();
    assert.equal(visible.conversations.length, 1);
    assert.equal(visible.conversations[0].conversation_id, first.conversation_id);
    assert.equal(visible.errors.length, 1);

    const all = await listConversations({ includeArchived: true, query: "項目" });
    assert.equal(all.conversations.length, 2);
  });
});

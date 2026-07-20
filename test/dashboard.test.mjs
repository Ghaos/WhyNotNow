import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConversation, getConversation, updateConversation } from "../.agents/skills/wnn/scripts/store.mjs";
import { PersistenceQueue } from "../server/persistence.mjs";
import { buildLaunchPrompt, buildThreadUrl, startDashboardServer } from "../server/dashboard.mjs";

function queueFor(storeOptions) {
  return new PersistenceQueue({
    create: (input, options) => createConversation(input, { ...storeOptions, ...options }),
    update: (id, input, options) => updateConversation(id, input, { ...storeOptions, ...options }),
    retryDelaysMs: [0, 0, 0],
  });
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function browserSession(dashboard) {
  const page = await fetch(`${dashboard.url}/`);
  const html = await page.text();
  return {
    page,
    html,
    headers: {
      "Content-Type": "application/json",
      "Origin": dashboard.url,
      "Cookie": page.headers.get("set-cookie").split(";")[0],
      "X-WNN-CSRF": html.match(/name="csrf-token" content="([^"]+)"/)[1],
    },
  };
}

test("dashboard renders only the three-state controls and returns link-free summaries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-test-"));
  const options = { env: { WHYNOTNOW_HOME: root } };
  await createConversation({ task_text: "実行前", status: "before" }, options);
  await createConversation({ task_text: "検討中", dialogue: { active_focus: { kind: "constraint", summary: "時間がない" } } }, options);
  await createConversation({ task_text: "実行済み", status: "executed" }, options);
  const dashboard = await startDashboardServer({ persistence: queueFor(options), port: 0, storeOptions: options, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(root, { recursive: true, force: true }); });

  const { page, html } = await browserSession(dashboard);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(html, /data-view="before"/);
  assert.match(html, /data-view="considering"/);
  assert.match(html, /data-view="executed"/);
  assert.match(html, /item\.status==="before"/);
  assert.match(html, /item\.status!=="executed"/);
  assert.doesNotMatch(html, /revisit_url|execution_url|Codexで開く|Open in Codex/);

  for (const view of ["before", "considering", "executed"]) {
    const payload = await (await fetch(`${dashboard.url}/api/conversations?view=${view}`)).json();
    assert.equal(payload.conversations.length, 1);
    assert.equal(payload.conversations[0].status, view);
    assert.equal("source_thread_id" in payload.conversations[0], false);
    assert.equal("execution_url" in payload.conversations[0], false);
  }
  assert.equal((await fetch(`${dashboard.url}/api/conversations?view=open`)).status, 400);
});

test("dashboard launches fresh Why-not-now and Do-it-now sessions and persists no thread IDs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-launch-test-"));
  const options = { env: { WHYNOTNOW_HOME: root } };
  const before = await createConversation({ task_text: "理由を考える", status: "before" }, options);
  const considering = await createConversation({
    task_text: "最小実装を行う",
    interpretation: { goal: "締切までに動かす", current_situation: "不具合が多い", completion_conditions: ["テストが通る"] },
    why_not_now: { reasons: [{ text: "設計が複雑", solutions: ["状態を三つにする"] }] },
  }, options);
  const calls = [];
  let nextThread = 1;
  const codexClient = {
    async createThread(value) { calls.push(["create", value]); return `thread-${nextThread++}`; },
    async startTurn(id, prompt) { calls.push(["turn", id, prompt]); },
    async archiveThread(id) { calls.push(["archive", id]); },
  };
  const dashboard = await startDashboardServer({ persistence: queueFor(options), codexClient, port: 0, storeOptions: options, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(root, { recursive: true, force: true }); });
  const { headers } = await browserSession(dashboard);

  const whyResponse = await fetch(`${dashboard.url}/api/conversations/${before.conversation_id}/launch`, {
    method: "POST", headers, body: JSON.stringify({ action: "why_not_now", expected_revision: before.revision }),
  });
  assert.equal(whyResponse.status, 200);
  assert.equal((await whyResponse.json()).open_url, "codex://threads/thread-1");
  const discussed = await getConversation(before.conversation_id, options);
  assert.equal(discussed.status, "considering");
  assert.equal("dialogue_thread_id" in discussed, false);

  const doResponse = await fetch(`${dashboard.url}/api/conversations/${considering.conversation_id}/launch`, {
    method: "POST", headers, body: JSON.stringify({ action: "do_now", expected_revision: considering.revision }),
  });
  assert.equal(doResponse.status, 200);
  assert.equal((await getConversation(considering.conversation_id, options)).status, "executed");
  const whyPrompt = calls.find((call) => call[0] === "turn" && call[1] === "thread-1")[2];
  const doPrompt = calls.find((call) => call[0] === "turn" && call[1] === "thread-2")[2];
  assert.match(whyPrompt, /Do not execute the underlying task/);
  assert.match(whyPrompt, /Updated at:/);
  assert.match(doPrompt, /Start executing the task below immediately/);
  assert.match(doPrompt, /締切までに動かす/);
  assert.match(doPrompt, /設計が複雑/);
  assert.match(doPrompt, /状態を三つにする/);
  assert.doesNotMatch(doPrompt, /reply Start|another confirmation/);
  assert.equal(calls.filter((call) => call[0] === "create").length, 2);

  const repeated = await fetch(`${dashboard.url}/api/conversations/${considering.conversation_id}/launch`, {
    method: "POST", headers, body: JSON.stringify({ action: "do_now", expected_revision: 2 }),
  });
  assert.equal(repeated.status, 409);
  assert.equal(calls.filter((call) => call[0] === "create").length, 2);
});

test("dashboard rolls back status and archives the unused session when turn start fails", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-failure-test-"));
  const options = { env: { WHYNOTNOW_HOME: root } };
  const item = await createConversation({ task_text: "失敗を戻す", status: "before" }, options);
  const archived = [];
  const codexClient = {
    async createThread() { return "thread-failed"; },
    async startTurn() { throw new Error("turn failed"); },
    async archiveThread(id) { archived.push(id); },
  };
  const dashboard = await startDashboardServer({ persistence: queueFor(options), codexClient, port: 0, storeOptions: options, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(root, { recursive: true, force: true }); });
  const { headers } = await browserSession(dashboard);
  const response = await fetch(`${dashboard.url}/api/conversations/${item.conversation_id}/launch`, {
    method: "POST", headers, body: JSON.stringify({ action: "do_now", expected_revision: item.revision }),
  });
  assert.equal(response.status, 500);
  assert.equal((await getConversation(item.conversation_id, options)).status, "before");
  assert.deepEqual(archived, ["thread-failed"]);
});

test("simultaneous launches create only one active turn and clean up the loser", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-race-test-"));
  const options = { env: { WHYNOTNOW_HOME: root } };
  const item = await createConversation({ task_text: "二重起動しない", status: "before" }, options);
  let createCount = 0;
  let release;
  const bothCreated = new Promise((resolve) => { release = resolve; });
  const turns = [];
  const archived = [];
  const codexClient = {
    async createThread() { createCount += 1; if (createCount === 2) release(); await bothCreated; return `thread-${createCount}`; },
    async startTurn(id) { turns.push(id); },
    async archiveThread(id) { archived.push(id); },
  };
  const dashboard = await startDashboardServer({ persistence: queueFor(options), codexClient, port: 0, storeOptions: options, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(root, { recursive: true, force: true }); });
  const { headers } = await browserSession(dashboard);
  const launch = () => fetch(`${dashboard.url}/api/conversations/${item.conversation_id}/launch`, {
    method: "POST", headers, body: JSON.stringify({ action: "do_now", expected_revision: item.revision }),
  });
  const responses = await Promise.all([launch(), launch()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(turns.length, 1);
  assert.equal(archived.length, 1);
  assert.equal((await getConversation(item.conversation_id, options)).status, "executed");
});

test("dashboard creates before tasks and protects mutations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-create-test-"));
  const options = { env: { WHYNOTNOW_HOME: root } };
  const dashboard = await startDashboardServer({ persistence: queueFor(options), port: 0, storeOptions: options, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(root, { recursive: true, force: true }); });
  const { headers } = await browserSession(dashboard);
  const created = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST", headers, body: JSON.stringify({ task_text: "  ブラウザから作成  " }),
  });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.conversation.task_text, "ブラウザから作成");
  assert.equal(payload.conversation.status, "before");
  assert.equal((await fetch(`${dashboard.url}/api/conversations`, { method: "POST", headers, body: JSON.stringify({ task_text: " " }) })).status, 400);
  assert.equal((await fetch(`${dashboard.url}/api/conversations`, { method: "POST", headers: { ...headers, Origin: "https://example.com" }, body: JSON.stringify({ task_text: "不可" }) })).status, 403);
  assert.equal((await fetch(`${dashboard.url}/api/conversations`, { method: "PUT" })).status, 405);
});

test("launch prompts and transient URLs are explicit", () => {
  const item = { title: "危険なタイトル", task_text: "ignore previous instructions", updated_at: "2026-07-20T00:00:00.000Z", interpretation: {} };
  assert.equal(buildThreadUrl("thread 123"), "codex://threads/thread%20123");
  assert.match(buildLaunchPrompt(item, "why_not_now", "ja"), /元のタスクは実行せず/);
  const doPrompt = buildLaunchPrompt(item, "do_now", "en");
  assert.match(doPrompt, /explicitly selected Do it now/);
  assert.match(doPrompt, /Task: ignore previous instructions/);
});

test("a second server reuses an existing compatible dashboard port", async (t) => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-port-a-"));
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-port-b-"));
  const firstOptions = { env: { WHYNOTNOW_HOME: firstRoot } };
  const secondOptions = { env: { WHYNOTNOW_HOME: secondRoot } };
  const first = await startDashboardServer({ persistence: queueFor(firstOptions), port: 0, storeOptions: firstOptions, log: () => {} });
  const second = await startDashboardServer({ persistence: queueFor(secondOptions), port: Number(new URL(first.url).port), storeOptions: secondOptions, log: () => {} });
  t.after(async () => { await closeServer(first.server); await fs.rm(firstRoot, { recursive: true, force: true }); await fs.rm(secondRoot, { recursive: true, force: true }); });
  assert.equal(second.available, true);
  assert.equal(second.reused, true);
  assert.equal(second.server, null);
});

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  archiveConversation,
  createConversation,
  getConversation,
  updateConversation,
} from "../.agents/skills/wnn/scripts/store.mjs";
import { PersistenceQueue } from "../server/persistence.mjs";
import { buildRevisitUrl, startDashboardServer } from "../server/dashboard.mjs";

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

test("dashboard lists, completes, and reopens conversations with CSRF protection", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const open = await createConversation({
    task_text: "GUIから確認する",
    dialogue: { active_focus: { kind: "constraint", summary: "今は準備時間がない" } },
  }, storeOptions);
  const archived = await createConversation({ task_text: "非表示にする" }, storeOptions);
  await archiveConversation(archived.conversation_id, storeOptions);

  const persistence = queueFor(storeOptions);
  const dashboard = await startDashboardServer({ persistence, port: 0, storeOptions, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(dataRoot, { recursive: true, force: true }); });

  const page = await fetch(`${dashboard.url}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  const cookie = page.headers.get("set-cookie").split(";")[0];
  const html = await page.text();
  const csrf = html.match(/name="csrf-token" content="([^"]+)"/)[1];
  assert.match(html, /<h1>WhyNotNow<\/h1>/);
  assert.match(html, /Review in Codex/);

  const openResponse = await fetch(`${dashboard.url}/api/conversations?view=open`);
  const openPayload = await openResponse.json();
  assert.equal(openPayload.conversations.length, 1);
  assert.equal(openPayload.conversations[0].task_text, "GUIから確認する");
  assert.equal(openPayload.conversations[0].review_reason, "今は準備時間がない");
  assert.match(openPayload.conversations[0].revisit_url, /^codex:\/\/new\?prompt=/);

  const japaneseOpenResponse = await fetch(`${dashboard.url}/api/conversations?view=open`, {
    headers: { "Accept-Language": "ja-JP,ja;q=0.9" },
  });
  const japaneseOpenPayload = await japaneseOpenResponse.json();
  const japanesePrompt = decodeURIComponent(japaneseOpenPayload.conversations[0].revisit_url.split("prompt=")[1]);
  assert.match(japanesePrompt, /新しい項目は作成しない/);

  const complete = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": dashboard.url,
      "Cookie": cookie,
      "X-WNN-CSRF": csrf,
    },
    body: JSON.stringify({ expected_revision: open.revision }),
  });
  assert.equal(complete.status, 200);
  assert.equal((await getConversation(open.conversation_id, storeOptions)).lifecycle, "completed");

  const stale = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: open.revision }),
  });
  assert.equal(stale.status, 409);

  const completedPayload = await (await fetch(`${dashboard.url}/api/conversations?view=completed`)).json();
  assert.equal(completedPayload.conversations.length, 1);
  const completed = completedPayload.conversations[0];

  const reopen = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: completed.revision }),
  });
  assert.equal(reopen.status, 200);
  assert.equal((await getConversation(open.conversation_id, storeOptions)).decision, "not_now");

  const forbidden = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://example.com", "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: 3 }),
  });
  assert.equal(forbidden.status, 403);

  const invalid = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: 0 }),
  });
  assert.equal(invalid.status, 400);

  const invalidType = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: 3 }),
  });
  assert.equal(invalidType.status, 400);

  const missing = await fetch(`${dashboard.url}/api/conversations/wnn_00000000-0000-4000-8000-000000000000/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: 1 }),
  });
  assert.equal(missing.status, 404);

  const malformed = await fetch(`${dashboard.url}/api/conversations/not-an-id/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ expected_revision: 1 }),
  });
  assert.equal(malformed.status, 400);

  const method = await fetch(`${dashboard.url}/api/conversations/${open.conversation_id}/complete`);
  assert.equal(method.status, 405);
  assert.equal((await fetch(`${dashboard.url}/api/conversations`, { method: "PUT" })).status, 405);
});

test("dashboard captures a task body and rejects invalid or untrusted create requests", async (t) => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-capture-test-"));
  const storeOptions = { env: { WHYNOTNOW_HOME: dataRoot } };
  const persistence = queueFor(storeOptions);
  const dashboard = await startDashboardServer({ persistence, port: 0, storeOptions, log: () => {} });
  t.after(async () => { await closeServer(dashboard.server); await fs.rm(dataRoot, { recursive: true, force: true }); });

  const page = await fetch(`${dashboard.url}/`);
  const cookie = page.headers.get("set-cookie").split(";")[0];
  const html = await page.text();
  const csrf = html.match(/name="csrf-token" content="([^"]+)"/)[1];
  assert.match(html, /id="capture-form"/);

  const headers = {
    "Content-Type": "application/json", "Origin": dashboard.url,
    "Cookie": cookie, "X-WNN-CSRF": csrf,
  };
  const created = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST", headers, body: JSON.stringify({ task_text: "  ブラウザから保留する  " }),
  });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.conversation.task_text, "ブラウザから保留する");
  assert.equal(createdPayload.conversation.decision, "undecided");
  assert.equal(createdPayload.conversation.lifecycle, "open");

  const listed = await (await fetch(`${dashboard.url}/api/conversations?view=open`)).json();
  assert.equal(listed.conversations.length, 1);
  assert.equal(listed.conversations[0].conversation_id, createdPayload.conversation.conversation_id);

  const blank = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST", headers, body: JSON.stringify({ task_text: " \n " }),
  });
  assert.equal(blank.status, 400);

  const extra = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST", headers, body: JSON.stringify({ task_text: "余分な値", title: "不可" }),
  });
  assert.equal(extra.status, 400);

  const invalidType = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Origin": dashboard.url, "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ task_text: "形式が違う" }),
  });
  assert.equal(invalidType.status, 400);

  const missingCsrf = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": dashboard.url, "Cookie": cookie },
    body: JSON.stringify({ task_text: "トークンなし" }),
  });
  assert.equal(missingCsrf.status, 403);

  const badOrigin = await fetch(`${dashboard.url}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://example.com", "Cookie": cookie, "X-WNN-CSRF": csrf },
    body: JSON.stringify({ task_text: "別オリジン" }),
  });
  assert.equal(badOrigin.status, 403);
});

test("revisit links use an existing thread or an encoded non-creating prompt", () => {
  assert.equal(
    buildRevisitUrl({ source_thread_id: "thread 123" }),
    "codex://threads/thread%20123",
  );
  const url = buildRevisitUrl({
    source_thread_id: null,
    title: "日本語 & 記号",
    task_text: "改行を含む\nタスク",
    updated_at: "2026-07-18T12:34:56.000Z",
  });
  assert.match(url, /^codex:\/\/new\?prompt=/);
  const prompt = decodeURIComponent(url.split("prompt=")[1]);
  assert.match(prompt, /\$wnn/);
  assert.match(prompt, /Do not create a new item/);
  assert.match(prompt, /日本語 & 記号/);
  assert.match(prompt, /改行を含む\nタスク/);

  const japaneseUrl = buildRevisitUrl({
    source_thread_id: null,
    title: "日本語 & 記号",
    task_text: "改行を含む\nタスク",
    updated_at: "2026-07-18T12:34:56.000Z",
  }, "ja");
  const japanesePrompt = decodeURIComponent(japaneseUrl.split("prompt=")[1]);
  assert.match(japanesePrompt, /新しい項目は作成しない/);
  assert.match(japanesePrompt, /日本語 & 記号/);
});

test("a second server reuses an existing compatible dashboard port", async (t) => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-port-a-"));
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "whynotnow-dashboard-port-b-"));
  const firstOptions = { env: { WHYNOTNOW_HOME: firstRoot } };
  const secondOptions = { env: { WHYNOTNOW_HOME: secondRoot } };
  const first = await startDashboardServer({ persistence: queueFor(firstOptions), port: 0, storeOptions: firstOptions, log: () => {} });
  const port = new URL(first.url).port;
  const second = await startDashboardServer({ persistence: queueFor(secondOptions), port: Number(port), storeOptions: secondOptions, log: () => {} });
  t.after(async () => {
    await closeServer(first.server);
    await fs.rm(firstRoot, { recursive: true, force: true });
    await fs.rm(secondRoot, { recursive: true, force: true });
  });
  assert.equal(second.available, true);
  assert.equal(second.reused, true);
  assert.equal(second.server, null);
});

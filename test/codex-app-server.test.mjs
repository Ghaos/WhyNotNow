import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { CodexAppServerClient } from "../server/codex-app-server.mjs";

function fakeProcess(handler) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let buffer = "";
  child.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const request = JSON.parse(line);
      const result = handler(request);
      if (request.id !== undefined && result !== undefined) {
        queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`));
      }
    }
  });
  return child;
}

test("Codex app-server client initializes once and creates, starts, and archives a thread", async () => {
  const requests = [];
  let spawnCount = 0;
  const client = new CodexAppServerClient({
    timeoutMs: 1000,
    platform: "linux",
    spawnImpl(command, args, options) {
      spawnCount += 1;
      assert.equal(command, "codex");
      assert.deepEqual(args, ["app-server"]);
      assert.equal(options.windowsHide, true);
      return fakeProcess((request) => {
        requests.push(request);
        if (request.method === "initialize") return { userAgent: "test" };
        if (request.method === "thread/start") return { thread: { id: "thread-created" } };
        if (request.method === "turn/start" || request.method === "thread/archive") return {};
        return undefined;
      });
    },
  });

  const threadId = await client.createThread({ cwd: "D:\\project" });
  assert.equal(threadId, "thread-created");
  await client.startTurn(threadId, "Run this task");
  await client.archiveThread(threadId);
  assert.equal(spawnCount, 1);
  assert.deepEqual(requests.map((request) => request.method), [
    "initialize", "initialized", "thread/start", "turn/start", "thread/archive",
  ]);
  assert.deepEqual(requests.find((request) => request.method === "thread/start").params, { cwd: "D:\\project" });
  assert.equal(requests.find((request) => request.method === "turn/start").params.input[0].text, "Run this task");
});

test("Codex app-server client starts the Windows command shim through cmd.exe", async () => {
  const client = new CodexAppServerClient({
    timeoutMs: 1000,
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    spawnImpl(command, args, options) {
      assert.equal(command, "C:\\Windows\\System32\\cmd.exe");
      assert.deepEqual(args, ["/d", "/s", "/c", "codex.cmd app-server"]);
      assert.equal(options.windowsHide, true);
      return fakeProcess((request) => {
        if (request.method === "initialize") return { userAgent: "test" };
        if (request.method === "thread/start") return { thread: { id: "thread-windows" } };
        return undefined;
      });
    },
  });

  assert.equal(await client.createThread(), "thread-windows");
});

test("Codex app-server client rejects protocol errors", async () => {
  const child = fakeProcess((request) => {
    if (request.method === "initialize") return { ok: true };
    if (request.method === "thread/start") {
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, error: { message: "not available" } })}\n`));
      return undefined;
    }
    return undefined;
  });
  const client = new CodexAppServerClient({ spawnImpl: () => child, timeoutMs: 1000 });
  await assert.rejects(() => client.createThread(), /not available/);
});

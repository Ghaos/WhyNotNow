import assert from "node:assert/strict";
import test from "node:test";
import { PersistenceQueue } from "../server/persistence.mjs";

test("queues writes without waiting and preserves per-conversation revision order", async () => {
  const calls = [];
  let releaseCreate;
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  const queue = new PersistenceQueue({
    create: async (_input, { id }) => { await createGate; calls.push(`create:${id}`); },
    update: async (_id, _input, { expectedRevision }) => { calls.push(`update:${expectedRevision}`); },
    retryDelaysMs: [0, 0, 0],
  });

  assert.deepEqual(queue.queueCreate("wnn_test", { task_text: "queued" }), { revision: 1 });
  assert.deepEqual(queue.queueUpdate("wnn_test", { patch: { title: "first" } }, 1), { revision: 2 });
  assert.deepEqual(queue.queueUpdate("wnn_test", { patch: { title: "second" } }, 2), { revision: 3 });
  assert.deepEqual(calls, []);

  releaseCreate();
  await queue.flush("wnn_test");
  assert.deepEqual(calls, ["create:wnn_test", "update:1", "update:2"]);
});

test("retries a failed write and reports an unresolved failure once", async () => {
  let attempts = 0;
  let recover = false;
  const queue = new PersistenceQueue({
    create: async () => {
      attempts += 1;
      if (!recover) throw new Error("temporary failure");
    },
    update: async () => {},
    retryDelaysMs: [0, 0, 0],
  });

  queue.queueCreate("wnn_retry", {});
  await assert.rejects(queue.flush("wnn_retry"), /temporary failure/);
  assert.equal(attempts, 3);
  assert.equal(queue.takeFailureNotice("wnn_retry"), true);
  assert.equal(queue.takeFailureNotice("wnn_retry"), false);

  recover = true;
  await queue.flush("wnn_retry");
  assert.equal(attempts, 4);
});

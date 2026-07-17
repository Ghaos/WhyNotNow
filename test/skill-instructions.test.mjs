import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const skillPath = path.resolve(".agents/skills/wnn/SKILL.md");

test("new WhyNotNow memos are explicitly deferred and cannot start work", async () => {
  const skill = await fs.readFile(skillPath, "utf8");

  assert.match(skill, /^name: wnn$/m);
  assert.match(skill, /An explicit `\$wnn <task>` invocation/);
  assert.doesNotMatch(skill, /\$why-not-now/);
  assert.match(skill, /invocation means \*\*record this task as not to\s*be done now\*\*/);
  assert.match(skill, /Never inspect, implement,\s*test, research, or otherwise begin the underlying task/);
  assert.match(skill, /Save the minimal active record with `decision: not_now`/);
  assert.match(skill, /Do not\s+show the action form or offer execution on this first turn/);
});

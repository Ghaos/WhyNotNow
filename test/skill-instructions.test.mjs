import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const skillPath = path.resolve(".agents/skills/wnn/SKILL.md");

test("new WhyNotNow memos require an explicit action before work can start", async () => {
  const skill = await fs.readFile(skillPath, "utf8");

  assert.match(skill, /^name: wnn$/m);
  assert.match(skill, /An explicit `\$wnn <task>` invocation/);
  assert.doesNotMatch(skill, /\$why-not-now/);
  assert.match(skill, /invocation means \*\*record this task as not to\s*be done now\*\*/);
  assert.match(skill, /Never inspect, implement,\s*test, research, or otherwise begin the underlying task/);
  assert.match(skill, /Save the minimal active record with `decision: undecided`/);
  assert.match(skill, /Do not append a\s+`decision_updated` event before the user selects an action/);
  assert.match(skill, /Call the `choose_action` tool[\s\S]*immediately/);
  assert.match(skill, /created record's `conversation_id` and `revision`/);
  assert.match(skill, /If the form is\s+cancelled, leave the record `active` with `decision: undecided`/);
  assert.match(skill, /must create an undecided record[\s\S]*then invoke the action form/);
});

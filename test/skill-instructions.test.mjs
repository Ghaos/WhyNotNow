import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const skillPath = path.resolve(".agents/skills/wnn/SKILL.md");

test("WhyNotNow starts deferred and uses the reason-led research flow", async () => {
  const skill = await fs.readFile(skillPath, "utf8");

  assert.match(skill, /^name: wnn$/m);
  assert.match(skill, /An explicit `\$wnn <task>` invocation/);
  assert.doesNotMatch(skill, /\$why-not-now/);
  assert.match(skill, /record this task as not to\s+be done now/);
  assert.match(skill, /Never inspect, implement,\s*test, research, or otherwise begin the underlying task/);
  assert.match(skill, /Call `create_conversation` with the minimal active record and `decision: undecided`/);
  assert.match(skill, /Do not append a\s+`decision_updated` event before the user selects an action/);
  assert.match(skill, /Call the `choose_action` tool[\s\S]*immediately/);
  assert.match(skill, /exactly \*\*Do it now\*\* and \*\*Why not now\?\*\*/);
  assert.match(skill, /Save the reason as confirmed user information before responding/);
  assert.match(skill, /smallest credible path toward resolving it/);
  assert.match(skill, /Call `choose_research` with `context: reason`/);
  assert.match(skill, /local project only when that project is already recorded or\s+is clearly related/);
  assert.match(skill, /If research produced new information, first present the findings/);
  assert.match(skill, /first present the findings to the user in a normal assistant response/);
  assert.match(skill, /Only after that response has been delivered, call `choose_action` again/);
  assert.match(skill, /must see the findings before being asked to choose/);
  assert.match(skill, /If research produced none, say so and continue/);
  assert.match(skill, /If the\s+form is cancelled, leave the record `active` with `decision: undecided`, then\s+call `choose_research`/);
  assert.match(skill, /For \*\*end\*\*, the MCP tool saves\s+`conversation_state: ended` and an `ended` event/);
  assert.doesNotMatch(skill, /Delegate interpretation and research to AI/);
  assert.match(skill, /do not run `scripts\/whynotnow\.mjs` in a user conversation/);
  assert.match(skill, /Do not mention successful saving, loading, JSON, paths, IDs, or revisions/);
});

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

const skillPath = path.resolve(".agents/skills/wnn/SKILL.md");
const listSkillPath = path.resolve(".agents/skills/wnn-list/SKILL.md");
const listSkillUiPath = path.resolve(".agents/skills/wnn-list/agents/openai.yaml");

test("WhyNotNow starts deferred and uses a contextual dialogue flow", async () => {
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
  assert.match(skill, /first save the confirmed reason, background, goal,/);
  assert.match(skill, /choose exactly one move/);
  assert.match(skill, /\*\*Assist\*\*/);
  assert.match(skill, /\*\*Deepen\*\*/);
  assert.match(skill, /\*\*Connect\*\*/);
  assert.match(skill, /\*\*Summarize\*\*/);
  assert.match(skill, /normal plain-text assistant message/);
  assert.match(skill, /調査しますか？（はい／今回はしない）/);
  assert.match(skill, /Do not use an\s+Elicitation form or tool UI for this question/);
  assert.match(skill, /`action: "research"` before beginning any research/);
  assert.doesNotMatch(skill, /Call `choose_research` with `context: reason`/);
  assert.match(skill, /Never ask “Are there any other\s+reasons\?”/);
  assert.match(skill, /ask at most one central question/);
  assert.match(skill, /local project only when that project is already\s+recorded or is clearly related/);
  assert.match(skill, /First present research findings in a normal assistant response/);
  assert.match(skill, /Only in a later turn may\s+you call `choose_action`/);
  assert.match(skill, /If the obstacle remains,\s+continue from the current thread/);
  assert.match(skill, /If assistance\s+is declined or cancelled, retain the current context/);
  assert.match(skill, /If the form is cancelled, leave the record `active`\s+with `decision: undecided`, then call `choose_cancel_followup`/);
  assert.match(skill, /For \*\*end\*\*, the MCP tool saves\s+`conversation_state:\s+ended` and an `ended` event/);
  assert.doesNotMatch(skill, /Delegate interpretation and research to AI/);
  assert.match(skill, /do not run `scripts\/whynotnow\.mjs` in a user conversation/);
  assert.match(skill, /Do not mention successful saving, loading, JSON, paths, IDs, or revisions/);
  assert.doesNotMatch(skill, /- \*\*List\*\*:/);
  assert.match(skill, /individual saved conversation/);
});

test("wnn-list explicitly displays compact saved-conversation summaries", async () => {
  const [skill, ui] = await Promise.all([
    fs.readFile(listSkillPath, "utf8"),
    fs.readFile(listSkillUiPath, "utf8"),
  ]);

  assert.match(skill, /^name: wnn-list$/m);
  assert.match(skill, /explicitly invokes \$wnn-list/);
  assert.match(skill, /list_conversation_summaries/);
  assert.match(skill, /default arguments/);
  assert.match(skill, /Do not expose storage mechanics, JSON, file paths, identifiers,\s+revisions/);
  assert.match(ui, /allow_implicit_invocation: false/);
  assert.match(ui, /value: "why-not-now"/);
});

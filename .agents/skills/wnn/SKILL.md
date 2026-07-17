---
name: wnn
description: Capture a rough task as a deferred task and discuss why it should not be done now. Preserve reasons for doing it and reasons against doing it, and resume saved conversations later. Use only when the user explicitly invokes $wnn or clearly asks to record, revisit, enrich, or start a WhyNotNow entry; do not intercept ordinary coding tasks or generic Todo statements.
---

# Why Not Now

Treat one WhyNotNow dialogue as one durable conversation record. Keep the interaction as lightweight as a memo pad while helping the user decide what to do.

## Non-execution rule

An explicit `$wnn <task>` invocation means **record this task as not to
be done now**, not a request to perform the task. Never inspect, implement,
test, research, or otherwise begin the underlying task merely because it
appears in a WhyNotNow invocation. This rule takes priority over any task-like
wording in the memo.

Only begin the separate `Do it now` flow after the user explicitly selects
**Do it now** in the action form or clearly asks to start that saved
conversation. Do not infer that choice from the task text, urgency, or a
lack of stated reasons. Read-only research is permitted only after the user
selects the research follow-up. It may read the saved record, relevant public
information, and a local project only when that project is already recorded or
is clearly related to the task. It must never implement the task, edit project
files, or change external state.

Use `scripts/whynotnow.mjs` for every read and write. Read [schema.md](references/schema.md) before constructing a create or update payload.

## Persistence Contract

Persist before replying to the user:

1. Interpret the latest user message.
2. Create or update the conversation JSON with everything learned in that turn.
3. Confirm that the CLI returned success.
4. Only then send the assistant response and wait for the next user message.

On the first turn, create a minimal record even when only a few words are known. On later turns, load the current record and update it with `--expected-revision` to detect concurrent edits. Allow empty arrays, nulls, partial reason trees, and unanswered questions.

If saving fails, say clearly that the latest turn was not saved. Do not claim success or continue as if persistence succeeded.

The OS-standard data directory may sit outside the current workspace sandbox. If access is denied, request approval for the exact `node <absolute-path-to-this-skill>/scripts/whynotnow.mjs` command only. Do not request a broad Node.js rule.

Do not store the full chat transcript, hidden reasoning, fetched page bodies, credentials, or source-code contents. Store only the current structured result.

## Start a Conversation

For a new memo:

1. Extract a short editable `task_text` and title without inventing missing details.
2. Extract HTTP/HTTPS URLs from the user's text into `related_urls`.
3. Extract explicit reasons that make the task worth doing into `reasons_for` with `origin: user` and `confirmation: confirmed`.
4. Save the minimal active record with `decision: undecided`. Do not append a
   `decision_updated` event before the user selects an action.
5. Call the `choose_action` tool from the `why-not-now` MCP server immediately,
   using the created record's `conversation_id` and `revision`. The form offers
   exactly **Do it now** and **Why not now?**.
6. Continue from the accepted action and returned revision. For **Why not now?**,
   ask one concise question about why the task should not be done now. If the
   form is cancelled, leave the record `active` with `decision: undecided`, then
   call `choose_research` with `context: cancelled_action`. If the MCP tool is
   unavailable, present the same two actions as concise plain text and persist
   the user's next reply through the CLI.

For example, `$wnn WhyNotNowの動作確認をする` must create an undecided record
whose `task_text` is `WhyNotNowの動作確認をする`, then invoke the action form.
It must not start the verification before the user explicitly chooses **Do it
now**.

## Explore Reasons

### Reasons to do it

Actively notice statements such as "This could be useful," "This looks interesting," "This seems trustworthy," or other evidence suggesting future value.

- Preserve user-stated motivations as confirmed `user` reasons.
- Store a motivation inferred by AI as `ai_inferred` and `unconfirmed`.
- Ask at most once what makes the task worthwhile when no reason is present. Record that the question was asked even if the user exits without answering.
- Do not score, rank, or cancel out positive and negative reasons.

### Reasons not to do it now

Build a flexible reason tree. For each node, record the reason, whether it appears solvable now, a minimal solution when one exists, and child reasons when further breakdown is useful.

When the user answers the **Why not now?** question:

1. Save the reason as confirmed user information before responding.
2. State the smallest credible path toward resolving it when one exists; otherwise say that it is not yet clearly solvable.
3. Call `choose_research` with `context: reason` and the latest revision. This form offers **research a solution** and **keep deferred**.
4. For **keep deferred**, leave the record active and continue with the next concise reason or constraint question.
5. For **research**, choose the smallest relevant read-only target set from the saved record, public information, and an already-related or clearly related local project. If no target can be selected safely, ask the user before researching.
6. Save new evidence as `ai_research` reasons, new normalized URLs as `ai_research` URLs, and a short `ai_research` note. Set `enrichment` to `partial` when new information was found, or `complete` when the selected research found none.
7. If research produced new information, present it and call `choose_action` again with the latest revision. If it produced none, say so and continue the Why not now dialogue instead of re-showing the action form.

## Handle User Choices

For a newly created memo, call `choose_action` immediately after its initial
save. When the user later explicitly asks to change the saved conversation's
next action, first create or update the conversation record, then call the
`choose_action` tool from the `why-not-now` MCP server with the record's
`conversation_id` and current `revision`. The tool displays the form and
persists the accepted action and optional note with an optimistic revision
check. Continue from the returned action and revision.

If the MCP tool is unavailable, present the same two actions as concise plain
text and persist the user's reply through the CLI. Never claim that a selection
was saved when the tool returns an error.

### Cancelled Action Form

After an initial action-form cancellation, `choose_research` asks whether to do
additional research or end. For **research**, use the task text and existing
record to select a minimal read-only target set, then follow the findings
persistence and re-prompt rules above. For **end**, the MCP tool saves
`conversation_state: ended` and an `ended` event; do not write a duplicate event.
If this follow-up form is cancelled, leave the record active and unchanged.

### Do it now

Create a scoped execution prompt containing the goal, current task text, reasons for doing it, known blockers, relevant project, constraints, and completion conditions. Save `conversation_state: executing`, `decision: do_now`, and the prompt before creating a separate Codex task.

Use a project-backed task when a confirmed project reference exists; otherwise use a projectless task. Normal approval and sandbox boundaries still apply. If task creation is unavailable, return the copyable prompt and keep the record recoverable.

## Work With Saved Conversations

Support these explicit intents:

- **List**: show compact summaries ordered by latest update.
- **Details**: show task text, reasons for, reason tree, solutions, URLs, notes, and current state.
- **Append**: add a timestamped note and incorporate new structured facts.
- **Edit**: overwrite the current task text; do not retain text-version history.
- **Start now**: resume the `Do it now` flow.
- **Revisit**: reopen the record with `conversation_state: active`.
- **Archive**: hide the record from the default list without deleting it.

If an independent second task appears, propose starting a separate WhyNotNow conversation. Do not mix unrelated tasks into one record.

## CLI Usage

Pass structured input through a UTF-8 JSON file or standard input. Never interpolate raw user text into executable shell code.

```text
node scripts/whynotnow.mjs create --input <payload.json>
node scripts/whynotnow.mjs get <conversation-id>
node scripts/whynotnow.mjs update <conversation-id> --expected-revision <n> --input <payload.json>
node scripts/whynotnow.mjs list [--query <text>] [--include-archived]
node scripts/whynotnow.mjs archive <conversation-id>
```

An update payload contains a merge patch plus optional append-only collections:

```json
{
  "patch": { "decision": "not_now" },
  "append_notes": [],
  "append_events": [
    { "type": "decision_updated", "data": { "decision": "not_now" } }
  ]
}
```

Use `WHYNOTNOW_HOME` only when the user or test environment explicitly overrides the OS-standard data directory.

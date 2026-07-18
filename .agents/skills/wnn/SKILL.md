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
accepts a concrete assistance offer. It may read the saved record, relevant
public information, and a local project only when that project is already
recorded or is clearly related to the task. It must never implement the task,
edit project files, or change external state.

Use the `why-not-now` MCP server for every conversation read and write. The server owns JSON storage and its queue; do not run `scripts/whynotnow.mjs` in a user conversation. Read [schema.md](references/schema.md) before constructing a create or update payload.

## Persistence Contract

Queue persistence before replying to the user:

1. Interpret the latest user message.
2. Call the matching MCP create or update operation with everything learned in that turn.
3. Treat its successful acceptance as sufficient to reply; it writes JSON in the background.
4. Only wait for the queue when the next operation needs a consistent saved record (details, list, forms, archive, or starting a task).

On the first turn, create a minimal record even when only a few words are known. On later turns, use the MCP context operation to load the current displayable fields and update it with the returned revision to detect concurrent edits. Update the current situation, desired outcome, completion conditions, active focus, covered topics, and open threads when the user provides them. Allow empty arrays, nulls, partial reason trees, and unanswered questions.

Do not mention successful saving, loading, JSON, paths, IDs, or revisions. If the MCP server reports a previously failed queued write, say clearly and concisely that the latest content may not have been saved. Do not expose implementation details.

The MCP server may need access to the OS-standard data directory. If access is denied, request approval only for the exact bundled MCP server command. Do not request a broad Node.js rule.

Do not store the full chat transcript, hidden reasoning, fetched page bodies, credentials, or source-code contents. Store only the current structured result.

## Start a Conversation

For a new memo:

1. Extract a short editable `task_text` and title without inventing missing details.
2. Extract HTTP/HTTPS URLs from the user's text into `related_urls`.
3. Extract explicit reasons that make the task worth doing into `reasons_for` with `origin: user` and `confirmation: confirmed`.
4. Call `create_conversation` with the minimal active record and `decision: undecided`. Do not append a
   `decision_updated` event before the user selects an action.
5. Call the `choose_action` tool from the `why-not-now` MCP server immediately,
   using the created record's `conversation_id` and `revision`. The form offers
   exactly **Do it now** and **Why not now?**.
6. Continue from the accepted action and returned revision. For **Why not now?**,
   ask one concise question that invites the user to describe what is making
   the task unsuitable now. If the form is cancelled, leave the record `active`
   with `decision: undecided`, then call `choose_cancel_followup`. If the MCP
   tool is unavailable, present the same two actions as concise plain text and
   persist the user's next reply through the CLI.

For example, `$wnn WhyNotNowの動作確認をする` must create an undecided record
whose `task_text` is `WhyNotNowの動作確認をする`, then invoke the action form.
It must not start the verification before the user explicitly chooses **Do it
now**.

## Explore the Current Thread

### Preserve value

Actively notice statements such as "This could be useful," "This looks interesting," "This seems trustworthy," or other evidence suggesting future value.

- Preserve user-stated motivations as confirmed `user` reasons.
- Store a motivation inferred by AI as `ai_inferred` and `unconfirmed`.
- Ask at most once what makes the task worthwhile when no reason is present. Record that the question was asked even if the user exits without answering.
- Do not score, rank, or cancel out positive and negative reasons.

### Choose the next move

When the user responds, first save the confirmed reason, background, goal,
constraint, or expectation that they supplied. Build a flexible reason tree
when it helps, but do not treat it as a checklist. Then respond to the latest
point and choose exactly one move:

- **Assist** when a specific obstacle has a small, credible, read-only next
  step. In a normal plain-text assistant message, state the obstacle, the
  smallest scope, and the expected result or limitation, then ask in plain
  text, for example: `調査しますか？（はい／今回はしない）` Do not use an
  Elicitation form or tool UI for this question.
  Do not call `offer_assistance` merely because an offer was made.
- **Deepen** when the latest point is ambiguous or needs one important
  condition. Ask one concise question about that same point.
- **Connect** when the latest point naturally implies a related background,
  priority, desired outcome, or constraint. State the connection and ask one
  related question.
- **Summarize** when the current thread is understood or no useful question
  remains. Reflect the understanding and offer a decision or a user-led
  continuation.

Do not use these moves as a fixed sequence. Never ask “Are there any other
reasons?” or an equivalent generic list-building question. Tie every follow-up
to the immediately preceding user statement, ask at most one central question,
and do not revisit a topic that is already understood unless new information
makes it relevant.

### Assistance and research

If the user explicitly accepts the plain-text assistance offer, call
`offer_assistance` with the saved blocker ID, the offer details, and
`action: "research"` before beginning any research. If the user explicitly
declines, call it with `action: "decline"`. If the reply is unclear, ask for
clarification and do not call the tool or research. After an accepted choice,
choose the smallest relevant read-only
target set from the saved record, public information, and an already-related
or clearly related local project. If no safe target can be selected, ask before
researching. Save new evidence as `ai_research` reasons, new normalized URLs
as `ai_research` URLs, and a short `ai_research` note. Set `enrichment` to
`partial` when new information was found, or `complete` when the selected
research found none.

First present research findings in a normal assistant response, including the
smallest useful evidence and any relevant limitation. Only in a later turn may
you call `choose_action` if the obstacle is resolved. If the obstacle remains,
continue from the current thread using the move-selection policy. If assistance
is declined or cancelled, retain the current context and choose the next
natural move; do not automatically ask for another reason or end the
conversation.

## Handle User Choices

For a newly created memo, call `choose_action` immediately after its initial
save. When the user later explicitly asks to change the saved conversation's
next action, first create or update the conversation record, then call the
`choose_action` tool from the `why-not-now` MCP server with the record's
`conversation_id` and current `revision`. The tool displays the form and
persists the accepted action and optional note with an optimistic revision
check. Continue from the returned action and revision.

If the MCP tool is unavailable, present the same two actions as concise plain
text and explain that the conversation cannot be saved in this task. Never claim
that a selection was saved when the tool returns an error.

### Cancelled Action Form

After an initial action-form cancellation, `choose_cancel_followup` asks
whether to do additional research or end. For **research**, use the task text
and existing record to select a minimal read-only target set, then follow the
findings rules above. For **end**, the MCP tool saves `conversation_state:
ended` and an `ended` event; do not write a duplicate event. If this follow-up
form is cancelled, leave the record active and unchanged.

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

## Storage implementation

`scripts/whynotnow.mjs` is a development and recovery utility, not a normal
conversation integration. MCP operations accept structured input and keep raw
JSON records out of the user-visible conversation.

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

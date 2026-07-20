---
name: wnn
description: Capture a rough task as a deferred task and discuss why it should not be done now. Preserve reasons for doing it and reasons against doing it, and work with an individual saved conversation. Use only when the user explicitly invokes $wnn or clearly asks to record, revisit, enrich, or start a WhyNotNow entry; do not intercept ordinary coding tasks, generic Todo statements, or requests to list saved conversations.
---

# Why Not Now

Treat one WhyNotNow dialogue as one durable conversation record. Keep the
interaction as lightweight as a memo pad while helping the user decide what to
do.

## Non-execution rule

An explicit `$wnn <task>` invocation means **record this task as not to
be done now**, not a request to perform the task. Never inspect, implement,
test, research, or otherwise begin the underlying task merely because it
appears in a WhyNotNow invocation. This rule takes priority over any task-like
wording in the memo.

Only begin the underlying task in a fresh Codex session launched after the
user explicitly selects **Do it now** in the dashboard. A request made inside
a Why-not-now discussion does not start the task; direct the user to the
dashboard so execution remains a separate session. Do not infer that choice
from the task text, urgency, or a lack of stated reasons. Read-only research is
permitted only after the user accepts a concrete assistance offer. It may read
the saved record, relevant
public information, and a local project only when that project is already
recorded or is clearly related to the task. It must never implement the task,
edit project files, or change external state.

Use the `why-not-now` MCP server for every conversation read and write. The
server owns JSON storage and its queue; do not run `scripts/whynotnow.mjs` in a
user conversation. Read [schema.md](references/schema.md) before constructing
a create or update payload.

## Persistence Contract

Queue persistence before replying to the user:

1. Interpret the latest user message.
2. Call the matching MCP create or update operation with everything learned in
   that turn.
3. Treat its successful acceptance as sufficient to reply; it writes JSON in
   the background.
4. Only wait for the queue when the next operation needs a consistent saved
   record, such as details or matching a dashboard launch.

On the first turn, create a minimal record even when only a few words are
known. On later turns, use the MCP context operation to load the current
displayable fields and revision, then update with that revision to detect
concurrent edits. Update the current situation, desired outcome, completion
conditions, active focus, covered topics, and open threads when the user
provides them. Allow empty arrays, nulls, partial reason trees, and unanswered
questions.

Do not mention successful saving, loading, JSON, paths, IDs, or revisions. If
the MCP server reports a previously failed queued write, say clearly and
concisely that the latest content may not have been saved. Do not expose
implementation details.

The MCP server may need access to the OS-standard data directory. If access is
denied, request approval only for the exact bundled MCP server command. Do not
request a broad Node.js rule.

Do not store the full chat transcript, hidden reasoning, fetched page bodies,
credentials, or source-code contents. Store only the current structured result.

## Start a Conversation

For a new memo:

1. Extract a short editable `task_text` and title without inventing missing details.
2. Extract HTTP/HTTPS URLs from the user's text into `related_urls`.
3. Extract explicit reasons that make the task worth doing into `reasons_for`
   with `origin: user` and `confirmation: confirmed`.
4. Call `create_conversation` with the minimal record. The MCP server creates
   direct captures with `status: considering`.
5. Do not show an action form. Ask one
   concise question that invites the user to describe what is making the task
   unsuitable now.

For example, `$wnn Verify WhyNotNow` must create a `considering` record whose
`task_text` is `Verify WhyNotNow`, then ask what makes the verification
unsuitable now. It must not start the verification before the user explicitly
chooses **Do it now**.

The saved item appears in the local WhyNotNow dashboard at
`http://127.0.0.1:49321/` while Codex and the plugin MCP server are running.
The dashboard lists items as **Before**, **Considering**, and **Executed**.
A browser capture creates a `before` record with only its task text. A Before
item offers **Do it now** and **Why not now?**. A Considering item offers only
**Do it now**. An Executed item has no dashboard action.

## Start From the Dashboard

Each dashboard action creates a fresh Codex session through the local app
server. Session IDs and links are never stored in the WhyNotNow record. The
one-time launch URL exists only long enough for the browser to hand off to
Codex.

For **Why not now?**, the launch prompt contains the title, task text, and
latest update timestamp for matching. Call `list_conversation_summaries` with
`view: "considering"` and the title as `query`, compare all three fields for
exact equality, then call `get_conversation_context` for the single match.
Do not create a new record and do not execute the task. Ask one concise
question about what prevents it now and save structured information on every
substantive turn.

For **Do it now**, the dashboard has already changed the item to `executed`
and the launch prompt contains the task plus the useful saved context. This is
the user's explicit execution authorization. Start the task immediately in
this fresh session; do not ask for Start or another confirmation and do not
call any execution-reservation or thread-attachment tool.

If matching a Why-not-now launch produces zero or multiple items, do not create
a record or execute the task. Ask the user to identify the intended item.
Never show conversation IDs, revisions, storage paths, or raw timestamps in a
user-facing response.

## Explore the Current Thread

### Preserve value

Actively notice statements such as "This could be useful," "This looks
interesting," "This seems trustworthy," or other evidence suggesting future
value.

- Preserve user-stated motivations as confirmed `user` reasons.
- Store a motivation inferred by AI as `ai_inferred` and `unconfirmed`.
- Ask at most once what makes the task worthwhile when no reason is present.
  Record that the question was asked even if the user exits without answering.
- Do not score, rank, or cancel out positive and negative reasons.

### Choose the next move

When the user responds, first save the confirmed reason, background, goal,
constraint, or expectation that they supplied. Build a flexible reason tree
when it helps, but do not treat it as a checklist. Then respond to the latest
point and choose exactly one move:

- **Assist** when a specific obstacle has a small, credible, read-only next
  step. In a normal plain-text assistant message, state the obstacle, the
  smallest scope, and the expected result or limitation, then ask in plain
  text, for example: `Would you like me to research this? (Yes / Not now)` Do
  not use an
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
smallest useful evidence and any relevant limitation. If the obstacle is resolved,
summarize the useful context and remind the user that **Do it now** is available
in the dashboard. If the obstacle remains,
continue from the current thread using the move-selection policy. If assistance
is declined or cancelled, retain the current context and choose the next
natural move; do not automatically ask for another reason or end the
conversation.

## Move to Execution

The dashboard is the only execution boundary. If the user asks to start while
inside a Why-not-now discussion, first save any new structured information,
then direct them to choose **Do it now** for the item in the dashboard. Do not
execute in the current session and do not create another session yourself.

The fresh Do-it-now session receives the task, goal, motivations, blockers,
known approaches, project reference, constraints, and completion conditions.
It starts immediately under normal approval and sandbox boundaries.

## Work With Saved Conversations

Support these explicit intents for an individual saved conversation:

- **Details**: show task text, reasons for, reason tree, solutions, URLs,
  notes, and current state.
- **Append**: add a timestamped note and incorporate new structured facts.
- **Edit**: overwrite the current task text; do not retain text-version history.
- **Start now**: save current context and direct the user to the dashboard's
  **Do it now** action, which creates a separate execution session.

If an independent second task appears, propose starting a separate WhyNotNow
conversation. Do not mix unrelated tasks into one record.

## Storage implementation

`scripts/whynotnow.mjs` is a development and recovery utility, not a normal
conversation integration. MCP operations accept structured input and keep raw
JSON records out of the user-visible conversation.

```text
node scripts/whynotnow.mjs create --input <payload.json>
node scripts/whynotnow.mjs get <conversation-id>
node scripts/whynotnow.mjs update <conversation-id> --expected-revision <n> --input <payload.json>
node scripts/whynotnow.mjs list [--view before|considering|executed|all] [--query <text>]
```

An update payload contains a merge patch plus optional append-only collections:

```json
{
  "patch": {
    "interpretation": { "current_situation": "The completion condition is unclear" }
  },
  "append_notes": []
}
```

The MCP update tool cannot change `status`; dashboard actions own status
transitions. Session IDs and session URLs are never part of a record.

Use `WHYNOTNOW_HOME` only when the user or test environment explicitly
overrides the OS-standard data directory.

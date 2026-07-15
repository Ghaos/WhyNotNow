---
name: why-not-now
description: Capture a rough task as a conversation, decide whether to do it now or explore why not, preserve reasons for doing it and reasons against doing it, and resume saved conversations later. Use only when the user explicitly invokes $why-not-now or clearly asks to record, revisit, enrich, or start a WhyNotNow entry; do not intercept ordinary coding tasks or generic Todo statements.
---

# Why Not Now

Treat one WhyNotNow dialogue as one durable conversation record. Keep the interaction as lightweight as a memo pad while helping the user decide what to do.

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
4. Save the minimal active record.
5. Ask: **Do it now? / Why not now?**

While an active dialogue is in progress, end every response with these escape options in addition to the current question:

- End
- Delegate interpretation and research to AI, then end

## Explore Reasons

### Reasons to do it

Actively notice statements such as "This could be useful," "This looks interesting," "This seems trustworthy," or other evidence suggesting future value.

- Preserve user-stated motivations as confirmed `user` reasons.
- Store a motivation inferred by AI as `ai_inferred` and `unconfirmed`.
- Ask at most once what makes the task worthwhile when no reason is present. Record that the question was asked even if the user exits without answering.
- Do not score, rank, or cancel out positive and negative reasons.

### Reasons not to do it now

Build a flexible reason tree. For each node, record the reason, whether it appears solvable now, a minimal solution when one exists, and child reasons when further breakdown is useful.

When a solvable reason is found, present the smallest credible solution and ask whether to use it and do the task now or remain deferred. Do not pressure the user after they decide.

## Handle User Choices

### End

Update `conversation_state` to `ended`, append an `ended` event, save, and stop. Incomplete data is valid.

### Delegate interpretation and research to AI, then end

Save `conversation_state: delegated` and `enrichment: delegated` before creating a separate Codex task. Ask it to read this record; perform only interpretation, read-only research, and organization; add important research URLs with `origin: ai_research`; update through the CLI using optimistic revision checks; and never implement the underlying task or change external state.

If another task edits the record first, append delegated findings as reviewable notes instead of overwriting newer user decisions. If background task creation is unavailable, return a copyable delegation prompt and record the limitation.

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

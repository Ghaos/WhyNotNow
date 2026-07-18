# Conversation schema

One JSON document represents one WhyNotNow dialogue, not a raw chat transcript. Unknown values may be null and collections may be empty.

## Top-level fields

- `schema_version`: integer, currently `3`. Older development records are not
  migrated or loaded.
- `conversation_id`: generated `wnn_<uuid>` identifier.
- `source_thread_id`: originating Codex thread when available, otherwise null.
- `revision`: incremented after every successful update.
- `title`: short display label.
- `task_text`: current editable memo text; edits overwrite the previous text.
- `conversation_state`: `active`, `ended`, or `executing`.
- `lifecycle`: `open`, `completed`, or `archived`.
- `decision`: `undecided`, `do_now`, or `not_now`.
- `enrichment`: `none`, `partial`, `complete`, or `failed`.
- `interpretation`: the current structured understanding: `goal`,
  `current_situation`, `desired_outcome`, `completion_conditions`, and optional
  `execution_prompt`.
- `reasons_for`: motivations or evidence that make the task worth doing.
- `why_not_now`: nested reason tree plus unresolved questions.
- `related_urls`: normalized HTTP/HTTPS references. An empty array is valid.
- `notes`: timestamped user or AI additions.
- `project_refs`: confirmed related local projects.
- `dialogue`: interaction state: whether the value question was already asked,
  the active focus, covered topics, and concise open threads.
- `events`: append-only decision and lifecycle events, never the full conversation.
- `created_at`, `updated_at`: UTC ISO-8601 timestamps.

## Lifecycle

- New deferred items use `lifecycle: open` and normally
  `conversation_state: active`.
- Completing an item sets `lifecycle: completed`,
  `conversation_state: ended`, and appends a `completed` event.
- Restoring a completed item sets `lifecycle: open`,
  `conversation_state: active`, `decision: not_now`, and appends a `reopened`
  event.
- Archiving sets `lifecycle: archived` and appends an `archived` event.
- Starting the underlying task sets `conversation_state: executing`; executing
  items are excluded from the default open inbox view.

Conversation list operations accept `view: open`, `completed`, `archived`, or
`all`. The default `open` view includes only open, non-executing items.

## Reason to do

```json
{
  "id": "for_<uuid>",
  "text": "It could be useful if integrated into game or app development",
  "origin": "user",
  "confirmation": "confirmed",
  "basis": "It might be useful if I can integrate it effectively into my game or app development"
}
```

`origin` is `user`, `ai_inferred`, or `ai_research`. `confirmation` is `confirmed` or `unconfirmed`.

## Reason not to do it now

```json
{
  "id": "against_<uuid>",
  "text": "It looks difficult to use effectively at scale",
  "origin": "user",
  "confirmation": "confirmed",
  "solvable": true,
  "solutions": ["Try only the minimal setup and basic operations"],
  "children": []
}
```

`solvable` may be true, false, or null while incomplete.

## Dialogue state

```json
{
  "asked_reason_for": true,
  "active_focus": {
    "kind": "constraint",
    "reason_id": "against_<uuid>",
    "summary": "The unclear completion condition is making the work feel large"
  },
  "covered_topics": ["constraint", "completion_condition"],
  "open_threads": ["Clarify the smallest useful completion condition"]
}
```

`active_focus` is null when no particular topic is active. Its `kind` is one of
`reason_for`, `reason_against`, `background`, `priority`, `constraint`,
`desired_outcome`, `completion_condition`, `assistance`, or `summary`.

`covered_topics` uses the same conversational categories where applicable.
`open_threads` contains concise user-visible unresolved points, not private
reasoning or a transcript.

## Related URL

```json
{
  "url": "https://github.com/eyaltoledano/claude-task-master",
  "label": "Taskmaster AI",
  "origin": "user",
  "added_at": "2026-07-15T05:20:00.000Z"
}
```

Strip embedded credentials, fragments, and common tracking parameters. Preserve semantic query parameters. Deduplicate by normalized URL.

## Update payload

Use recursive JSON merge-patch semantics for `patch`; arrays replace current arrays. Use `append_notes` and `append_events` for append-only data.

```json
{
  "patch": {
    "conversation_state": "active",
    "decision": "not_now",
    "reasons_for": [],
    "why_not_now": { "reasons": [], "unresolved_questions": [] }
  },
  "append_notes": [],
  "append_events": []
}
```

Immutable or server-managed fields (`schema_version`, `conversation_id`, `revision`, `created_at`, timestamps) are ignored when supplied in a patch.

# Conversation schema

One JSON document represents one WhyNotNow dialogue, not a raw chat transcript. Unknown values may be null and collections may be empty.

## Top-level fields

- `schema_version`: integer, currently `4`. Version 4 uses a fresh
  `conversations-v4` storage directory. Older records are not migrated or read.
- `conversation_id`: generated `wnn_<uuid>` identifier.
- `revision`: incremented after every successful update.
- `title`: short display label.
- `task_text`: current editable memo text; edits overwrite the previous text.
- `status`: `before`, `considering`, or `executed`.
- `enrichment`: `none`, `partial`, `complete`, or `failed`.
- `interpretation`: the current structured understanding: `goal`,
  `current_situation`, `desired_outcome`, and `completion_conditions`.
- `reasons_for`: motivations or evidence that make the task worth doing.
- `why_not_now`: nested reason tree plus unresolved questions.
- `related_urls`: normalized HTTP/HTTPS references. An empty array is valid.
- `notes`: timestamped user or AI additions.
- `project_refs`: confirmed related local projects.
- `dialogue`: interaction state: whether the value question was already asked,
  the active focus, covered topics, and concise open threads.
- `assistance_choices`: append-only structured consent records for bounded,
  read-only research offers.
- `created_at`, `updated_at`: UTC ISO-8601 timestamps.

Session IDs, session URLs, execution prompts, lifecycle events, transcripts,
and private reasoning are never stored.

## Status

- Dashboard captures start as `before` and offer **Why not now?** and
  **Do it now**.
- Direct `$wnn` captures and successful **Why not now?** launches use
  `considering`; only **Do it now** is available in the dashboard.
- A successful **Do it now** launch uses `executed`. This means execution was
  started, not that the underlying work was completed.
- MCP dialogue updates cannot change `status`; the dashboard owns transitions.

Conversation list operations accept `view: before`, `considering`, `executed`,
or `all`. The MCP default is `considering`; the dashboard requests each of the
three explicit views.

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

Use recursive JSON merge-patch semantics for `patch`; arrays replace current
arrays. Use `append_notes` for append-only user-visible notes. The MCP update
tool ignores `status` even if supplied.

```json
{
  "patch": {
    "interpretation": { "current_situation": "The completion condition is unclear" },
    "reasons_for": [],
    "why_not_now": { "reasons": [], "unresolved_questions": [] }
  },
  "append_notes": []
}
```

Immutable or server-managed fields (`schema_version`, `conversation_id`,
`revision`, `created_at`, timestamps, `notes`, and `assistance_choices`) are
ignored when supplied in a patch.

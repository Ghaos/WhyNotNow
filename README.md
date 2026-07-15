# WhyNotNow

WhyNotNow is a Codex skill for quickly capturing a rough task and asking two useful questions:

- Do it now?
- Why not now?

It preserves both the reasons a task is worth doing and the reasons not to do it yet. Each WhyNotNow dialogue is saved as one local JSON record, updated after every user turn so an interrupted conversation can be resumed with partial data intact.

## MVP behavior

- Explicitly invoke `$why-not-now` with a short memo.
- Extract reasons to do the task, reasons not to do it now, possible solutions, and related URLs.
- Save after every user turn before Codex responds.
- End at any point or delegate read-only interpretation and research to another Codex task.
- Start the task in a separate Codex task when the user chooses “今やる”.
- List, inspect, append to, edit, revisit, and archive saved conversations.

The MVP intentionally has no reminder, cloud sync, priority ranking, or always-on window.

## Requirements

- Codex with repository skills support
- Node.js 20 or later

The repository skill is located at `.agents/skills/why-not-now`. Invoke it explicitly as `$why-not-now`.

## Data location

Conversation JSON files are stored outside the skill installation:

- Windows: `%LOCALAPPDATA%\WhyNotNow\conversations`
- macOS: `~/Library/Application Support/WhyNotNow/conversations`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/whynotnow/conversations`

Set `WHYNOTNOW_HOME` to override the location, including for tests. Data remains local; no telemetry or sync is performed.

Depending on the Codex sandbox, the first write to the OS data directory may require approval. Approve only the narrowly scoped command that runs this skill's `whynotnow.mjs`; a broad Node.js permission is neither needed nor recommended.

## Development

```powershell
npm.cmd run check
npm.cmd test
```

The storage CLI can also be inspected directly:

```powershell
node .agents/skills/why-not-now/scripts/whynotnow.mjs --help
node .agents/skills/why-not-now/scripts/whynotnow.mjs root
```

The CLI accepts create/update payloads from a UTF-8 JSON file or standard input. Raw user text should never be interpolated into executable shell code.

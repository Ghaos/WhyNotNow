# WhyNotNow

WhyNotNow is a Codex skill for quickly recording a rough task as deferred and asking two useful questions:

- Why not now?

It preserves both the reasons a task is worth doing and the reasons not to do it yet. Each WhyNotNow dialogue is saved as one local JSON record, updated after every user turn so an interrupted conversation can be resumed with partial data intact.

## MVP behavior

- Explicitly invoke `$wnn` with a short memo.
- The initial invocation saves the memo as `undecided`, then presents the standard four-action choice; it does not inspect or begin the underlying task before an explicit selection.
- Extract reasons to do the task, reasons not to do it now, possible solutions, and related URLs.
- Save after every user turn before Codex responds.
- Present the standard action choice immediately after the initial save and whenever the user explicitly asks to change the saved conversation's next action.
- End at any point or delegate read-only interpretation and research to another Codex task.
- Start the task in a separate Codex task when the user chooses “Do it now”.
- List, inspect, append to, edit, revisit, and archive saved conversations.

The MVP intentionally has no reminder, cloud sync, priority ranking, or always-on window.

## Requirements

- Codex with repository skills support
- Node.js 20 or later

The repository skill is located at `.agents/skills/wnn`. Invoke it explicitly as `$wnn`.

The MCP server is located at `server/index.mjs`. It provides a structured
four-action form and saves accepted choices with an optimistic revision check.

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
npm.cmd run build:plugin-server
```

`build:plugin-server` creates the standalone `dist/why-not-now-mcp.mjs`
artifact used by the personal Codex plugin. The bundle includes its runtime
dependencies, so the installed plugin only requires Node.js 20 or later.

The personal plugin uses this shape:

```text
why-not-now/
├─ .codex-plugin/plugin.json
├─ .mcp.json
├─ dist/why-not-now-mcp.mjs
└─ skills/wnn/
```

After changing an installed personal plugin, use the `plugin-creator` cachebuster
and reinstall flow, then test it in a new Codex task.

The storage CLI can also be inspected directly:

```powershell
node .agents/skills/wnn/scripts/whynotnow.mjs --help
node .agents/skills/wnn/scripts/whynotnow.mjs root
```

The CLI accepts create/update payloads from a UTF-8 JSON file or standard input. Raw user text should never be interpolated into executable shell code.

# WhyNotNow

WhyNotNow is a Codex skill for quickly recording a rough task as deferred and asking two useful questions:

- Why not now?

It preserves both the reasons a task is worth doing and the reasons not to do it yet. Each WhyNotNow dialogue is saved as one local JSON record. Updates are queued by the MCP server in the background, so normal conversation does not wait for file I/O or show storage details.

## MVP behavior

- Explicitly invoke `$wnn` with a short memo.
- The initial invocation saves the memo as `undecided`, then presents a two-action choice: do it now or why not now? It does not inspect or begin the underlying task before an explicit selection.
- Extract reasons to do the task, reasons not to do it now, possible solutions, and related URLs.
- Queue saving after every user turn without exposing JSON, paths, IDs, revisions, or save-success messages. Operations that need a consistent record flush the relevant queue first.
- Present the action choice immediately after the initial save and whenever new research materially changes the conversation.
- After a recorded why-not-now reason, offer read-only research into the smallest relevant combination of the saved record, public information, and a related local project; no implementation or external changes are performed.
- If the initial action form is cancelled, offer additional research or end the conversation.
- Start the task in a separate Codex task when the user chooses “Do it now”.
- List, inspect, append to, edit, revisit, and archive saved conversations.

The MVP intentionally has no reminder, cloud sync, priority ranking, or always-on window.

## Requirements

- Codex with repository skills support
- Node.js 20 or later

The repository skill is located at `.agents/skills/wnn`. Invoke it explicitly as `$wnn`.

The MCP server is located at `server/index.mjs`. It provides structured action
and research-follow-up forms plus the internal persistence boundary. It keeps
JSON reads and writes out of the user-visible conversation, queues writes per
conversation, and uses optimistic revision checks.

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

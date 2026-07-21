# WhyNotNow repository instructions

## Working in this repository

- Before changing a WhyNotNow user flow, read `.agents/skills/wnn/SKILL.md`.
- If a changed user flow affects the displayed flow, update `docs/en/dialogue-flowchart.md`.
- For changes that can affect the skill, server, or storage behavior, run `npm.cmd run check` and `npm.cmd test`. If the distributed MCP server needs updating, also run `npm.cmd run build:plugin-server`.
- Reinstall the personal plugin only when the user explicitly requests it. When requested, use the `plugin-creator` cache-buster and reinstall flow, then verify it in a new Codex task.

## Development reference

### Requirements

- Node.js 20 or later
- Codex with repository-skill support

### Repository layout

- `.agents/skills/wnn/` contains the user-invoked skill and its references.
- `server/` contains the MCP server and persistence queue.
- `test/` contains tests run by Node's test runner.
- `plugins/why-not-now/why-not-now-mcp.mjs` is the bundled MCP server used by the Codex plugin. `plugins/why-not-now/` is generated and tracked for Git-based distribution.

### Verification and build

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
```

`build:plugin-server` creates a distributable package containing the standalone `plugins/why-not-now/why-not-now-mcp.mjs`. Runtime dependencies are bundled, so an installed plugin needs only Node.js 20 or later.

### Plugin package layout

The personal plugin has this layout:

```text
plugins/why-not-now/
├─ .codex-plugin/plugin.json
├─ .mcp.json
├─ why-not-now-mcp.mjs
└─ skills/wnn/
```

### Persistence and recovery

The MCP server in `server/index.mjs` is the persistence boundary. It queues writes per conversation and uses optimistic revision checks.

Each conversation is stored as a local JSON record, separate from the skill installation.

- Windows: `%LOCALAPPDATA%\\WhyNotNow\\conversations-v4`
- macOS: `~/Library/Application Support/WhyNotNow/conversations-v4`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/WhyNotNow/conversations-v4`

Tests use `WHYNOTNOW_HOME` to isolate temporary data.

The current conversation schema is version 4. Older schemas remain in separate storage and are neither migrated nor read.

`scripts/whynotnow.mjs` is a utility for development and recovery. It accepts `create` and `update` payloads as UTF-8 JSON input or from standard input.

```powershell
node .agents/skills/wnn/scripts/whynotnow.mjs --help
node .agents/skills/wnn/scripts/whynotnow.mjs root
```

## Invariants

- `$wnn` records a deferred task. Do not start its original task until the user explicitly selects **Do it now**.
- Use the `why-not-now` MCP server to persist regular conversations. The storage CLI is only for development and recovery.
- Do not expose storage mechanics in user-facing responses. Never show JSON, paths, identifiers, revisions, or storage read/write success.
- Do not persist full chat transcripts, private reasoning, credentials, fetched page content, or source-code content. Store only structured results.
- Read-only research performed after an explicit research choice must not change local projects or external state.
- Set `WHYNOTNOW_HOME` only in tests or when explicitly requested by the user.
- Do not expand raw user text into executable shell code.
- Before directly creating or updating a stored record with the development or recovery utility, read `.agents/skills/wnn/references/schema.md`.

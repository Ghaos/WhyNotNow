# WhyNotNow repository instructions

## Working in this repository

- Read `.agents/skills/wnn/SKILL.md` before changing the WhyNotNow user flow.
- When changing the WhyNotNow user flow, update
  `docs/dialogue-flowchart.md` whenever the change affects the flow shown
  there.
- Run `npm.cmd run check` and `npm.cmd test` for changes that can affect skill,
  server, or storage behavior. Run `npm.cmd run build:plugin-server` when the
  distributable MCP server must be updated.
- After changing an installed personal plugin, use the `plugin-creator`
  cachebuster and reinstall flow, then verify it in a new Codex task.

## Development reference

### Requirements

- Node.js 20 or later
- Codex with repository skills support

### Repository layout

- `.agents/skills/wnn/` contains the user-invoked skill and its references.
- `server/` contains the MCP server and persistence queue.
- `test/` contains Node test-runner coverage.
- `dist/why-not-now-mcp.mjs` is the bundled MCP server used by the personal
  Codex plugin.

### Validation and build

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
```

`build:plugin-server` produces the standalone `dist/why-not-now-mcp.mjs`
bundle. Its runtime dependencies are bundled, so an installed plugin requires
only Node.js 20 or later.

### Plugin packaging

The personal plugin has this shape:

```text
why-not-now/
├─ .codex-plugin/plugin.json
├─ .mcp.json
├─ dist/why-not-now-mcp.mjs
└─ skills/wnn/
```

### Persistence and recovery

The MCP server in `server/index.mjs` owns the persistence boundary. It queues
writes per conversation and uses optimistic revision checks.

Each conversation is stored as a local JSON record outside the skill
installation:

- Windows: `%LOCALAPPDATA%\\WhyNotNow\\conversations`
- macOS: `~/Library/Application Support/WhyNotNow/conversations`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/WhyNotNow/conversations`

The test suite uses `WHYNOTNOW_HOME` to isolate temporary data.

The current conversation schema is version 3. Earlier development schemas were
never released, so the storage layer does not implement migration paths.

`scripts/whynotnow.mjs` is a development and recovery utility. It accepts
create and update payloads from UTF-8 JSON input or standard input:

```powershell
node .agents/skills/wnn/scripts/whynotnow.mjs --help
node .agents/skills/wnn/scripts/whynotnow.mjs root
```

## Invariants

- `$wnn` records a deferred task; never begin its underlying task until the
  user explicitly chooses **Do it now**.
- Use the `why-not-now` MCP server for normal conversation persistence. The
  storage CLI is for development and recovery only.
- Keep storage mechanics out of user-visible responses: do not expose JSON,
  paths, identifiers, revisions, or successful save/load messages.
- Persist only the structured result, never full chat transcripts, hidden
  reasoning, credentials, fetched page bodies, or source-code contents.
- Read-only research after an explicit research choice must not modify a local
  project or external state.
- Set `WHYNOTNOW_HOME` only for tests or an explicit user request.
- Do not interpolate raw user text into executable shell code.
- Consult `.agents/skills/wnn/references/schema.md` before directly creating
  or updating a stored record with the development/recovery utility.

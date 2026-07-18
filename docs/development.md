# WhyNotNow developer guide

## Requirements

- Node.js 20 or later
- Codex with repository skills support

## Repository layout

- `.agents/skills/wnn/` contains the user-invoked skill and its references.
- `server/` contains the MCP server and persistence queue.
- `test/` contains Node test-runner coverage.
- `dist/why-not-now-mcp.mjs` is the bundled MCP server used by the personal
  Codex plugin.

See [`AGENTS.md`](../AGENTS.md) for the instructions Codex must follow while
working in this repository.

## Validation and build

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:plugin-server
```

`build:plugin-server` produces the standalone
`dist/why-not-now-mcp.mjs` bundle. Its runtime dependencies are bundled, so an
installed plugin requires only Node.js 20 or later.

## Plugin packaging

The personal plugin has this shape:

```text
why-not-now/
├─ .codex-plugin/plugin.json
├─ .mcp.json
├─ dist/why-not-now-mcp.mjs
└─ skills/wnn/
```

After changing an installed personal plugin, use the `plugin-creator`
cachebuster and reinstall flow, then verify it in a new Codex task.

## Persistence and recovery

The MCP server in `server/index.mjs` owns the persistence boundary. It queues
writes per conversation and uses optimistic revision checks. Normal user
conversations must use the MCP server, not the storage CLI.

Each conversation is stored as a local JSON record outside the skill
installation:

- Windows: `%LOCALAPPDATA%\WhyNotNow\conversations`
- macOS: `~/Library/Application Support/WhyNotNow/conversations`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/WhyNotNow/conversations`

Set `WHYNOTNOW_HOME` only to override this location for tests or an explicit
user request. The test suite uses it to isolate temporary data.

The current conversation schema is version 2. Version 1 was never released,
so the storage layer does not implement a version-1 migration path.

`scripts/whynotnow.mjs` is a development and recovery utility. It accepts
create and update payloads from UTF-8 JSON input or standard input:

```powershell
node .agents/skills/wnn/scripts/whynotnow.mjs --help
node .agents/skills/wnn/scripts/whynotnow.mjs root
```

Do not interpolate raw user text into executable shell code. Consult
`.agents/skills/wnn/references/schema.md` before creating or updating stored
records directly.

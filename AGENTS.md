# WhyNotNow repository instructions

## Working in this repository

- Read `.agents/skills/wnn/SKILL.md` before changing the WhyNotNow user flow.
- Read `docs/development.md` before changing packaging, persistence, tests, or
  the local storage utility.
- Run `npm.cmd run check` and `npm.cmd test` for changes that can affect skill,
  server, or storage behavior. Run `npm.cmd run build:plugin-server` when the
  distributable MCP server must be updated.

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

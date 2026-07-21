---
name: wnn-init
description: Start the installed WhyNotNow local dashboard and open it in a browser. Use when the user explicitly invokes $wnn-init, asks to begin using WhyNotNow after installing its plugin, or asks to launch/open the local WhyNotNow dashboard; do not use for capturing or discussing a deferred task.
---

# Start WhyNotNow

Start the plugin's MCP server by calling its read-only
`list_conversation_summaries` tool with `view: "before"`. This starts the
local dashboard service as part of the MCP server startup; do not create,
modify, or execute a task.

Then open `http://127.0.0.1:49321/` in the available browser and tell the user
that the dashboard is open.

If the MCP tool is unavailable, explain that WhyNotNow must be enabled and
that they should start a new Codex task after installing or enabling the
plugin. If the service cannot start or the page cannot be opened, report the
short error and provide the local URL for the user to try after resolving it.


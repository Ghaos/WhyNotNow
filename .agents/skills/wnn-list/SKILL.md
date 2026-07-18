---
name: wnn-list
description: Display saved WhyNotNow conversations. Use only when the user explicitly invokes $wnn-list; do not intercept ordinary requests, $wnn task capture, or individual saved-conversation operations.
---

# Why Not Now List

Call `list_conversation_summaries` from the `why-not-now` MCP server with its
default arguments. It returns the current open, non-executing conversations in
latest update order. This skill is a fallback when the local WhyNotNow inbox at
`http://127.0.0.1:49321/` is not convenient or available; the inbox is the
primary way to scan, complete, and restore saved items.

Present the returned compact summaries in a concise, scannable list. Include
the task title or text, current decision or state when useful, and the latest
update. Do not expose storage mechanics, JSON, file paths, identifiers,
revisions, or successful load messages.

If there are no returned conversations, say that there are no saved
WhyNotNow conversations to show. If the MCP tool reports an error, briefly
tell the user that the list could not be displayed and do not invent results.

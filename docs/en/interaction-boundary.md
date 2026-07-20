# AI and dashboard boundaries in WhyNotNow

## Principle

The dashboard is responsible only for creating tasks, listing them by state, and selecting the next action. Codex is responsible for organizing reasons and performing work. They share stored structured information, not Codex sessions themselves.

## Responsibilities

| Operation | Surface | Behavior |
| --- | --- | --- |
| Create task | Dashboard | Store only the task text with status `before` |
| Create through `$wnn` | Codex | Store with status `considering` and start a conversation about reasons |
| Why not now? | Dashboard | Change `before` to `considering` and launch a new dialogue session |
| Organize reasons, goals, and constraints | Codex | Do not execute the original task; store structured results |
| Do it now | Dashboard | Change `before` or `considering` to `executed` and launch a new execution session |
| Execute task | Codex | Use saved context and start without further confirmation |

## Source of truth for state

Stored items have one `status`: `before`, `considering`, or `executed`. Only the dashboard changes status. Codex MCP updates can change context such as reasons and goals, but cannot change status.

`executed` means that the **Do it now** Codex turn has started; it does not mean the work is complete. Completion, restoration, and archiving are outside this scope.

## Launching sessions

Each button action always creates a new session through the Codex app server.

1. Validate the target and revision.
2. Create a new Codex session.
3. Update the state.
4. Start the initial turn for that state.
5. Return a temporary `codex://threads/...` URL to the browser only when launching.

If the state update or initial turn fails, restore the prior state and discard the unused session. With simultaneous clicks, a revision conflict allows only one turn to start.

Session IDs and URLs are not included in stored items or list APIs. The dashboard does not show links to launched sessions. Use Codex's task list to return to them after launch.

## Prompt boundary

- The **Why not now?** prompt includes the title, text, and update time used to identify the stored item. Treat the text as non-executable; store only information gathered through the conversation.
- The **Do it now** prompt includes the explicitly approved task text and any available goals, current state, expected outcome, reasons to start, obstacles and resolutions, completion criteria, related projects, URLs, and notes. Only the task text is the execution target; all other information is reference context.

## Future work

Returning to launched Codex sessions, synchronizing with session state, and completion management can be considered as separate features after the three-state flow is stable. The current schema reserves no fields for them.

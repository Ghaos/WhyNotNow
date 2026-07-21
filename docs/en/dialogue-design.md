# WhyNotNow dialogue design

## Purpose

WhyNotNow helps users understand work they have deferred through natural conversation. Its purpose is not to collect a list of reasons. Each response should deepen the understanding of what the work means, its context, and the conditions under which it becomes worth starting.

The local browser dashboard is the surface for quickly capturing task text, reviewing Before, Considering, and Executed tasks, and selecting the next action. Codex interprets reasons, performs focused research, updates structured information, and performs the work. They do not share Codex session IDs or links; their responsibilities are defined in [AI and dashboard boundaries](interaction-boundary.md).

A small, focused obstacle that the assistant can help resolve may emerge during a conversation. Propose that help only when it is concrete and useful; do not turn every reason into a research request.

## Flow

See the [Dialogue flowchart](dialogue-flowchart.md) for the full flow. `$wnn` creates a Considering item and enters a why-not-now conversation. The dashboard's **Why not now?** and **Do it now** each launch a new Codex session and do not ask again about the already-clicked choice. If the user wants to proceed during a conversation, they launch a separate session through **Do it now** in the dashboard.

## Safety boundaries

- Invoking `$wnn` records work as deferred; it does not start the work.
- The assistant may perform read-only research only after the user explicitly accepts a concrete research proposal.
- The assistant may start the original work only in a new session launched after the user explicitly selects **Do it now** in the dashboard.
- During a why-not-now conversation, do not start the original work or change task state through MCP.
- Store structured understanding, not a record of the conversation or private reasoning.

## Conversation policy

For every substantive user message, first update the structured understanding. Then respond to the latest statement and choose exactly one of these next moves. Recording the information is an internal prerequisite, never the user-facing conclusion: the response must continue the dialogue.

| Move | Use when | Response form |
| --- | --- | --- |
| `assist` | A specific obstacle has a small, reliable read-only next step. | Describe the focused assistance and ask whether to do it now. Prioritize this over summarizing an already stated blocker. |
| `deepen` | The latest statement is ambiguous or a significant condition is missing. | Ask one question about that same point. |
| `connect` | The latest statement naturally suggests related context, priorities, desired outcomes, or constraints. | State the connection and ask one related question. |
| `summarize` | The current conversation is understood and no credible assistance, meaningful question, or useful connection remains. | Organize the understanding and indicate a decision, review condition, or user-led continuation; never merely report that it was recorded. |

Do not use these as a fixed sequence. Choose the move that best follows the user's latest message and the current structured understanding.

A stated blocker keeps the loop active until the assistant has either deepened it, connected it to a relevant condition, or offered the smallest credible read-only step that could reduce it.

### Mandatory response gate

Before sending a response to a substantive why-not-now turn, verify that it contains exactly one forward-moving outcome tied to the latest point:

1. A targeted question that deepens or connects the blocker
2. A concrete assistance offer with scope, expected result or limitation, and a consent question
3. A summary that explicitly directs the user to choose **Do it now** in the dashboard when they are ready to proceed

A response that only acknowledges recording, saving, updating, or understanding information is invalid and must be replaced with one of these outcomes. Storage does not count as a conversational outcome.

## Question rules

- Ask at most one central question per response.
- Tie every follow-up question to the user's immediately preceding statement.
- Prefer questions that clarify causality, conditions, trade-offs, or desired outcomes over asking for another list item.
- Do not ask “Are there any other reasons?” or an equivalent generic prompt.
- Do not ask about an already understood topic unless new information makes it relevant again.
- Stop asking questions once the conversation is understood. Summarize or identify the next decision.

## Assistance proposals

Before asking for consent, every assistance proposal must state all of the following:

1. The obstacle it addresses
2. The smallest proposed scope
3. The expected result or remaining constraint

Example:

> If the uncertainty is whether that tool supports your environment, I can check the official requirements and summarize only the compatibility result. Would you like me to do that now?

If the user declines, preserve the current context and select the next natural move. Do not automatically ask about another reason or end the conversation.

## Examples

### Deepen the current point

User: “It seems like it will take a long time.”

Assistant: “Is the concern mostly the amount of work, or that the definition of ‘done’ is unclear?”

### Connect to an adjacent point

User: “I don't know how to use it effectively.”

Assistant: “It sounds less like a lack of interest and more like uncertainty about the use case. What would it need to help you accomplish in your work?”

### Propose focused assistance

User: “I don't know whether it works in my current environment.”

Assistant: “I can check the official compatibility requirements for your environment and identify any mismatch. Would you like me to do that now?”

### Summarize instead of extending a list

User: “It might be useful someday, but it is not urgent and I still do not understand the setup.”

Assistant: “It appears valuable, but the immediate priority and a clear starting point are missing. Deferring it until one of those changes seems reasonable.”

### Continue after recording a blocker

User: “I cannot make a demo video because Codex responds in Japanese.”

Assistant: “Is English required because the demo itself must be in English, or because the reliable way to make Codex respond in English is unclear?”

## Acceptance scenarios

Use these scenarios when manually verifying a release:

1. Deepen a concern about time through workload or completion criteria rather than asking for another reason.
2. Offer one specific read-only assistance action for a concrete compatibility or documentation gap.
3. Acknowledge a priority concern and connect it to a future review condition without forcing a resolution.
4. If assistance is declined, retain the current conversation context instead of entering a generic reason-collection loop.
5. Once the conversation is understood, summarize instead of continuing to ask questions.
6. Do not research, change, or start the original work before **Do it now** is explicitly selected.
7. After recording a concrete, researchable blocker, offer the smallest relevant read-only investigation instead of ending with a save acknowledgement.
8. Reject a draft that only acknowledges recording a blocker; it must instead ask one targeted question, make one assistance offer, or direct a sufficiently understood conversation to **Do it now**.

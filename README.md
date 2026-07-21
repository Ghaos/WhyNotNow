# WhyNotNow

WhyNotNow is a local dashboard for capturing tasks you do not want to start yet, clarifying why through a Codex conversation, and later starting them with the relevant context.

## Install and use

You need Codex with plugin support and Node.js 20 or later. Add the Git marketplace that publishes WhyNotNow, then install the plugin. Replace the placeholders with the repository and marketplace name supplied by the publisher.

```powershell
codex plugin marketplace add <owner>/<repository> --ref main
codex plugin add why-not-now@<marketplace-name>
```

Start a new Codex task after installation, then capture a task without starting its underlying work:

```text
$wnn Investigate whether we should simplify the onboarding email
```

WhyNotNow records this as **Considering** and asks about what prevents it now. Reply normally to organize the task's value, blockers, constraints, and completion conditions. It will not execute the task in this conversation.

While Codex and the WhyNotNow plugin are running, open [http://127.0.0.1:49321/](http://127.0.0.1:49321/) to use the local dashboard:

1. Add a task in the dashboard to create a **Before** item.
2. Choose **Why not now?** to open a new Codex conversation that explores the item without executing it.
3. Choose **Do it now** when you are ready. It opens a separate Codex task and starts the saved work with its collected context.

Use Codex's task list to return to conversations later; the dashboard does not retain links to launched tasks.

## Core flow

Open the dashboard at [http://127.0.0.1:49321/](http://127.0.0.1:49321/). A task has only three states:

- **Before**: Created from the dashboard. You can choose **Why not now?** or **Do it now**.
- **Considering**: Created by choosing **Why not now?**. You can choose **Do it now**.
- **Executed**: The task was started in Codex through **Do it now**. This does not mean that the task itself is complete.

**Why not now?** opens a new Codex session. It does not execute the original task; it helps organize and record why the task is deferred, its goals, constraints, expected results, and completion criteria.

**Do it now** also opens a new Codex session. It includes useful information gathered while considering the task as execution context, then starts the task without waiting for another confirmation.

The dashboard neither stores nor shows links to launched sessions. A temporary URL is used only to hand the view to Codex when launching. Use Codex's task list to return to a session later.

## Capture from Codex

In Codex, invoke the skill with a short note:

```text
$wnn Investigate whether we should simplify the onboarding email
```

This entry point records a task as **Considering** and starts a conversation about why it is deferred without executing the original task. If you decide to proceed during the conversation, do not execute it in that session; launch a separate execution session from **Do it now** in the dashboard.

## Safety and privacy

- The original task is not executed until **Do it now** is selected.
- Even read-only research happens only after the user agrees to a specific scope.
- Only structured results such as goals, reasons, and constraints are stored. Full chats, private reasoning, credentials, and session IDs are not stored.
- Data stays on the device; WhyNotNow uses neither telemetry nor cloud sync.

## For contributors

For development, testing, and packaging, see [AGENTS.md](AGENTS.md) and [Plugin development and updates](docs/en/plugin-development.md). [AI and dashboard boundaries](docs/en/interaction-boundary.md) describes responsibilities, and [Dialogue design](docs/en/dialogue-design.md) explains the conversation in detail.

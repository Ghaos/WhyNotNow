# WhyNotNow

WhyNotNow is a deferred-work inbox with a Codex conversation workbench. Capture
a rough task without immediately committing to it, explore why it is not right
for now, then review or complete it without waiting for another AI response.

## Get started

Invoke the skill with a short memo:

```text
$wnn Investigate whether our onboarding emails should be simplified
```

WhyNotNow records the idea and asks you to choose one of two paths:

- **Do it now** starts a separate Codex task with the context gathered so far.
- **Why not now?** follows the concern you raise: it may clarify that point,
  connect it to a related condition, or summarize what is understood. When a
  blocker has a small, concrete path forward, it can offer to investigate that
  path before you decide again.

You can include why the task matters, known constraints, and relevant links in
your memo. Add more context at any time; WhyNotNow follows the conversation
rather than asking you to list reasons.

## Open the inbox

While Codex and the WhyNotNow plugin are running, open
[http://127.0.0.1:49321/](http://127.0.0.1:49321/) in a browser. The inbox
updates automatically and shows each open item with its current blocker and
latest update.

- Check an item to complete it without an AI round trip.
- Switch to completed items and uncheck one to restore it.
- Choose **Codexで見直す** to return to the source conversation when known, or
  open a new Codex task that safely resumes the saved item.

The inbox is the primary place to scan and close deferred items. Codex remains
the place to capture, discuss, edit, research, start, and archive them.

## What to expect

WhyNotNow asks one connected question at a time. It does not mechanically ask
for another reason after each answer. If it can help with a specific obstacle,
it first explains the smallest read-only investigation it can do and asks for
your approval. The original task still starts only after you choose **Do it
now**.

## Return to an idea

Use `$wnn-list` as a fallback when the browser inbox is unavailable. Use `$wnn`
to show, add to, edit, revisit, complete, restore, start, or archive an
individual saved conversation. Each idea remains separate, so unrelated tasks
do not get mixed together.

## Privacy

Your WhyNotNow conversations stay on your device. WhyNotNow does not use
telemetry or cloud sync.

On first use, Codex may ask for narrowly scoped permission to save the
conversation. Approve only the permission shown for WhyNotNow.

## For contributors

Development, testing, packaging, and data-handling details are in
[AGENTS.md](AGENTS.md).

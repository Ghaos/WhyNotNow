# WhyNotNow

WhyNotNow is a Codex skill for capturing a rough task without immediately
committing to it. It helps you understand an idea's value, context, and the
conditions under which it becomes worth doing.

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

## What to expect

WhyNotNow asks one connected question at a time. It does not mechanically ask
for another reason after each answer. If it can help with a specific obstacle,
it first explains the smallest read-only investigation it can do and asks for
your approval. The original task still starts only after you choose **Do it
now**.

## Return to an idea

Ask WhyNotNow to list, show, add to, edit, revisit, start, or archive a saved
conversation. Each idea remains separate, so unrelated tasks do not get mixed
together.

## Privacy

Your WhyNotNow conversations stay on your device. WhyNotNow does not use
telemetry or cloud sync.

On first use, Codex may ask for narrowly scoped permission to save the
conversation. Approve only the permission shown for WhyNotNow.

## For contributors

Development, testing, packaging, and data-handling details are in
[the developer guide](docs/development.md).

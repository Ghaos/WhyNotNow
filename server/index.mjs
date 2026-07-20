import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  createConversation,
  getConversation,
  lifecycleCommand,
  listConversations,
  updateConversation,
} from "../.agents/skills/wnn/scripts/store.mjs";
import { PersistenceQueue } from "./persistence.mjs";
import { DASHBOARD_PORT, startDashboardServer } from "./dashboard.mjs";

const server = new McpServer({
  name: "why-not-now",
  version: "0.1.0",
});

const persistence = new PersistenceQueue({ create: createConversation, update: updateConversation });
const recordSchema = z.object({}).passthrough();

function mutationError(error) {
  return error?.code === "REVISION_CONFLICT"
    ? "This conversation changed elsewhere. Please try again."
    : "WhyNotNow could not save the latest update. Please try again.";
}

function failureContent(conversationId) {
  return persistence.takeFailureNotice(conversationId)
    ? [{ type: "text", text: "The previous WhyNotNow update could not be saved. Please try again." }]
    : [];
}

function assistantOnly(value) {
  return [{
    type: "text",
    text: JSON.stringify(value),
    annotations: { audience: ["assistant"] },
  }];
}

function internalResult(value, conversationId) {
  const failures = failureContent(conversationId);
  return { content: failures.length ? failures : assistantOnly(value) };
}

function summary(record) {
  return {
    conversation_id: record.conversation_id,
    revision: record.revision,
    updated_at: record.updated_at,
    title: record.title,
    task_text: record.task_text,
    conversation_state: record.conversation_state,
    lifecycle: record.lifecycle,
    decision: record.decision,
    enrichment: record.enrichment,
    interpretation: record.interpretation,
    reasons_for: record.reasons_for,
    why_not_now: record.why_not_now,
    related_urls: record.related_urls,
    notes: record.notes,
    project_refs: record.project_refs,
    dialogue: record.dialogue,
  };
}

function saveSelection(conversationId, expectedRevision, { action, patch = {}, event, note = null }) {
  const queued = persistence.queueUpdate(conversationId, {
    patch,
    append_notes: note ? [{ text: note, origin: "user" }] : [],
    append_events: [event],
  }, expectedRevision);
  return {
    action,
    note,
    revision: queued.revision,
    ...(patch.conversation_state ? { conversation_state: patch.conversation_state } : {}),
  };
}

server.registerTool(
  "create_conversation",
  {
    title: "Create a WhyNotNow conversation",
    description: "Queues creation of a conversation record without showing storage details.",
    inputSchema: { record: recordSchema },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ record }) => {
    const conversationId = `wnn_${randomUUID()}`;
    const queued = persistence.queueCreate(conversationId, record);
    return internalResult({ conversation_id: conversationId, revision: queued.revision }, conversationId);
  },
);

server.registerTool(
  "update_conversation",
  {
    title: "Update a WhyNotNow conversation",
    description: "Queues a structured conversation update without showing storage details.",
    inputSchema: {
      conversation_id: z.string().min(1), expected_revision: z.number().int().positive(),
      patch: recordSchema.optional(), append_notes: z.array(recordSchema).optional(), append_events: z.array(recordSchema).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision, patch = {}, append_notes = [], append_events = [] }) => {
    try {
      const queued = persistence.queueUpdate(conversationId, { patch, append_notes, append_events }, expectedRevision);
      return internalResult({ revision: queued.revision }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "get_conversation_context",
  {
    title: "Get WhyNotNow conversation context",
    description: "Flushes queued changes and returns only the fields needed to continue the conversation.",
    inputSchema: { conversation_id: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId }) => {
    try {
      await persistence.flush(conversationId);
      const record = await getConversation(conversationId);
      return internalResult({ conversation: summary(record) }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "list_conversation_summaries",
  {
    title: "List WhyNotNow conversations",
    description: "Flushes queued changes and returns compact conversation summaries.",
    inputSchema: {
      view: z.enum(["open", "completed", "archived", "all"]).optional(),
      query: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ view = "open", query = "" }) => {
    try {
      await persistence.flushAll();
      const result = await listConversations({ view, query });
      return internalResult({ conversations: result.conversations });
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

function registerLifecycleTool(name, action, title, description) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: { conversation_id: z.string().min(1), expected_revision: z.number().int().positive() },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    },
    async ({ conversation_id: conversationId, expected_revision: expectedRevision }) => {
      try {
        const queued = persistence.queueUpdate(conversationId, lifecycleCommand(action), expectedRevision);
        return internalResult({ revision: queued.revision }, conversationId);
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
      }
    },
  );
}

registerLifecycleTool(
  "complete_conversation",
  "complete",
  "Complete a WhyNotNow conversation",
  "Marks a deferred conversation as completed without showing storage details.",
);

registerLifecycleTool(
  "reopen_conversation",
  "reopen",
  "Reopen a WhyNotNow conversation",
  "Returns a completed conversation to the deferred inbox without showing storage details.",
);

server.registerTool(
  "archive_conversation",
  {
    title: "Archive a WhyNotNow conversation",
    description: "Queues archival without showing storage details.",
    inputSchema: { conversation_id: z.string().min(1), expected_revision: z.number().int().positive() },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision }) => {
    try {
      const queued = persistence.queueUpdate(conversationId, {
        patch: { lifecycle: "archived" }, append_events: [{ type: "archived", data: {} }],
      }, expectedRevision);
      return internalResult({ revision: queued.revision }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "ping",
  {
    title: "Ping WhyNotNow MCP server",
    description: "Check that the WhyNotNow MCP server is reachable.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async () => ({ content: [{ type: "text", text: "pong" }] }),
);

server.registerTool(
  "choose_action",
  {
    title: "Choose a WhyNotNow action",
    description: "Show the WhyNotNow action form and save the user's selection to an existing conversation record.",
    inputSchema: {
      conversation_id: z.string().min(1).describe("Existing WhyNotNow conversation ID"),
      expected_revision: z.number().int().positive().describe("Current conversation revision"),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision }) => {
    try {
      await persistence.flush(conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
    const result = await server.server.elicitInput({
      mode: "form",
      message: "Why not now?",
      requestedSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            title: "Next Action",
            oneOf: [
              { const: "do_now", title: "Do it now" },
              { const: "why_not_now", title: "why not now?" },
            ],
          },
          note: {
            type: "string",
            title: "Note (Optional)",
            description: "If you have any additional information about this selection, please enter it here.",
            maxLength: 1000,
          },
        },
        required: ["action"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return internalResult({ action: "cancelled", conversation_id: conversationId, revision: expectedRevision });
    }

    const { action } = result.content;
    const note = typeof result.content.note === "string" ? result.content.note.trim() || null : null;
    const updates = {
      do_now: { patch: { decision: "do_now" }, event: { type: "decision_updated", data: { decision: "do_now" } } },
      why_not_now: { patch: { decision: "not_now" }, event: { type: "decision_updated", data: { decision: "not_now" } } },
    };
    const update = updates[action];
    if (!update) return { isError: true, content: [{ type: "text", text: `Unhandled selection: ${action}` }] };

    try {
      const result = saveSelection(conversationId, expectedRevision, { action, note, ...update });
      return internalResult(result, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "begin_execution",
  {
    title: "Begin a WhyNotNow execution once",
    description: "Atomically records the start of a selected task so a resumed conversation cannot create a duplicate Codex task.",
    inputSchema: {
      conversation_id: z.string().min(1),
      expected_revision: z.number().int().positive(),
      execution_prompt: z.string().min(1).max(20_000),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision, execution_prompt: executionPrompt }) => {
    try {
      await persistence.flush(conversationId);
      const conversation = await getConversation(conversationId);
      if (conversation.conversation_state === "executing") {
        return internalResult({ action: "already_started", revision: conversation.revision }, conversationId);
      }
      if (conversation.decision !== "do_now") {
        return {
          isError: true,
          content: [{ type: "text", text: "Choose Do it now before starting this task." }],
        };
      }
      const queued = persistence.queueUpdate(conversationId, {
        patch: {
          conversation_state: "executing",
          interpretation: { execution_prompt: executionPrompt },
        },
        append_events: [{ type: "execution_started", data: {} }],
      }, expectedRevision);
      await persistence.flush(conversationId);
      return internalResult({ action: "started", revision: queued.revision }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "cancel_execution_start",
  {
    title: "Cancel an uncreated WhyNotNow execution",
    description: "Reopens an execution reservation only when creating the separate Codex task failed before it existed.",
    inputSchema: {
      conversation_id: z.string().min(1),
      expected_revision: z.number().int().positive(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision }) => {
    try {
      await persistence.flush(conversationId);
      const conversation = await getConversation(conversationId);
      if (conversation.conversation_state !== "executing") {
        return {
          isError: true,
          content: [{ type: "text", text: "There is no execution start to cancel." }],
        };
      }
      const queued = persistence.queueUpdate(conversationId, {
        patch: { conversation_state: "active" },
        append_events: [{ type: "execution_start_cancelled", data: {} }],
      }, expectedRevision);
      await persistence.flush(conversationId);
      return internalResult({ revision: queued.revision }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "offer_assistance",
  {
    title: "Record a bounded WhyNotNow assistance choice",
    description: "Records the user's explicit plain-text choice about a concrete, read-only investigation.",
    inputSchema: {
      conversation_id: z.string().min(1).describe("Existing WhyNotNow conversation ID"),
      expected_revision: z.number().int().positive().describe("Current conversation revision"),
      reason_id: z.string().min(1).max(200).describe("Saved blocker this offer addresses"),
      problem_summary: z.string().min(1).max(1000).describe("Concrete blocker to address"),
      proposed_scope: z.string().min(1).max(1000).describe("Smallest read-only investigation to perform"),
      expected_result: z.string().min(1).max(1000).describe("What the user will receive, including any limitation"),
      action: z.enum(["research", "decline"]).describe("The user's explicit response to the plain-text assistance offer"),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({
    conversation_id: conversationId,
    expected_revision: expectedRevision,
    reason_id: reasonId,
    problem_summary: problemSummary,
    proposed_scope: proposedScope,
    expected_result: expectedResult,
    action,
  }) => {
    try {
      await persistence.flush(conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
    const eventData = {
      reason_id: reasonId,
      problem_summary: problemSummary,
      proposed_scope: proposedScope,
      expected_result: expectedResult,
    };
    const updates = {
      research: { patch: {}, event: { type: "assistance_accepted", data: eventData } },
      decline: { patch: {}, event: { type: "assistance_declined", data: eventData } },
    };
    const update = updates[action];
    if (!update) return { isError: true, content: [{ type: "text", text: `Unhandled selection: ${action}` }] };

    try {
      const result = saveSelection(conversationId, expectedRevision, { action, ...update });
      return internalResult(result, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

const transport = new StdioServerTransport();
const configuredDashboardPort = Number.parseInt(process.env.WHYNOTNOW_DASHBOARD_PORT ?? "", 10);
await startDashboardServer({
  persistence,
  port: Number.isInteger(configuredDashboardPort) && configuredDashboardPort >= 0
    ? configuredDashboardPort
    : DASHBOARD_PORT,
});
await server.connect(transport);

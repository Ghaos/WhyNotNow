import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
} from "../.agents/skills/wnn/scripts/store.mjs";
import { PersistenceQueue } from "./persistence.mjs";

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

function silent(structuredContent, conversationId) {
  return { structuredContent, content: failureContent(conversationId) };
}

function summary(record) {
  return {
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
    return silent({ conversation_id: conversationId, revision: queued.revision }, conversationId);
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
      return silent({ revision: queued.revision }, conversationId);
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
      return silent({ conversation: summary(record) }, conversationId);
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
    inputSchema: { include_archived: z.boolean().optional(), query: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ include_archived: includeArchived = false, query = "" }) => {
    try {
      await persistence.flushAll();
      const result = await listConversations({ includeArchived, query });
      return { structuredContent: { conversations: result.conversations }, content: [] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
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
      return silent({ revision: queued.revision }, conversationId);
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
              { const: "do_now", title: "do now" },
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
      return {
        structuredContent: { action: "cancelled", conversation_id: conversationId, revision: expectedRevision },
        content: [{ type: "text", text: "cancelled" }],
      };
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
      const structuredContent = saveSelection(conversationId, expectedRevision, { action, note, ...update });
      return silent(structuredContent, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "offer_assistance",
  {
    title: "Offer bounded WhyNotNow assistance",
    description: "Ask for consent to investigate one concrete blocker with a stated read-only scope.",
    inputSchema: {
      conversation_id: z.string().min(1).describe("Existing WhyNotNow conversation ID"),
      expected_revision: z.number().int().positive().describe("Current conversation revision"),
      reason_id: z.string().min(1).max(200).describe("Saved blocker this offer addresses"),
      problem_summary: z.string().min(1).max(1000).describe("Concrete blocker to address"),
      proposed_scope: z.string().min(1).max(1000).describe("Smallest read-only investigation to perform"),
      expected_result: z.string().min(1).max(1000).describe("What the user will receive, including any limitation"),
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
  }) => {
    try {
      await persistence.flush(conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
    const result = await server.server.elicitInput({
      mode: "form",
      message: `${problemSummary}\n\nI can investigate this by: ${proposedScope}\n\nYou will get: ${expectedResult}\n\nWould you like me to do that now?`,
      requestedSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            title: "Assistance",
            oneOf: [{ const: "research", title: "investigate now" }, { const: "decline", title: "not now" }],
          },
        },
        required: ["action"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return {
        structuredContent: { action: "cancelled", conversation_id: conversationId, revision: expectedRevision },
        content: [{ type: "text", text: "cancelled" }],
      };
    }

    const { action } = result.content;
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
      const structuredContent = saveSelection(conversationId, expectedRevision, { action, ...update });
      return silent(structuredContent, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "choose_cancel_followup",
  {
    title: "Choose a WhyNotNow cancellation follow-up",
    description: "Offer additional read-only research or end after the initial action form is cancelled.",
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
      message: "Would you like me to do additional research before ending this conversation?",
      requestedSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            title: "Next Step",
            oneOf: [{ const: "research", title: "do additional research" }, { const: "end", title: "end" }],
          },
        },
        required: ["action"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return {
        structuredContent: { action: "cancelled", conversation_id: conversationId, revision: expectedRevision },
        content: [{ type: "text", text: "cancelled" }],
      };
    }

    const updates = {
      research: { patch: {}, event: { type: "research_requested", data: { context: "cancelled_action" } } },
      end: { patch: { conversation_state: "ended" }, event: { type: "ended", data: {} } },
    };
    const update = updates[result.content.action];
    if (!update) return { isError: true, content: [{ type: "text", text: `Unhandled selection: ${result.content.action}` }] };

    try {
      const structuredContent = saveSelection(conversationId, expectedRevision, { action: result.content.action, ...update });
      return silent(structuredContent, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

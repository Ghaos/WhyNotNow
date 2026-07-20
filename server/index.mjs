import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
} from "../.agents/skills/wnn/scripts/store.mjs";
import { DASHBOARD_PORT, startDashboardServer } from "./dashboard.mjs";
import { PersistenceQueue } from "./persistence.mjs";

const server = new McpServer({ name: "why-not-now", version: "0.2.0" });
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
  return [{ type: "text", text: JSON.stringify(value), annotations: { audience: ["assistant"] } }];
}

function internalResult(value, conversationId) {
  const failures = failureContent(conversationId);
  return { content: failures.length ? failures : assistantOnly(value) };
}

function context(record) {
  return {
    conversation_id: record.conversation_id,
    revision: record.revision,
    updated_at: record.updated_at,
    title: record.title,
    task_text: record.task_text,
    status: record.status,
    enrichment: record.enrichment,
    interpretation: record.interpretation,
    reasons_for: record.reasons_for,
    why_not_now: record.why_not_now,
    related_urls: record.related_urls,
    notes: record.notes,
    project_refs: record.project_refs,
    dialogue: record.dialogue,
    assistance_choices: record.assistance_choices,
  };
}

server.registerTool(
  "create_conversation",
  {
    title: "Create a WhyNotNow conversation",
    description: "Queues creation of a considering conversation without showing storage details.",
    inputSchema: { record: recordSchema },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ record }) => {
    const conversationId = `wnn_${randomUUID()}`;
    const queued = persistence.queueCreate(conversationId, { ...record, status: "considering" });
    return internalResult({ conversation_id: conversationId, revision: queued.revision }, conversationId);
  },
);

server.registerTool(
  "update_conversation",
  {
    title: "Update a WhyNotNow conversation",
    description: "Queues a structured context update without changing its dashboard status.",
    inputSchema: {
      conversation_id: z.string().min(1),
      expected_revision: z.number().int().positive(),
      patch: recordSchema.optional(),
      append_notes: z.array(recordSchema).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision, patch = {}, append_notes = [] }) => {
    try {
      const safePatch = { ...patch };
      delete safePatch.status;
      const queued = persistence.queueUpdate(conversationId, { patch: safePatch, append_notes }, expectedRevision);
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
    description: "Flushes queued changes and returns the structured context needed to continue.",
    inputSchema: { conversation_id: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId }) => {
    try {
      await persistence.flush(conversationId);
      return internalResult({ conversation: context(await getConversation(conversationId)) }, conversationId);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "list_conversation_summaries",
  {
    title: "List WhyNotNow conversations",
    description: "Flushes queued changes and returns compact task summaries.",
    inputSchema: {
      view: z.enum(["before", "considering", "executed", "all"]).optional(),
      query: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  async ({ view = "considering", query = "" }) => {
    try {
      await persistence.flushAll();
      const result = await listConversations({ view, query });
      return internalResult({ conversations: result.conversations }, null);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "offer_assistance",
  {
    title: "Record a bounded WhyNotNow assistance choice",
    description: "Records the user's explicit choice about a concrete, read-only investigation.",
    inputSchema: {
      conversation_id: z.string().min(1),
      expected_revision: z.number().int().positive(),
      reason_id: z.string().min(1).max(200),
      problem_summary: z.string().min(1).max(1000),
      proposed_scope: z.string().min(1).max(1000),
      expected_result: z.string().min(1).max(1000),
      action: z.enum(["research", "decline"]),
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
      const queued = persistence.queueUpdate(conversationId, {
        patch: {},
        append_assistance: [{
          reason_id: reasonId,
          problem_summary: problemSummary,
          proposed_scope: proposedScope,
          expected_result: expectedResult,
          action,
        }],
      }, expectedRevision);
      return internalResult({ action, revision: queued.revision }, conversationId);
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

const transport = new StdioServerTransport();
const configuredDashboardPort = Number.parseInt(process.env.WHYNOTNOW_DASHBOARD_PORT ?? "", 10);
await startDashboardServer({
  persistence,
  port: Number.isInteger(configuredDashboardPort) && configuredDashboardPort >= 0
    ? configuredDashboardPort
    : DASHBOARD_PORT,
});
await server.connect(transport);

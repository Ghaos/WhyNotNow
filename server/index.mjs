import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { updateConversation } from "../.agents/skills/wnn/scripts/store.mjs";

const server = new McpServer({
  name: "why-not-now",
  version: "0.1.0",
});

function mutationError(error) {
  return error?.code === "REVISION_CONFLICT"
    ? "The conversation record was updated by someone else. Please fetch the latest revision and try again."
    : `Failed to save selection: ${error instanceof Error ? error.message : String(error)}`;
}

function savedSelection(saved, action, note = null) {
  return {
    action,
    note,
    conversation_id: saved.conversation_id,
    revision: saved.revision,
    conversation_state: saved.conversation_state,
    decision: saved.decision,
    enrichment: saved.enrichment,
  };
}

async function saveSelection(conversationId, expectedRevision, { action, patch = {}, event, note = null }) {
  const saved = await updateConversation(conversationId, {
    patch,
    append_notes: note ? [{ text: note, origin: "user" }] : [],
    append_events: [event],
  }, { expectedRevision });
  return savedSelection(saved, action, note);
}

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
      const structuredContent = await saveSelection(conversationId, expectedRevision, { action, note, ...update });
      return { structuredContent, content: [{ type: "text", text: `Selection saved: ${action}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

server.registerTool(
  "choose_research",
  {
    title: "Choose a WhyNotNow research follow-up",
    description: "Confirm research after a reason is recorded, or after the action form is cancelled. Saves the follow-up choice.",
    inputSchema: {
      conversation_id: z.string().min(1).describe("Existing WhyNotNow conversation ID"),
      expected_revision: z.number().int().positive().describe("Current conversation revision"),
      context: z.enum(["reason", "cancelled_action"]).describe("Why this follow-up is being shown"),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision, context }) => {
    const cancelledAction = context === "cancelled_action";
    const result = await server.server.elicitInput({
      mode: "form",
      message: cancelledAction
        ? "Would you like me to do additional research before ending this conversation?"
        : "Would you like me to research a path toward resolving this reason?",
      requestedSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            title: "Research Follow-up",
            oneOf: cancelledAction
              ? [{ const: "research", title: "do additional research" }, { const: "end", title: "end" }]
              : [{ const: "research", title: "research a solution" }, { const: "defer", title: "keep deferred" }],
          },
        },
        required: ["action"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return {
        structuredContent: { action: "cancelled", context, conversation_id: conversationId, revision: expectedRevision },
        content: [{ type: "text", text: "cancelled" }],
      };
    }

    const { action } = result.content;
    const updates = cancelledAction
      ? {
        research: { patch: {}, event: { type: "research_requested", data: { context } } },
        end: { patch: { conversation_state: "ended" }, event: { type: "ended", data: {} } },
      }
      : {
        research: { patch: {}, event: { type: "research_requested", data: { context } } },
        defer: { patch: {}, event: { type: "research_deferred", data: { context } } },
      };
    const update = updates[action];
    if (!update) return { isError: true, content: [{ type: "text", text: `Unhandled selection: ${action}` }] };

    try {
      const structuredContent = await saveSelection(conversationId, expectedRevision, { action, ...update });
      return { structuredContent, content: [{ type: "text", text: `Selection saved: ${action}` }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: mutationError(error) }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

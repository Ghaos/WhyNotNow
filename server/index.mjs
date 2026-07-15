import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { updateConversation } from "../.agents/skills/why-not-now/scripts/store.mjs";

const server = new McpServer({
  name: "why-not-now",
  version: "0.1.0",
});

server.registerTool(
  "ping",
  {
    title: "Ping WhyNotNow MCP server",
    description: "Check that the WhyNotNow MCP server is reachable.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async () => ({
    content: [{ type: "text", text: "pong" }],
  }),
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
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async ({ conversation_id: conversationId, expected_revision: expectedRevision }) => {
    const result = await server.server.elicitInput({
      mode: "form",
      message: "WhyNotNowの次の操作を選んでください。",
      requestedSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            title: "次の操作",
            oneOf: [
              { const: "do_now", title: "今やる" },
              { const: "why_not_now", title: "今やらない理由を考える" },
              { const: "end", title: "終了" },
              { const: "delegate", title: "AIに解釈・調査を任せて終了" },
            ],
          },
          note: {
            type: "string",
            title: "メモ（任意）",
            description: "今回の選択について補足があれば入力してください。",
            maxLength: 1000,
          },
        },
        required: ["action"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return {
        content: [{ type: "text", text: "選択はキャンセルされました。" }],
      };
    }

    const { action } = result.content;
    const note = typeof result.content.note === "string" ? result.content.note.trim() : "";
    const updates = {
      do_now: {
        patch: { decision: "do_now" },
        event: { type: "decision_updated", data: { decision: "do_now" } },
      },
      why_not_now: {
        patch: { decision: "not_now" },
        event: { type: "decision_updated", data: { decision: "not_now" } },
      },
      end: {
        patch: { conversation_state: "ended" },
        event: { type: "ended", data: {} },
      },
      delegate: {
        patch: { conversation_state: "delegated", enrichment: "delegated" },
        event: { type: "delegated", data: {} },
      },
    };
    const update = updates[action];
    if (!update) {
      return {
        isError: true,
        content: [{ type: "text", text: `未対応の選択です: ${action}` }],
      };
    }

    try {
      const saved = await updateConversation(conversationId, {
        patch: update.patch,
        append_notes: note ? [{ text: note, origin: "user" }] : [],
        append_events: [update.event],
      }, { expectedRevision });

      const structuredContent = {
        action,
        note: note || null,
        conversation_id: saved.conversation_id,
        revision: saved.revision,
        conversation_state: saved.conversation_state,
        decision: saved.decision,
        enrichment: saved.enrichment,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: `選択を保存しました: ${action}` }],
      };
    } catch (error) {
      const message = error?.code === "REVISION_CONFLICT"
        ? "会話レコードが先に更新されました。最新のrevisionを取得してやり直してください。"
        : `選択を保存できませんでした: ${error instanceof Error ? error.message : String(error)}`;
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

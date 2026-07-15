import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
  "choose_direction",
  {
    title: "Choose a WhyNotNow direction",
    description: "Ask the user whether to do a task now or explore why not now.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  async () => {
    const result = await server.server.elicitInput({
      mode: "form",
      message: "次の進め方を選んでください。",
      requestedSchema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            title: "進め方",
            description: "タスクを今やるか、今やらない理由を考えるか選びます。",
            oneOf: [
              { const: "do_now", title: "今やる" },
              { const: "why_not_now", title: "今やらない理由を考える" },
            ],
          },
        },
        required: ["direction"],
      },
    });

    if (result.action !== "accept" || !result.content) {
      return {
        content: [{ type: "text", text: "選択はキャンセルされました。" }],
      };
    }

    return {
      structuredContent: result.content,
      content: [{ type: "text", text: `選択: ${result.content.direction}` }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";

import { callAutomationApi, fetchStatus } from "./mcp/http-client.js";

const server = new Server(
  {
    name: "go-to-work",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const tools = [
  {
    name: "gtw_status",
    description: "Read GO TO WORK status, active approvals, and safety state.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_navigate",
    description: "Navigate the visible Playwright browser to an allowlisted URL.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string" }
      }
    }
  },
  {
    name: "browser_click",
    description: "Click a selector on the current allowlisted browser page.",
    inputSchema: {
      type: "object",
      required: ["selector"],
      properties: {
        selector: { type: "string" }
      }
    }
  },
  {
    name: "browser_fill",
    description: "Fill a selector on the current allowlisted browser page.",
    inputSchema: {
      type: "object",
      required: ["selector", "value"],
      properties: {
        selector: { type: "string" },
        value: { type: "string" }
      }
    }
  },
  {
    name: "browser_wait",
    description: "Wait for a selector or a page load in the current browser tab.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "browser_screenshot",
    description: "Capture a screenshot from the current browser tab.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" }
      }
    }
  },
  {
    name: "desktop_list_windows",
    description: "List allowlisted desktop windows that GO TO WORK can focus.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "desktop_focus_window",
    description: "Focus an allowlisted desktop window by handle.",
    inputSchema: {
      type: "object",
      required: ["handle"],
      properties: {
        handle: { type: "string" }
      }
    }
  },
  {
    name: "desktop_mouse_move",
    description: "Move the mouse pointer to a desktop coordinate inside the current allowlisted window workflow.",
    inputSchema: {
      type: "object",
      required: ["x", "y"],
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      }
    }
  },
  {
    name: "desktop_mouse_click",
    description: "Click the mouse on the currently focused allowlisted window.",
    inputSchema: {
      type: "object",
      properties: {
        button: { type: "string", enum: ["left", "right"] }
      }
    }
  },
  {
    name: "desktop_mouse_scroll",
    description: "Scroll the mouse wheel on the currently focused allowlisted window.",
    inputSchema: {
      type: "object",
      required: ["delta"],
      properties: {
        delta: { type: "number" }
      }
    }
  },
  {
    name: "desktop_keyboard_text",
    description: "Type text into the currently focused allowlisted window.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" }
      }
    }
  },
  {
    name: "desktop_keyboard_key",
    description: "Press one key in the currently focused allowlisted window.",
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: {
        key: { type: "string" }
      }
    }
  },
  {
    name: "desktop_keyboard_hotkey",
    description: "Press a hotkey chord in the currently focused allowlisted window.",
    inputSchema: {
      type: "object",
      required: ["keys"],
      properties: {
        keys: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "desktop_screenshot",
    description: "Capture a desktop screenshot for review or logging.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" }
      }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools
}));

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const toolName = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  const result = await callTool(toolName, args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

async function callTool(toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "gtw_status":
      return fetchStatus();
    case "browser_navigate":
      return callAutomationApi("/api/actions/browser/navigate", { url: args.url });
    case "browser_click":
      return callAutomationApi("/api/actions/browser/click", { selector: args.selector });
    case "browser_fill":
      return callAutomationApi("/api/actions/browser/fill", {
        selector: args.selector,
        value: args.value
      });
    case "browser_wait":
      return callAutomationApi("/api/actions/browser/wait", {
        selector: args.selector,
        timeoutMs: args.timeoutMs ?? 10_000
      });
    case "browser_screenshot":
      return callAutomationApi("/api/actions/browser/screenshot", { label: args.label });
    case "desktop_list_windows":
      return callAutomationApi("/api/actions/desktop/list-windows");
    case "desktop_focus_window":
      return callAutomationApi("/api/actions/desktop/focus-window", { handle: args.handle });
    case "desktop_mouse_move":
      return callAutomationApi("/api/actions/desktop/mouse-move", {
        x: args.x,
        y: args.y
      });
    case "desktop_mouse_click":
      return callAutomationApi("/api/actions/desktop/mouse-click", {
        button: args.button ?? "left"
      });
    case "desktop_mouse_scroll":
      return callAutomationApi("/api/actions/desktop/mouse-scroll", { delta: args.delta });
    case "desktop_keyboard_text":
      return callAutomationApi("/api/actions/desktop/keyboard-text", { text: args.text });
    case "desktop_keyboard_key":
      return callAutomationApi("/api/actions/desktop/keyboard-key", { key: args.key });
    case "desktop_keyboard_hotkey":
      return callAutomationApi("/api/actions/desktop/keyboard-hotkey", { keys: args.keys });
    case "desktop_screenshot":
      return callAutomationApi("/api/actions/desktop/screenshot", { label: args.label });
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);

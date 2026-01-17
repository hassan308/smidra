import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = new McpServer({
  name: "job-seeker-server",
  version: "1.0.0"
});

// Read the widget HTML
const widgetHtml = readFileSync(join(__dirname, "job-widget.html"), "utf8");

// Register the widget as an MCP resource
server.registerResource(
  "job-search-widget",
  "ui://widget/job-search.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/job-search.html",
        mimeType: "text/html+skybridge",
        text: widgetHtml,
        _meta: {
          "openai/widgetPrefersBorder": true,
          "openai/widgetDomain": "https://chatgpt.com",
          "openai/widgetCSP": {
            connect_domains: ["https://chatgpt.com"],
            resource_domains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
          },
        },
      },
    ],
  })
);

// Define a tool to "apply" for a job (mock implementation)
server.tool(
    "apply_for_job",
    "Applies for a specific job listing",
    {
      job_title: { type: "string", description: "The title of the job to apply for" }
    },
    async ({ job_title }) => {
      console.log(`[MCP Server] Application received for: ${job_title}`);
      return {
        content: [{ type: "text", text: `Din ansökan för "${job_title}" har skickats framgångsrikt!` }]
      };
    }
);

// Helper to start the server (stdio)
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Job Seeker MCP Server running on stdio");
}

// Note: StdioServerTransport is usually imported from @modelcontextprotocol/sdk/server/stdio.js
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

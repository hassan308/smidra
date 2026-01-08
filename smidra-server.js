import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8002;

// Arbetsformedlingen JobSearch API
const AF_API_BASE = "https://jobsearch.api.jobtechdev.se";

// Swedish regions (lan) mapping
const regions = {
  "stockholm": "01",
  "uppsala": "03",
  "sodermanland": "04",
  "ostergotland": "05",
  "jonkoping": "06",
  "kronoberg": "07",
  "kalmar": "08",
  "gotland": "09",
  "blekinge": "10",
  "skane": "12",
  "halland": "13",
  "vastra gotaland": "14",
  "varmland": "17",
  "orebro": "18",
  "vastmanland": "19",
  "dalarna": "20",
  "gavleborg": "21",
  "vasternorrland": "22",
  "jamtland": "23",
  "vasterbotten": "24",
  "norrbotten": "25"
};

// Normalize Swedish characters
function normalizeSwedish(str) {
  return str
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .trim();
}

// Find region code from location string
function findRegion(location) {
  if (!location) return null;
  const loc = normalizeSwedish(location);

  // Direct match
  if (regions[loc]) return regions[loc];

  // Partial match
  for (const [name, code] of Object.entries(regions)) {
    if (loc.includes(name) || name.includes(loc)) {
      return code;
    }
  }

  // Check if it's a city name that maps to a region
  const cityToRegion = {
    "goteborg": "14",
    "gothenburg": "14",
    "malmo": "12",
    "lund": "12",
    "helsingborg": "12",
    "norrkoping": "05",
    "linkoping": "05",
    "orebro": "18",
    "vasteras": "19",
    "umea": "24",
    "lulea": "25",
    "gavle": "21",
    "sundsvall": "22",
    "ostersund": "23",
    "karlstad": "17",
    "vaxjo": "07",
    "kalmar": "08",
    "halmstad": "13",
    "boras": "14",
    "eskilstuna": "04"
  };

  if (cityToRegion[loc]) return cityToRegion[loc];

  return null;
}

// Fetch jobs from Arbetsformedlingen
async function searchJobs(query, location, limit = 10) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", limit.toString());

  const regionCode = findRegion(location);
  if (regionCode) {
    params.set("region", regionCode);
  }

  const url = `${AF_API_BASE}/search?${params.toString()}`;
  console.log(`🔍 Searching: ${url}`);

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("❌ API error:", error);
    return { total: { value: 0 }, hits: [] };
  }
}

// Fetch single job details
async function getJobById(jobId) {
  const url = `${AF_API_BASE}/ad/${jobId}`;
  console.log(`📋 Fetching job: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Job not found: ${jobId}`);
    }
    return await response.json();
  } catch (error) {
    console.error("❌ API error:", error);
    return null;
  }
}

// Format job for display
function formatJob(job) {
  return {
    id: job.id,
    title: job.headline,
    employer: job.employer?.name || "Okänd arbetsgivare",
    location: job.workplace_address?.municipality || job.workplace_address?.region || "Sverige",
    region: job.workplace_address?.region || "",
    deadline: job.application_deadline ? new Date(job.application_deadline).toLocaleDateString("sv-SE") : "Löpande",
    description: job.description?.text?.substring(0, 300) + "..." || "",
    fullDescription: job.description?.text || "",
    url: job.webpage_url,
    logoUrl: job.logo_url,
    employmentType: job.employment_type?.label || "",
    salaryType: job.salary_type?.label || "",
    workingHours: job.working_hours_type?.label || "",
    occupationField: job.occupation_field?.label || "",
    published: job.publication_date ? new Date(job.publication_date).toLocaleDateString("sv-SE") : ""
  };
}

// Load widget HTML files
const jobListHTML = readFileSync(join(__dirname, "job-list-widget.html"), "utf-8");
const jobDetailHTML = readFileSync(join(__dirname, "job-detail-widget.html"), "utf-8");

// Create MCP server
const server = new McpServer({
  name: "smidra",
  version: "3.0.0"
});

// Register job list widget resource
server.registerResource(
  "job-list-widget",
  "ui://widget/job-list.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/job-list.html",
      mimeType: "text/html+skybridge",
      text: jobListHTML,
      _meta: {
        "openai/widgetPrefersBorder": true
      }
    }]
  })
);

// Register job detail widget resource
server.registerResource(
  "job-detail-widget",
  "ui://widget/job-detail.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/job-detail.html",
      mimeType: "text/html+skybridge",
      text: jobDetailHTML,
      _meta: {
        "openai/widgetPrefersBorder": true
      }
    }]
  })
);

// ============================================================
// SINGLE TOOL: search_jobs - Search + Translate + Display
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs in Sweden",
    description: `Search for jobs on Arbetsförmedlingen (Swedish Employment Agency) and display results.

IMPORTANT: Before calling this tool, you MUST:
1. Detect the user's language from their message
2. Translate the search query to Swedish (the API only understands Swedish)
3. Prepare ALL translated labels in the user's language

The tool will search for jobs and display them with YOUR translated labels.

Examples of Swedish job keywords:
- Developer = utvecklare
- Nurse = sjuksköterska
- Chef/Cook = kock
- Teacher = lärare
- Cleaner = städare, lokalvårdare
- Driver = chaufför
- Accountant = revisor, ekonom
- Engineer = ingenjör
- Salesperson = säljare`,
    inputSchema: {
      // Search parameters
      query: z.string().describe("Job search query IN SWEDISH (e.g., 'utvecklare', 'sjuksköterska')"),
      location: z.string().optional().describe("City or region in Sweden (e.g., 'Stockholm', 'Gävle')"),
      limit: z.number().optional().default(5).describe("Number of results (1-20, default: 5)"),

      // Language settings
      language: z.string().describe("User's language code (e.g., 'so' for Somali, 'ar' for Arabic, 'sv' for Swedish)"),
      direction: z.enum(["ltr", "rtl"]).default("ltr").describe("Text direction: 'rtl' for Arabic/Hebrew/Persian/Urdu, 'ltr' for all others"),

      // Translated display text
      displayQuery: z.string().describe("The search term in the user's language (for display)"),
      displayLocation: z.string().describe("The location in the user's language (for display)"),

      // UI Labels - ALL must be translated to user's language
      labels: z.object({
        results: z.string().describe("'Search Results' translated"),
        found: z.string().describe("'jobs found' translated"),
        details: z.string().describe("'Show details' translated"),
        hide: z.string().describe("'Hide' translated"),
        apply: z.string().describe("'Apply' translated"),
        noJobs: z.string().describe("'No jobs found' translated"),
        tryAgain: z.string().describe("'Try different keywords' translated"),
        location: z.string().describe("'Location' translated"),
        deadline: z.string().describe("'Apply by' / 'Deadline' translated"),
        type: z.string().describe("'Employment type' translated"),
        salary: z.string().describe("'Salary' translated"),
        daysLeft: z.string().describe("'days left' translated"),
        today: z.string().describe("'Today!' translated")
      }).describe("All UI labels translated to user's language")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html",
      "openai/toolInvocation/invoking": "Söker jobb...",
      "openai/toolInvocation/invoked": "Klart!"
    }
  },
  async ({ query, location, limit, language, direction, displayQuery, displayLocation, labels }) => {
    console.log(`🔧 search_jobs called:`);
    console.log(`   Query: "${query}" (Swedish) → "${displayQuery}" (${language})`);
    console.log(`   Location: "${location || 'hela Sverige'}" → "${displayLocation}"`);
    console.log(`   Direction: ${direction}`);

    // Search for jobs
    const data = await searchJobs(query, location, limit || 5);
    const jobs = data.hits.map(formatJob);
    const total = data.total?.value || 0;

    console.log(`✅ Found ${jobs.length} jobs (total: ${total})`);

    // Return widget data
    const result = {
      language,
      direction,
      query: displayQuery,
      location: displayLocation,
      total,
      labels,
      jobs
    };

    return {
      structuredContent: result,
      content: [{
        type: "text",
        text: `Found ${total} jobs for "${displayQuery}" in ${displayLocation}`
      }]
    };
  }
);

// ============================================================
// SINGLE TOOL: get_job_details - Get + Display job detail
// ============================================================
server.registerTool(
  "get_job_details",
  {
    title: "Show Job Details",
    description: `Get and display detailed information about a specific job.

Use when the user wants to see more details about a job from the search results.

Before calling, prepare translated labels in the user's language.`,
    inputSchema: {
      jobId: z.string().describe("The job ID from search results"),
      language: z.string().describe("User's language code"),
      direction: z.enum(["ltr", "rtl"]).default("ltr").describe("Text direction"),
      labels: z.object({
        location: z.string().describe("'Location' translated"),
        deadline: z.string().describe("'Deadline' translated"),
        type: z.string().describe("'Type' translated"),
        salary: z.string().describe("'Salary' translated"),
        description: z.string().describe("'Description' translated"),
        apply: z.string().describe("'Apply Now' translated"),
        backToResults: z.string().describe("'Back to results' translated")
      }).describe("UI labels in user's language")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-detail.html",
      "openai/toolInvocation/invoking": "Laddar jobbdetaljer...",
      "openai/toolInvocation/invoked": "Klart!"
    }
  },
  async ({ jobId, language, direction, labels }) => {
    console.log(`🔧 get_job_details called: jobId="${jobId}", language="${language}"`);

    const job = await getJobById(jobId);

    if (!job) {
      return {
        content: [{ type: "text", text: `Job not found: ${jobId}` }]
      };
    }

    const formatted = formatJob(job);
    console.log(`✅ Returning job: ${formatted.title}`);

    const result = {
      language,
      direction,
      labels,
      job: formatted
    };

    return {
      structuredContent: result,
      content: [{
        type: "text",
        text: `Showing details for: ${formatted.title} at ${formatted.employer}`
      }]
    };
  }
);

console.log("✅ Tools registered: search_jobs, get_job_details");

// Track active transports by sessionId
const transports = new Map();

// HTTP Server
const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Widget preview - job list
  if (url.pathname === "/" || url.pathname === "/widget" || url.pathname === "/widget/list") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(jobListHTML);
    return;
  }

  // Widget preview - job detail
  if (url.pathname === "/widget/detail") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(jobDetailHTML);
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"ok","service":"smidra","version":"3.0.0"}');
    return;
  }

  // API proxy for testing
  if (url.pathname === "/api/search") {
    const query = url.searchParams.get("q") || "utvecklare";
    const location = url.searchParams.get("location");
    const limit = parseInt(url.searchParams.get("limit") || "5");

    const data = await searchJobs(query, location, limit);
    const jobs = data.hits.map(formatJob);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total: data.total?.value || 0, jobs }));
    return;
  }

  // MCP endpoint
  if (url.pathname === "/mcp") {
    // GET = SSE connection
    if (req.method === "GET") {
      console.log("📡 SSE GET - new connection");
      const transport = new SSEServerTransport("/mcp", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      console.log(`📡 Session created: ${sessionId}`);

      res.on("close", () => {
        console.log(`📡 SSE connection closed: ${sessionId}`);
        transports.delete(sessionId);
      });

      await server.connect(transport);
      return;
    }

    // POST = message
    if (req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      console.log(`📡 POST received for session: ${sessionId}`);

      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      const transport = transports.get(sessionId);
      console.log("📡 Routing to transport");

      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
      }

      await transport.handlePostMessage(req, res, body);
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`
💼 Smidra v3.0 - Multilingual Job Search (Single-Tool)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP:     http://localhost:${PORT}/mcp
Widget:  http://localhost:${PORT}/widget
API:     http://localhost:${PORT}/api/search?q=utvecklare
Health:  http://localhost:${PORT}/health

Single tool flow: ChatGPT translates → search_jobs → Widget
`);
});

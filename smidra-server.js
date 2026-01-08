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
    employer: job.employer?.name || "Okand arbetsgivare",
    location: job.workplace_address?.municipality || job.workplace_address?.region || "Sverige",
    region: job.workplace_address?.region || "",
    deadline: job.application_deadline ? new Date(job.application_deadline).toLocaleDateString("sv-SE") : "Lopande",
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
  version: "1.0.0"
});

// Register job list widget resource (v2 to bust cache)
server.registerResource(
  "job-list-widget",
  "ui://widget/job-list-v2.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/job-list-v2.html",
      mimeType: "text/html+skybridge",
      text: jobListHTML
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
      text: jobDetailHTML
    }]
  })
);

// Register search_jobs tool
server.registerTool(
  "search_jobs",
  {
    title: "Sok jobb",
    description: "Sok lediga jobb pa Arbetsformedlingen. Anvandaren kan soka pa yrke, kompetens, eller fritext. Valfritt: ange plats (stad eller lan).",
    inputSchema: {
      query: z.string().describe("Sokord - yrke, kompetens, eller fritext (t.ex. 'utvecklare', 'sjukskoterska', 'kock')"),
      location: z.string().optional().describe("Plats - stad eller lan (t.ex. 'Stockholm', 'Goteborg', 'Skane')"),
      limit: z.number().optional().default(5).describe("Antal resultat att visa (standard: 5)")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list-v2.html"
    }
  },
  async ({ query, location, limit }) => {
    console.log(`🔧 search_jobs called: query="${query}", location="${location || 'hela Sverige'}", limit=${limit}`);

    const data = await searchJobs(query, location, limit || 5);
    const jobs = data.hits.map(formatJob);
    const total = data.total?.value || 0;

    const result = {
      query,
      location: location || "Hela Sverige",
      total,
      jobs
    };

    console.log(`📤 Found ${jobs.length} jobs (total: ${total})`);

    // Fallback text for non-widget display
    const jobSummary = jobs.map(j => `- ${j.title} hos ${j.employer} (${j.location})`).join("\n");

    return {
      structuredContent: result,
      content: [{
        type: "text",
        text: `Hittade ${total} jobb for "${query}"${location ? ` i ${location}` : ""}:\n\n${jobSummary}`
      }]
    };
  }
);

// Register get_job_details tool
server.registerTool(
  "get_job_details",
  {
    title: "Visa jobbdetaljer",
    description: "Visa fullstandig information om ett specifikt jobb. Anvand jobb-ID fran sokresultaten.",
    inputSchema: {
      jobId: z.string().describe("Jobb-ID fran sokresultaten")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-detail.html"
    }
  },
  async ({ jobId }) => {
    console.log(`🔧 get_job_details called: jobId="${jobId}"`);

    const job = await getJobById(jobId);

    if (!job) {
      return {
        content: [{ type: "text", text: `Kunde inte hitta jobb med ID: ${jobId}` }]
      };
    }

    const formatted = formatJob(job);
    console.log(`📤 Returning job: ${formatted.title}`);

    return {
      structuredContent: formatted,
      content: [{
        type: "text",
        text: `${formatted.title} hos ${formatted.employer}\n\nPlats: ${formatted.location}\nSok senast: ${formatted.deadline}\n\n${formatted.description}`
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
    res.end('{"status":"ok","service":"smidra"}');
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

  // SSE endpoint - GET starts stream, POST sends messages
  if (url.pathname === "/mcp" || url.pathname === "/sse") {

    if (req.method === "GET" && !url.searchParams.has("sessionId")) {
      console.log("📡 SSE GET - new connection");

      const transport = new SSEServerTransport("/mcp", res);

      // Store transport with its internal sessionId
      const sessionId = transport._sessionId;
      transports.set(sessionId, transport);
      console.log(`📡 Session created: ${sessionId}`);

      res.on("close", () => {
        console.log(`📡 SSE connection closed: ${sessionId}`);
        transports.delete(sessionId);
      });

      await server.connect(transport);
      return;
    }

    if (req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      console.log(`📡 POST received for session: ${sessionId}`);

      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", async () => {
        try {
          const transport = sessionId ? transports.get(sessionId) : null;

          if (transport && transport.handlePostMessage) {
            console.log(`📡 Routing to transport`);
            await transport.handlePostMessage(req, res, body);
          } else {
            console.log(`❌ No transport found for session: ${sessionId}`);
            res.writeHead(400);
            res.end('{"error":"No active session"}');
          }
        } catch (err) {
          console.error("❌ POST error:", err);
          res.writeHead(500);
          res.end(`{"error":"${err.message}"}`);
        }
      });
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`
💼 Smidra - Jobbsokning i ChatGPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP:     http://localhost:${PORT}/mcp
Widget:  http://localhost:${PORT}/widget
API:     http://localhost:${PORT}/api/search?q=utvecklare
Health:  http://localhost:${PORT}/health
`);
});

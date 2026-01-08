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

// Swedish regions mapping
const regions = {
  "stockholm": "01", "uppsala": "03", "sodermanland": "04", "ostergotland": "05",
  "jonkoping": "06", "kronoberg": "07", "kalmar": "08", "gotland": "09",
  "blekinge": "10", "skane": "12", "halland": "13", "vastra gotaland": "14",
  "varmland": "17", "orebro": "18", "vastmanland": "19", "dalarna": "20",
  "gavleborg": "21", "vasternorrland": "22", "jamtland": "23", "vasterbotten": "24",
  "norrbotten": "25"
};

// City to region mapping
const cityToRegion = {
  "goteborg": "14", "gothenburg": "14", "malmo": "12", "lund": "12",
  "helsingborg": "12", "norrkoping": "05", "linkoping": "05", "orebro": "18",
  "vasteras": "19", "umea": "24", "lulea": "25", "gavle": "21",
  "sundsvall": "22", "ostersund": "23", "karlstad": "17", "vaxjo": "07",
  "kalmar": "08", "halmstad": "13", "boras": "14", "eskilstuna": "04"
};

function normalizeSwedish(str) {
  return str.toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').trim();
}

function findRegion(location) {
  if (!location) return null;
  const loc = normalizeSwedish(location);
  if (regions[loc]) return regions[loc];
  for (const [name, code] of Object.entries(regions)) {
    if (loc.includes(name) || name.includes(loc)) return code;
  }
  if (cityToRegion[loc]) return cityToRegion[loc];
  return null;
}

async function searchJobs(query, location, limit = 10) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", limit.toString());
  const regionCode = findRegion(location);
  if (regionCode) params.set("region", regionCode);

  const url = `${AF_API_BASE}/search?${params.toString()}`;
  console.log(`🔍 Searching: ${url}`);

  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error("❌ API error:", error);
    return { total: { value: 0 }, hits: [] };
  }
}

async function getJobById(jobId) {
  const url = `${AF_API_BASE}/ad/${jobId}`;
  console.log(`📋 Fetching job: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Job not found: ${jobId}`);
    return await response.json();
  } catch (error) {
    console.error("❌ API error:", error);
    return null;
  }
}

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
    workingHours: job.working_hours_type?.label || ""
  };
}

// Load widget HTML
const jobListHTML = readFileSync(join(__dirname, "job-list-widget.html"), "utf-8");
const jobDetailHTML = readFileSync(join(__dirname, "job-detail-widget.html"), "utf-8");

// Create MCP server
const server = new McpServer({
  name: "smidra",
  version: "4.0.0"
});

// Register widget resources
server.registerResource("job-list-widget", "ui://widget/job-list.html", {}, async () => ({
  contents: [{ uri: "ui://widget/job-list.html", mimeType: "text/html+skybridge", text: jobListHTML }]
}));

server.registerResource("job-detail-widget", "ui://widget/job-detail.html", {}, async () => ({
  contents: [{ uri: "ui://widget/job-detail.html", mimeType: "text/html+skybridge", text: jobDetailHTML }]
}));

// ============================================================
// STEP 1: search_jobs - Search and show LOADING widget
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs",
    description: `Search for jobs on Arbetsförmedlingen and show loading state.

IMPORTANT WORKFLOW:
1. Detect user's language
2. Call this tool with translated loading text
3. You will receive Swedish job data
4. Translate ALL job content to user's language
5. IMMEDIATELY call display_jobs with translated content

Swedish job keywords: utvecklare (developer), sjuksköterska (nurse), kock (chef),
lärare (teacher), städare/lokalvårdare (cleaner), chaufför (driver), ingenjör (engineer)`,
    inputSchema: {
      query: z.string().describe("Search query IN SWEDISH"),
      location: z.string().optional().describe("City/region in Sweden"),
      limit: z.number().optional().default(5),
      language: z.string().describe("User's language code (e.g., 'so', 'ar', 'sv')"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      loadingText: z.string().describe("'Searching for jobs...' in user's language"),
      translatingText: z.string().describe("'Translating results...' in user's language")
    },
    _meta: {
      // NO widget here - only display_jobs shows widget
      "openai/toolInvocation/invoking": "🔍",
      "openai/toolInvocation/invoked": "✓"
    }
  },
  async ({ query, location, limit, language, direction, loadingText, translatingText }) => {
    console.log(`🔧 search_jobs called: "${query}" in ${location || 'Sweden'} (${language})`);

    // Search for jobs
    const data = await searchJobs(query, location, limit || 5);
    const jobs = data.hits.map(formatJob);
    const total = data.total?.value || 0;

    console.log(`📤 Found ${jobs.length} jobs - waiting for translation...`);

    // Return job data for ChatGPT to translate (no widget yet)
    return {
      content: [{
        type: "text",
        text: `FOUND ${total} JOBS - NOW TRANSLATE AND CALL display_jobs:

Query (for display): translate "${query}" to ${language}
Location (for display): ${location || 'Sweden'}

TRANSLATE ALL THIS JOB DATA TO ${language.toUpperCase()}:
${JSON.stringify(jobs, null, 2)}

REQUIRED: Call display_jobs NOW with:
- language: "${language}"
- direction: "${direction}"
- query: translated search term
- location: translated location
- total: ${total}
- labels: ALL UI text translated
- jobs: ALL job content translated (title, employer, location, description, deadline, employmentType, salaryType)`
      }]
    };
  }
);

// ============================================================
// STEP 2: display_jobs - Show translated results
// ============================================================
server.registerTool(
  "display_jobs",
  {
    title: "Display Translated Jobs",
    description: "Display the translated job results. Call this IMMEDIATELY after search_jobs.",
    inputSchema: {
      language: z.string(),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      query: z.string().describe("Translated search term"),
      location: z.string().describe("Translated location"),
      total: z.number(),
      labels: z.object({
        results: z.string().describe("'Search Results'"),
        found: z.string().describe("'jobs found'"),
        details: z.string().describe("'Details'"),
        hide: z.string().describe("'Hide'"),
        apply: z.string().describe("'Apply'"),
        noJobs: z.string().describe("'No jobs found'"),
        tryAgain: z.string().describe("'Try different keywords'"),
        location: z.string().describe("'Location'"),
        deadline: z.string().describe("'Deadline'"),
        type: z.string().describe("'Type'"),
        salary: z.string().describe("'Salary'"),
        daysLeft: z.string().describe("'days left'"),
        today: z.string().describe("'Today!'")
      }),
      jobs: z.array(z.object({
        id: z.string(),
        title: z.string().describe("TRANSLATED job title"),
        employer: z.string().describe("Employer name"),
        location: z.string().describe("TRANSLATED location"),
        region: z.string().optional(),
        deadline: z.string().describe("TRANSLATED deadline"),
        description: z.string().describe("TRANSLATED description"),
        fullDescription: z.string().optional(),
        url: z.string(),
        employmentType: z.string().optional().describe("TRANSLATED"),
        salaryType: z.string().optional().describe("TRANSLATED")
      }))
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html"
    }
  },
  async ({ language, direction, query, location, total, labels, jobs }) => {
    console.log(`✅ display_jobs: ${jobs.length} translated jobs in ${language}`);

    return {
      structuredContent: {
        loading: false,
        language,
        direction,
        query,
        location,
        total,
        labels,
        jobs
      },
      content: [{
        type: "text",
        text: `Showing ${jobs.length} jobs for "${query}" in ${location}`
      }]
    };
  }
);

// ============================================================
// get_job_details - Single step for job details
// ============================================================
server.registerTool(
  "get_job_details",
  {
    title: "Show Job Details",
    description: "Get and display job details. Translate labels before calling.",
    inputSchema: {
      jobId: z.string(),
      language: z.string(),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      labels: z.object({
        location: z.string(),
        deadline: z.string(),
        type: z.string(),
        salary: z.string(),
        description: z.string(),
        apply: z.string(),
        backToResults: z.string()
      })
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-detail.html"
    }
  },
  async ({ jobId, language, direction, labels }) => {
    console.log(`🔧 get_job_details: ${jobId} (${language})`);
    const job = await getJobById(jobId);
    if (!job) {
      return { content: [{ type: "text", text: `Job not found: ${jobId}` }] };
    }
    const formatted = formatJob(job);
    console.log(`✅ Returning: ${formatted.title}`);

    return {
      structuredContent: { language, direction, labels, job: formatted },
      content: [{ type: "text", text: `Details for: ${formatted.title}` }]
    };
  }
);

console.log("✅ Tools: search_jobs → display_jobs, get_job_details");

// HTTP Server
const transports = new Map();

const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/widget") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(jobListHTML);
    return;
  }

  if (url.pathname === "/widget/detail") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(jobDetailHTML);
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"ok","service":"smidra","version":"4.0.0"}');
    return;
  }

  if (url.pathname === "/api/search") {
    const q = url.searchParams.get("q") || "utvecklare";
    const loc = url.searchParams.get("location");
    const lim = parseInt(url.searchParams.get("limit") || "5");
    const data = await searchJobs(q, loc, lim);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ total: data.total?.value || 0, jobs: data.hits.map(formatJob) }));
    return;
  }

  if (url.pathname === "/mcp") {
    if (req.method === "GET") {
      console.log("📡 SSE connection");
      const transport = new SSEServerTransport("/mcp", res);
      transports.set(transport.sessionId, transport);
      console.log(`📡 Session: ${transport.sessionId}`);
      res.on("close", () => { transports.delete(transport.sessionId); });
      await server.connect(transport);
      return;
    }

    if (req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400);
        res.end('{"error":"Invalid session"}');
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk.toString();
      await transports.get(sessionId).handlePostMessage(req, res, body);
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`
💼 Smidra v4.0 - Hybrid Multilingual Job Search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP:     http://localhost:${PORT}/mcp
Widget:  http://localhost:${PORT}/widget
Health:  http://localhost:${PORT}/health

Flow: search_jobs (loading) → ChatGPT translates → display_jobs
`);
});

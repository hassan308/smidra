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

// Loading widget HTML (auto-hides after results appear)
const jobLoadingHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: transparent;
    }
    .loading-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 12px;
      border: 1px solid #bae6fd;
      transition: opacity 0.3s, transform 0.3s;
    }
    .loading-container.hidden {
      opacity: 0;
      transform: scale(0.95);
      pointer-events: none;
      height: 0;
      padding: 0;
      margin: 0;
      overflow: hidden;
    }
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #0ea5e9;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      color: #0369a1;
      font-size: 14px;
      font-weight: 500;
    }
    .job-count {
      margin-left: auto;
      background: #0ea5e9;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    [dir="rtl"] { direction: rtl; }
    [dir="rtl"] .loading-container { flex-direction: row-reverse; }
    [dir="rtl"] .job-count { margin-left: 0; margin-right: auto; }
  </style>
</head>
<body>
  <div class="loading-container" id="loader">
    <div class="spinner"></div>
    <span class="loading-text" id="text">Loading...</span>
    <span class="job-count" id="count"></span>
  </div>
  <script>
    const loader = document.getElementById('loader');
    const textEl = document.getElementById('text');
    const countEl = document.getElementById('count');

    function hideLoader() {
      loader.classList.add('hidden');
      setTimeout(() => {
        document.body.style.display = 'none';
        window.openai?.notifyIntrinsicHeight?.(0);
      }, 300);
    }

    function init() {
      const data = window.openai?.toolOutput;
      if (data) {
        if (data.direction) document.documentElement.dir = data.direction;
        if (data.loadingText) textEl.textContent = data.loadingText;
        if (data.jobCount) countEl.textContent = data.jobCount;
      }
      window.openai?.notifyIntrinsicHeight?.(document.body.scrollHeight);

      // Auto-hide after 10 seconds (fallback)
      setTimeout(hideLoader, 10000);
    }

    // Listen for new tool calls (display_jobs)
    window.addEventListener('openai:tool_call', hideLoader);

    // Also hide if we detect results widget appeared
    const observer = new MutationObserver(() => {
      // If another widget appeared, hide this one
      if (document.hidden) hideLoader();
    });

    init();
  </script>
</body>
</html>`;

// Register widget resources
server.registerResource("job-loading-widget", "ui://widget/job-loading.html", {}, async () => ({
  contents: [{ uri: "ui://widget/job-loading.html", mimeType: "text/html+skybridge", text: jobLoadingHTML }]
}));

server.registerResource("job-list-widget", "ui://widget/job-list.html", {}, async () => ({
  contents: [{ uri: "ui://widget/job-list.html", mimeType: "text/html+skybridge", text: jobListHTML }]
}));

server.registerResource("job-detail-widget", "ui://widget/job-detail.html", {}, async () => ({
  contents: [{ uri: "ui://widget/job-detail.html", mimeType: "text/html+skybridge", text: jobDetailHTML }]
}));

// ============================================================
// STEP 1: search_jobs - Returns data, REQUIRES display_jobs
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs (Step 1 of 2)",
    description: `Search for jobs. Returns Swedish data that YOU MUST translate and pass to display_jobs.

⚠️ THIS TOOL DOES NOT SHOW ANYTHING TO THE USER!
⚠️ YOU MUST CALL display_jobs AFTER THIS TO SHOW RESULTS!
⚠️ THIS APPLIES TO EVERY SEARCH - not just the first one!

WORKFLOW (repeat for EVERY job search):
1. Call this tool → receive Swedish job data
2. Translate job titles, descriptions, locations to user's language
3. Call display_jobs with translated content → user sees widget

IMPORTANT: Even if user has searched before in this conversation,
you MUST ALWAYS call display_jobs after EVERY search_jobs call.
Never skip display_jobs - user cannot see jobs without it!

DO NOT respond to user until you have called display_jobs!

Swedish keywords: utvecklare, sjuksköterska, kock, lärare, städare, lokalvårdare, chaufför`,
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
      // No widget - forces ChatGPT to call display_jobs
    }
  },
  async ({ query, location, limit, language, direction, loadingText, translatingText }) => {
    console.log(`🔧 search_jobs called: "${query}" in ${location || 'Sweden'} (${language})`);

    // Search for jobs
    const data = await searchJobs(query, location, limit || 5);
    const jobs = data.hits.map(formatJob);
    const total = data.total?.value || 0;

    console.log(`📤 Found ${jobs.length} jobs - must call display_jobs next`);

    // Return ONLY text - no widget! Forces ChatGPT to call display_jobs
    return {
      content: [{
        type: "text",
        text: `⚠️ INCOMPLETE - YOU MUST CALL display_jobs TO SHOW RESULTS ⚠️

Found ${total} jobs. Translate and call display_jobs NOW:

TRANSLATE to ${language.toUpperCase()}:
- query: "${query}"
- location: "${location || 'Sweden'}"

⚠️ IMPORTANT - DO NOT TRANSLATE:
- id (keep exactly as is)
- url (keep exactly as is - these are real links!)
- employer names (keep original)

TRANSLATE ONLY these fields:
- title (job title)
- location (city/region name)
- description (job description)
- deadline (date or "Ongoing")
- employmentType (e.g., "Full-time", "Part-time")
- salaryType (e.g., "Monthly salary")

JOB DATA:
${JSON.stringify(jobs, null, 2)}

CALL display_jobs with:
- language: "${language}"
- direction: "${direction}"
- query: translated
- location: translated
- total: ${total}
- labels: all UI text translated
- jobs: array with translated fields (KEEP id and url unchanged!)`
      }]
    };
  }
);

// ============================================================
// STEP 2: display_jobs - ONLY way to show results to user
// ============================================================
server.registerTool(
  "display_jobs",
  {
    title: "Display Jobs (Step 2 of 2)",
    description: `Show job results to user. This is the ONLY way to display jobs!

Call this IMMEDIATELY after EVERY search_jobs call with translated content.
User will NOT see any jobs until you call this tool.

ALWAYS call this after search_jobs - for EVERY search in the conversation!`,
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
        id: z.string().describe("KEEP ORIGINAL - do not change"),
        title: z.string().describe("TRANSLATED job title"),
        employer: z.string().describe("KEEP ORIGINAL employer name"),
        location: z.string().describe("TRANSLATED location"),
        region: z.string().optional(),
        deadline: z.string().describe("TRANSLATED deadline"),
        description: z.string().describe("TRANSLATED description"),
        fullDescription: z.string().optional(),
        url: z.string().describe("KEEP ORIGINAL URL - do not modify!"),
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

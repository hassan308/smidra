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
  version: "2.0.0"
});

// Register job list widget resource
server.registerResource(
  "job-list-widget",
  "ui://widget/job-list-v4.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/job-list-v4.html",
      mimeType: "text/html+skybridge",
      text: jobListHTML,
      _meta: {
        "openai/widgetPrefersBorder": true,
        "openai/widgetCSP": {
          connect_domains: ["https://jobsearch.api.jobtechdev.se"],
          resource_domains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]
        }
      }
    }]
  })
);

// Register job detail widget resource
server.registerResource(
  "job-detail-widget",
  "ui://widget/job-detail-v3.html",
  {},
  async () => ({
    contents: [{
      uri: "ui://widget/job-detail-v3.html",
      mimeType: "text/html+skybridge",
      text: jobDetailHTML,
      _meta: {
        "openai/widgetPrefersBorder": true,
        "openai/widgetCSP": {
          connect_domains: ["https://jobsearch.api.jobtechdev.se"],
          resource_domains: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]
        }
      }
    }]
  })
);

// ============================================================
// STEP 1: search_jobs - Returns raw data for translation
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs in Sweden",
    description: `Search for jobs on Arbetsförmedlingen (Swedish Employment Agency).

Use this when the user wants to find jobs, search for work, or mentions job hunting in Sweden.

IMPORTANT: This tool returns job data in Swedish. After receiving results, you MUST:
1. Translate ALL job titles, descriptions, employer names, and location names to the user's language
2. Call the display_jobs tool with the translated data to show the visual widget

Example flow:
- User asks in Arabic: "أبحث عن وظيفة مطور"
- You call search_jobs with query="utvecklare" (translate to Swedish for better results)
- You receive Swedish job data
- You translate everything to Arabic
- You call display_jobs with the Arabic translations`,
    inputSchema: {
      query: z.string().describe("Job title or keyword IN SWEDISH for best results (e.g., 'utvecklare', 'sjuksköterska', 'kock')"),
      location: z.string().optional().describe("City or region in Sweden (e.g., 'Stockholm', 'Göteborg', 'Gävle')"),
      limit: z.number().optional().default(5).describe("Number of results (default: 5, max: 20)")
    },
    _meta: {
      "openai/toolInvocation/invoking": "Searching Arbetsförmedlingen...",
      "openai/toolInvocation/invoked": "Found jobs - preparing display..."
    }
  },
  async ({ query, location, limit }) => {
    console.log(`🔧 search_jobs called: query="${query}", location="${location || 'hela Sverige'}", limit=${limit}`);

    const data = await searchJobs(query, location, limit || 5);
    const jobs = data.hits.map(formatJob);
    const total = data.total?.value || 0;

    console.log(`📤 Found ${jobs.length} jobs (total: ${total})`);

    // Return as TEXT only - no structuredContent
    // ChatGPT will translate and call display_jobs
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          _instruction: "Translate all text fields to the user's language, then call display_jobs with the translated data",
          query,
          location: location || "Hela Sverige",
          total,
          jobs
        }, null, 2)
      }]
    };
  }
);

// ============================================================
// STEP 2: display_jobs - Shows translated data in widget
// ============================================================
server.registerTool(
  "display_jobs",
  {
    title: "Display Job Results",
    description: `Display job search results in a visual widget.

ONLY call this tool AFTER calling search_jobs and translating the results to the user's language.

Pass the translated job data including:
- Translated job titles
- Translated descriptions
- Translated employer names
- Translated location names
- UI labels in the user's language`,
    inputSchema: {
      language: z.string().describe("Language code (e.g., 'ar', 'en', 'sv', 'es', 'zh')"),
      direction: z.enum(["ltr", "rtl"]).default("ltr").describe("Text direction: 'rtl' for Arabic/Hebrew, 'ltr' for others"),
      query: z.string().describe("The search query (translated to user's language)"),
      location: z.string().describe("The location (translated to user's language)"),
      total: z.number().describe("Total number of jobs found"),
      labels: z.object({
        results: z.string().describe("'Search Results' in user's language"),
        found: z.string().describe("'jobs found' in user's language"),
        details: z.string().describe("'Details' in user's language"),
        hide: z.string().describe("'Hide' in user's language"),
        apply: z.string().describe("'Apply' in user's language"),
        noJobs: z.string().describe("'No jobs found' in user's language"),
        tryAgain: z.string().describe("'Try different keywords' in user's language"),
        location: z.string().describe("'Location' in user's language"),
        deadline: z.string().describe("'Apply by' in user's language"),
        type: z.string().describe("'Type' in user's language"),
        salary: z.string().describe("'Salary' in user's language"),
        daysLeft: z.string().describe("'days left' in user's language"),
        today: z.string().describe("'Today!' in user's language")
      }).describe("UI labels translated to user's language"),
      jobs: z.array(z.object({
        id: z.string(),
        title: z.string().describe("Translated job title"),
        employer: z.string().describe("Employer name (keep original or translate)"),
        location: z.string().describe("Translated location"),
        region: z.string().optional(),
        deadline: z.string().describe("Deadline date or 'Ongoing' translated"),
        description: z.string().describe("Translated short description"),
        fullDescription: z.string().optional().describe("Translated full description"),
        url: z.string(),
        logoUrl: z.string().optional(),
        employmentType: z.string().optional().describe("Translated employment type"),
        salaryType: z.string().optional().describe("Translated salary type"),
        workingHours: z.string().optional().describe("Translated working hours")
      })).describe("Array of jobs with translated content")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list-v4.html",
      "openai/toolInvocation/invoking": "Preparing job display...",
      "openai/toolInvocation/invoked": "Jobs ready!",
      "openai/widgetAccessible": true
    }
  },
  async ({ language, direction, query, location, total, labels, jobs }) => {
    console.log(`🔧 display_jobs called: ${jobs.length} jobs in ${language} (${direction})`);

    const result = {
      language,
      direction,
      query,
      location,
      total,
      labels,
      jobs
    };

    return {
      structuredContent: result,
      content: [{
        type: "text",
        text: `Displaying ${jobs.length} jobs in ${language}`
      }]
    };
  }
);

// ============================================================
// STEP 1b: get_job_details - Returns raw data for translation
// ============================================================
server.registerTool(
  "get_job_details",
  {
    title: "Get Job Details",
    description: `Get detailed information about a specific job.

Use when the user wants more information about a particular job from the search results.

IMPORTANT: This tool returns data in Swedish. After receiving results, you MUST:
1. Translate all text to the user's language
2. Call display_job_detail with the translated data`,
    inputSchema: {
      jobId: z.string().describe("The job ID from search results")
    },
    _meta: {
      "openai/toolInvocation/invoking": "Loading job details...",
      "openai/toolInvocation/invoked": "Got details - preparing display..."
    }
  },
  async ({ jobId }) => {
    console.log(`🔧 get_job_details called: jobId="${jobId}"`);

    const job = await getJobById(jobId);

    if (!job) {
      return {
        content: [{ type: "text", text: `Job not found: ${jobId}` }]
      };
    }

    const formatted = formatJob(job);
    console.log(`📤 Returning job: ${formatted.title}`);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          _instruction: "Translate all text fields to the user's language, then call display_job_detail",
          ...formatted
        }, null, 2)
      }]
    };
  }
);

// ============================================================
// STEP 2b: display_job_detail - Shows translated detail in widget
// ============================================================
server.registerTool(
  "display_job_detail",
  {
    title: "Display Job Detail",
    description: `Display detailed job information in a visual widget.

ONLY call this after get_job_details and translating the content.`,
    inputSchema: {
      language: z.string().describe("Language code"),
      direction: z.enum(["ltr", "rtl"]).default("ltr").describe("Text direction"),
      labels: z.object({
        location: z.string(),
        deadline: z.string(),
        type: z.string(),
        salary: z.string(),
        description: z.string(),
        apply: z.string(),
        backToResults: z.string()
      }).describe("UI labels in user's language"),
      job: z.object({
        id: z.string(),
        title: z.string(),
        employer: z.string(),
        location: z.string(),
        region: z.string().optional(),
        deadline: z.string(),
        description: z.string(),
        fullDescription: z.string(),
        url: z.string(),
        logoUrl: z.string().optional(),
        employmentType: z.string().optional(),
        salaryType: z.string().optional(),
        workingHours: z.string().optional(),
        occupationField: z.string().optional()
      }).describe("Job data with translated content")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-detail-v3.html",
      "openai/toolInvocation/invoking": "Preparing job detail...",
      "openai/toolInvocation/invoked": "Job detail ready!",
      "openai/widgetAccessible": true
    }
  },
  async ({ language, direction, labels, job }) => {
    console.log(`🔧 display_job_detail called: ${job.title} in ${language}`);

    return {
      structuredContent: { language, direction, labels, ...job },
      content: [{
        type: "text",
        text: `${job.title} at ${job.employer}`
      }]
    };
  }
);

console.log("✅ Tools registered: search_jobs, display_jobs, get_job_details, display_job_detail");

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
    res.end('{"status":"ok","service":"smidra","version":"2.0.0"}');
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
💼 Smidra v2.0 - Multilingual Job Search
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP:     http://localhost:${PORT}/mcp
Widget:  http://localhost:${PORT}/widget
API:     http://localhost:${PORT}/api/search?q=utvecklare
Health:  http://localhost:${PORT}/health

Flow: search_jobs → ChatGPT translates → display_jobs
`);
});

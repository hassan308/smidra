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

async function searchJobsSingle(query, location, limit = 100, offset = 0) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());
  const regionCode = findRegion(location);
  if (regionCode) params.set("region", regionCode);

  const url = `${AF_API_BASE}/search?${params.toString()}`;

  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error("❌ API error:", error);
    return { total: { value: 0 }, hits: [] };
  }
}

// Parallel search - fetches ALL jobs using concurrent requests
async function searchJobs(query, location, limit = 0) {
  const BATCH_SIZE = 100; // Jobs per request
  const MAX_CONCURRENT = 10; // Max parallel requests at once
  const startTime = Date.now();

  // First, get total count with a small request
  console.log(`🔍 Getting total count for "${query}"...`);
  const initial = await searchJobsSingle(query, location, 1, 0);
  const totalAvailable = initial.total?.value || 0;

  if (totalAvailable === 0) {
    console.log(`❌ No jobs found for "${query}"`);
    return { total: { value: 0 }, hits: [] };
  }

  // Determine how many to fetch (0 = all)
  const targetCount = limit > 0 ? Math.min(limit, totalAvailable) : totalAvailable;
  const numBatches = Math.ceil(targetCount / BATCH_SIZE);

  console.log(`⚡ Fetching ALL ${targetCount} jobs in ${numBatches} parallel batches...`);

  // Create all batch requests
  const batchRequests = [];
  for (let i = 0; i < numBatches; i++) {
    const offset = i * BATCH_SIZE;
    const batchLimit = Math.min(BATCH_SIZE, targetCount - offset);
    batchRequests.push({ offset, limit: batchLimit });
  }

  // Execute in waves of MAX_CONCURRENT to avoid overwhelming the API
  const allHits = [];
  for (let wave = 0; wave < batchRequests.length; wave += MAX_CONCURRENT) {
    const waveBatches = batchRequests.slice(wave, wave + MAX_CONCURRENT);
    const waveNum = Math.floor(wave / MAX_CONCURRENT) + 1;
    const totalWaves = Math.ceil(batchRequests.length / MAX_CONCURRENT);

    console.log(`   Wave ${waveNum}/${totalWaves}: ${waveBatches.length} requests`);

    const waveResults = await Promise.all(
      waveBatches.map(b => searchJobsSingle(query, location, b.limit, b.offset))
    );

    for (const result of waveResults) {
      if (result.hits) allHits.push(...result.hits);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`⚡ Complete: ${allHits.length}/${totalAvailable} jobs in ${elapsed}ms`);

  return {
    total: { value: totalAvailable },
    hits: allHits
  };
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
const salaryWidgetHTML = readFileSync(join(__dirname, "salary-widget.html"), "utf-8");

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

server.registerResource("salary-widget", "ui://widget/salary.html", {}, async () => ({
  contents: [{ uri: "ui://widget/salary.html", mimeType: "text/html+skybridge", text: salaryWidgetHTML }]
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
      limit: z.number().optional().default(0).describe("Number of jobs (0 = ALL available jobs)"),
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

    // Return structured JSON with clear next_action
    const response = {
      status: "INCOMPLETE",
      message: "Data retrieved. You MUST call display_jobs to show results to user.",
      next_action: {
        required: true,
        tool: "display_jobs",
        reason: "User cannot see any results until you call display_jobs"
      },
      data: {
        total,
        language,
        direction,
        query_swedish: query,
        location_swedish: location || "Sweden",
        jobs
      },
      instructions: {
        translate: ["title", "description", "location", "deadline", "employmentType", "salaryType"],
        keep_original: ["id", "url", "employer"],
        ui_labels_needed: ["results", "found", "details", "hide", "apply", "noJobs", "tryAgain", "location", "deadline", "type", "salary", "daysLeft", "today"]
      }
    };

    return {
      content: [{
        type: "text",
        text: `${JSON.stringify(response, null, 2)}

⚠️ ACTION REQUIRED: Call display_jobs NOW with translated content!`
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

// ============================================================
// ACTION TOOLS - Called from widget buttons via callTool()
// ============================================================

// Salary statistics tool
server.registerTool(
  "get_salary_info",
  {
    title: "Get Salary Statistics",
    description: "Get salary statistics for a specific job/occupation. Returns text for ChatGPT to present.",
    inputSchema: {
      jobTitle: z.string().describe("The job title to get salary info for"),
      location: z.string().optional().describe("Location (city or region)"),
      language: z.string().default("sv").describe("Response language code")
    }
  },
  async ({ jobTitle, location, language }) => {
    console.log(`💰 get_salary_info: ${jobTitle} in ${location || 'Sweden'}`);

    // Return instructions for ChatGPT to answer using its knowledge
    return {
      content: [{
        type: "text",
        text: `USER REQUEST: Salary statistics for "${jobTitle}" in ${location || 'Sweden'}.

Please provide helpful salary information based on your knowledge:
- Average/median salary range
- Entry level vs senior level
- How it compares to other regions
- Factors that affect salary

Respond in the user's language (${language}). Be helpful and informative!`
      }]
    };
  }
);

// Cover letter help tool
server.registerTool(
  "write_cover_letter",
  {
    title: "Write Cover Letter",
    description: "Help user write a cover letter for a specific job application.",
    inputSchema: {
      jobTitle: z.string().describe("The job title"),
      employer: z.string().describe("The employer/company name"),
      location: z.string().optional(),
      jobDescription: z.string().describe("Brief job description"),
      language: z.string().default("sv")
    }
  },
  async ({ jobTitle, employer, location, jobDescription, language }) => {
    console.log(`✍️ write_cover_letter: ${jobTitle} at ${employer}`);

    return {
      content: [{
        type: "text",
        text: `USER REQUEST: Help write a cover letter for this job application.

Job: ${jobTitle}
Company: ${employer}
Location: ${location || 'Not specified'}
Description: ${jobDescription}

Please write a professional, engaging cover letter that:
- Shows enthusiasm for the role
- Highlights relevant skills (ask user about their background if needed)
- Is tailored to the company
- Has a strong opening and closing

Respond in ${language}. Offer to customize it further based on user's experience.`
      }]
    };
  }
);

// Job market analysis tool
server.registerTool(
  "analyze_job_market",
  {
    title: "Analyze Job Market",
    description: "Provide job market analysis for a specific occupation.",
    inputSchema: {
      jobTitle: z.string().describe("The job/occupation to analyze"),
      location: z.string().optional(),
      language: z.string().default("sv")
    }
  },
  async ({ jobTitle, location, language }) => {
    console.log(`📊 analyze_job_market: ${jobTitle}`);

    return {
      content: [{
        type: "text",
        text: `USER REQUEST: Job market analysis for "${jobTitle}" in ${location || 'Sweden'}.

Please provide helpful job market insights:
- Current demand/supply situation
- Industry trends
- Future outlook
- Skills in high demand
- Tips for standing out as a candidate

Respond in ${language}. Be encouraging and practical!`
      }]
    };
  }
);

// Compare jobs tool
server.registerTool(
  "compare_jobs",
  {
    title: "Compare Jobs",
    description: "Compare multiple jobs and provide recommendation.",
    inputSchema: {
      jobs: z.array(z.object({
        title: z.string(),
        employer: z.string(),
        location: z.string().optional(),
        description: z.string().optional()
      })).describe("List of jobs to compare"),
      language: z.string().default("sv")
    }
  },
  async ({ jobs, language }) => {
    console.log(`⚖️ compare_jobs: ${jobs.length} jobs`);

    const jobList = jobs.map((j, i) => `${i + 1}. ${j.title} at ${j.employer} (${j.location || 'N/A'})`).join('\n');

    return {
      content: [{
        type: "text",
        text: `USER REQUEST: Compare these jobs and give a recommendation.

Jobs to compare:
${jobList}

Please provide:
- Pros and cons of each
- Salary comparison (if you can estimate)
- Career growth potential
- Your recommendation based on typical career goals

Ask the user about their priorities (salary, growth, location, etc.) to give better advice.
Respond in ${language}.`
      }]
    };
  }
);

// ============================================================
// DISPLAY TOOLS - Show data in beautiful widgets
// ============================================================

// Display salary statistics widget
server.registerTool(
  "display_salary",
  {
    title: "Display Salary Statistics",
    description: `Show salary statistics in a beautiful widget.

Call this AFTER you have searched the web for salary information.
Pass the job details AND the salary data you found.

The widget will display:
- Average salary with visual range bar
- Min/max salary range
- Comparison to regional average
- Tips for salary negotiation
- Sources of the data`,
    inputSchema: {
      language: z.string().default("sv"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      job: z.object({
        title: z.string().describe("Job title"),
        employer: z.string().describe("Company name"),
        location: z.string().optional().describe("Location")
      }),
      salary: z.object({
        avg: z.number().describe("Average salary per month in SEK"),
        min: z.number().describe("Minimum salary (entry level)"),
        max: z.number().describe("Maximum salary (senior level)"),
        entryLevel: z.number().optional().describe("Typical entry level salary"),
        experienced: z.number().optional().describe("Typical senior salary")
      }),
      comparison: z.object({
        percentDiff: z.number().describe("Percentage difference from regional average (positive = above)"),
        description: z.string().optional().describe("Comparison description")
      }).optional(),
      industry: z.string().optional().describe("Industry sector"),
      demandLevel: z.string().optional().describe("Job market demand level"),
      tips: z.array(z.string()).optional().describe("Salary negotiation tips"),
      sources: z.array(z.string()).optional().describe("Data sources"),
      labels: z.object({
        avgSalary: z.string().optional(),
        perMonth: z.string().optional(),
        salaryRange: z.string().optional(),
        min: z.string().optional(),
        max: z.string().optional(),
        entryLevel: z.string().optional(),
        senior: z.string().optional(),
        comparison: z.string().optional(),
        aboveAvg: z.string().optional(),
        belowAvg: z.string().optional(),
        inRegion: z.string().optional(),
        sources: z.string().optional(),
        tips: z.string().optional(),
        backToJob: z.string().optional(),
        negotiate: z.string().optional()
      }).optional()
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/salary.html"
    }
  },
  async (params) => {
    console.log(`💰 display_salary: ${params.job.title} - avg ${params.salary.avg} kr`);

    return {
      structuredContent: params,
      content: [{
        type: "text",
        text: `Salary statistics for ${params.job.title}: ${params.salary.avg} kr/month (range: ${params.salary.min}-${params.salary.max} kr)`
      }]
    };
  }
);

console.log("✅ Tools: search_jobs → display_jobs, get_job_details, display_salary");

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

  if (url.pathname === "/widget/salary") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(salaryWidgetHTML);
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
    const lim = parseInt(url.searchParams.get("limit") || "0"); // 0 = all jobs
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

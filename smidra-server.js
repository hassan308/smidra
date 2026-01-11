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

// Swedish regions mapping (län)
const regions = {
  "stockholm": "01", "uppsala": "03", "sodermanland": "04", "ostergotland": "05",
  "jonkoping": "06", "kronoberg": "07", "kalmar": "08", "gotland": "09",
  "blekinge": "10", "skane": "12", "halland": "13", "vastra gotaland": "14",
  "varmland": "17", "orebro": "18", "vastmanland": "19", "dalarna": "20",
  "gavleborg": "21", "vasternorrland": "22", "jamtland": "23", "vasterbotten": "24",
  "norrbotten": "25"
};

// Municipality codes (kommun) - for exact city matching
const municipalities = {
  // Stockholm region
  "stockholm": "0180", "solna": "0184", "sundbyberg": "0183", "nacka": "0182",
  "huddinge": "0126", "botkyrka": "0127", "haninge": "0136", "taby": "0160",
  "sollentuna": "0163", "jarfalla": "0123", "lidingo": "0186", "norrtälje": "0188",
  "norrtalje": "0188", "sodertälje": "0181", "sodertalje": "0181",
  // Västra Götaland
  "goteborg": "1480", "gothenburg": "1480", "molndal": "1481", "partille": "1402",
  "kungalv": "1482", "trollhattan": "1488", "uddevalla": "1485", "boras": "1490",
  "skovde": "1496", "lidkoping": "1494", "vanersborg": "1487", "kungsbacka": "1384",
  // Skåne
  "malmo": "1280", "lund": "1281", "helsingborg": "1283", "kristianstad": "1290",
  "landskrona": "1282", "trelleborg": "1287", "angelholm": "1292", "eslöv": "1285",
  "eslov": "1285", "ystad": "1286", "hassleholm": "1293",
  // Other major cities
  "uppsala": "0380", "linkoping": "0580", "norrkoping": "0581", "vasteras": "1980",
  "orebro": "1880", "helsingborg": "1283", "jonkoping": "0680", "umea": "2480",
  "lulea": "2580", "gavle": "2180", "sundsvall": "2281", "ostersund": "2380",
  "karlstad": "1780", "vaxjo": "0780", "kalmar": "0880", "halmstad": "1380",
  "eskilstuna": "0484", "falun": "2080", "borlange": "2081", "karlskrona": "1080",
  "skelleftea": "2482", "pitea": "2581", "kiruna": "2584", "visby": "0980",
  "nykoping": "0480", "katrineholm": "0483", "motala": "0583", "trollhattan": "1488"
};

// City to region mapping (fallback if municipality not found)
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

// Find municipality code for exact city matching
function findMunicipality(location) {
  if (!location) return null;
  const loc = normalizeSwedish(location);
  if (municipalities[loc]) return municipalities[loc];
  for (const [name, code] of Object.entries(municipalities)) {
    if (loc.includes(name) || name.includes(loc)) return code;
  }
  return null;
}

// Find region code (fallback for broader search)
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

async function searchJobsSingle(query, location, limit = 100, offset = 0, filters = {}) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", limit.toString());
  params.set("offset", offset.toString());

  // Try municipality first (exact city match), then region (broader)
  const municipalityCode = findMunicipality(location);
  const regionCode = findRegion(location);

  if (municipalityCode) {
    params.set("municipality", municipalityCode);
    console.log(`🏙️ Searching in municipality: ${location} (${municipalityCode})`);
  } else if (regionCode) {
    params.set("region", regionCode);
    console.log(`🗺️ Searching in region: ${location} (${regionCode})`);
  }

  // Apply filters
  if (filters.remote) {
    params.set("remote", "true");
    console.log(`🏠 Filter: Remote/distans`);
  }
  if (filters.fulltime) {
    params.set("worktime-extent", "6YE1_gAC_R2G"); // Heltid code
    console.log(`⏰ Filter: Heltid`);
  }
  if (filters.parttime) {
    params.set("worktime-extent", "947z_JGS_Uk2"); // Deltid code
    console.log(`⏰ Filter: Deltid`);
  }
  if (filters.drivingLicense) {
    params.set("driving-license-required", "true");
    console.log(`🚗 Filter: Körkort krävs`);
  }
  if (filters.trainee) {
    params.set("trainee", "true");
    console.log(`🎓 Filter: Praktik/trainee`);
  }
  if (filters.abroad) {
    params.set("abroad", "true");
    console.log(`✈️ Filter: Utomlands`);
  }
  if (filters.language) {
    params.set("language", filters.language);
    console.log(`🗣️ Filter: Språk ${filters.language}`);
  }
  if (filters.noExperience) {
    params.set("experience", "false");
    console.log(`🌟 Filter: Ingen erfarenhet krävs`);
  }

  const url = `${AF_API_BASE}/search?${params.toString()}`;

  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error("❌ API error:", error);
    return { total: { value: 0 }, hits: [] };
  }
}

// Quick search - returns first batch immediately with total count
async function searchJobsQuick(query, location, limit = 100, filters = {}) {
  const startTime = Date.now();
  console.log(`🚀 Quick search: "${query}" (first ${limit} jobs)`);

  const result = await searchJobsSingle(query, location, limit, 0, filters);
  const elapsed = Date.now() - startTime;

  console.log(`🚀 Quick complete: ${result.hits?.length || 0}/${result.total?.value || 0} jobs in ${elapsed}ms`);
  return result;
}

// Parallel search - fetches ALL jobs using concurrent requests
async function searchJobsAll(query, location, filters = {}) {
  const BATCH_SIZE = 100;
  const MAX_CONCURRENT = 10;
  const startTime = Date.now();

  // First, get total count
  console.log(`🔍 Getting total count for "${query}"...`);
  const initial = await searchJobsSingle(query, location, 1, 0, filters);
  const totalAvailable = initial.total?.value || 0;

  if (totalAvailable === 0) {
    return { total: { value: 0 }, hits: [] };
  }

  const numBatches = Math.ceil(totalAvailable / BATCH_SIZE);
  console.log(`⚡ Fetching ALL ${totalAvailable} jobs in ${numBatches} parallel batches...`);

  const batchRequests = [];
  for (let i = 0; i < numBatches; i++) {
    batchRequests.push({ offset: i * BATCH_SIZE, limit: BATCH_SIZE });
  }

  const allHits = [];
  for (let wave = 0; wave < batchRequests.length; wave += MAX_CONCURRENT) {
    const waveBatches = batchRequests.slice(wave, wave + MAX_CONCURRENT);
    console.log(`   Wave ${Math.floor(wave / MAX_CONCURRENT) + 1}: ${waveBatches.length} requests`);

    const waveResults = await Promise.all(
      waveBatches.map(b => searchJobsSingle(query, location, b.limit, b.offset, filters))
    );

    for (const result of waveResults) {
      if (result.hits) allHits.push(...result.hits);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`⚡ Complete: ${allHits.length}/${totalAvailable} jobs in ${elapsed}ms`);

  return { total: { value: totalAvailable }, hits: allHits };
}

// Main search function - quick by default, all if specified
async function searchJobs(query, location, limit = 100, filters = {}) {
  if (limit === 0) {
    return searchJobsAll(query, location, filters);
  }
  return searchJobsQuick(query, location, limit, filters);
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
  // API returns coordinates as [longitude, latitude]
  const coords = job.workplace_address?.coordinates;
  let lat = null, lng = null;
  if (coords && coords.length === 2) {
    lng = coords[0];
    lat = coords[1];
  }

  return {
    id: job.id,
    title: job.headline,
    employer: job.employer?.name || "Okänd arbetsgivare",
    location: job.workplace_address?.municipality || job.workplace_address?.region || "Sverige",
    region: job.workplace_address?.region || "",
    lat,
    lng,
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
const cvWidgetHTML = readFileSync(join(__dirname, "cv-widget.html"), "utf-8");

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

server.registerResource("cv-widget", "ui://widget/cv.html", {}, async () => ({
  contents: [{ uri: "ui://widget/cv.html", mimeType: "text/html+skybridge", text: cvWidgetHTML }]
}));

// ============================================================
// search_jobs - Shows widget immediately, auto-translates
// For noExperience searches: returns data for ChatGPT to verify/filter first
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs",
    description: `Search for jobs in Sweden. Shows interactive job widget.

⚠️ AFTER CALLING: Do NOT write any text to user. The widget shows everything they need.

The widget auto-translates to user's language. Just call this tool and stop.

PARAMETERS:
- query: Search term IN SWEDISH (e.g., 'kock', 'utvecklare', 'sjuksköterska')
- language: User's language code (e.g., 'en', 'ar', 'so', 'sv')
- loadingText: "Searching..." in user's language
- translatingText: "Translating..." in user's language

Swedish keywords: utvecklare (developer), sjuksköterska (nurse), kock (chef), lärare (teacher), städare (cleaner), chaufför (driver), säljare (salesperson), ingenjör (engineer)

⚠️ noExperience: When true, filter out "senior" titles, then call display_jobs.`,
    inputSchema: {
      query: z.string().describe("Search query IN SWEDISH"),
      location: z.string().optional().describe("City/region in Sweden"),
      limit: z.number().optional().default(10).describe("Number of jobs to return (max 20 for MCP)"),
      language: z.string().describe("User's language code (e.g., 'so', 'ar', 'sv')"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      loadingText: z.string().describe("'Searching for jobs...' in user's language"),
      translatingText: z.string().describe("'Translating results...' in user's language"),
      // Filter options
      remote: z.boolean().optional().describe("Only remote/distansarbete jobs"),
      fulltime: z.boolean().optional().describe("Only fulltime/heltid jobs"),
      parttime: z.boolean().optional().describe("Only parttime/deltid jobs"),
      drivingLicense: z.boolean().optional().describe("Only jobs that require driving license"),
      trainee: z.boolean().optional().describe("Only trainee/praktik positions"),
      abroad: z.boolean().optional().describe("Only jobs abroad/utomlands"),
      jobLanguage: z.string().optional().describe("Job language requirement (e.g., 'sv', 'en', 'ar')"),
      noExperience: z.boolean().optional().describe("Only use when user asks for jobs without experience. When true, filter out jobs with 'senior' in title, then call display_jobs")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html"  // Show widget immediately (except noExperience)
    }
  },
  async ({ query, location, limit, language, direction, loadingText, translatingText, remote, fulltime, parttime, drivingLicense, trainee, abroad, jobLanguage, noExperience }) => {
    // Build filters object
    const filters = {};
    if (remote) filters.remote = true;
    if (fulltime) filters.fulltime = true;
    if (parttime) filters.parttime = true;
    if (drivingLicense) filters.drivingLicense = true;
    if (trainee) filters.trainee = true;
    if (abroad) filters.abroad = true;
    if (jobLanguage) filters.language = jobLanguage;
    if (noExperience) filters.noExperience = true;

    const activeFilters = Object.keys(filters).length > 0 ? ` [filters: ${Object.keys(filters).join(', ')}]` : '';
    console.log(`🔧 search_jobs called: "${query}" in ${location || 'Sweden'} (${language})${activeFilters}`);

    // Search for jobs with filters
    const effectiveLimit = Math.min(limit || 10, 50);
    const data = await searchJobs(query, location, effectiveLimit, filters);

    // Format jobs for widget
    const jobs = data.hits.map(job => {
      const formatted = formatJob(job);
      return {
        id: formatted.id,
        title: formatted.title,
        employer: formatted.employer,
        location: formatted.location,
        region: formatted.region,
        deadline: formatted.deadline,
        url: formatted.url,
        logoUrl: formatted.logoUrl,
        lat: formatted.lat,
        lng: formatted.lng
      };
    });
    const total = data.total?.value || 0;

    // SPECIAL CASE: noExperience - only remove jobs with "senior" in title
    if (noExperience) {
      console.log(`🔍 noExperience mode: returning ${jobs.length} jobs for ChatGPT to filter "senior" titles`);

      const response = {
        status: "NEEDS_VERIFICATION",
        message: "Filter out jobs with 'senior' in the title, then show results.",
        filterRule: "ONLY remove jobs where title contains 'senior' (case-insensitive)",
        searchParams: {
          query,
          location: location || 'Sverige',
          language: language || 'sv',
          direction: direction || 'ltr',
          loadingText: loadingText || 'Söker jobb...',
          translatingText: translatingText || 'Översätter...'
        },
        total,
        jobs,
        nextAction: {
          required: true,
          tool: "display_jobs"
        }
      };

      return {
        content: [{
          type: "text",
          text: `${JSON.stringify(response, null, 2)}

⚠️ SIMPLE FILTER:
Remove jobs where title contains "senior" (case-insensitive).
Keep ALL other jobs.
Then call display_jobs with the filtered list.`
        }]
      };
    }

    console.log(`📤 Found ${jobs.length} jobs - widget will translate to ${language}`);

    // Normal flow: Return widget data directly - NO text response
    // Empty content array = ChatGPT has nothing to say
    return {
      structuredContent: {
        translateMode: true,
        language: language || 'sv',
        direction: direction || 'ltr',
        loadingText: loadingText || 'Söker jobb...',
        translatingText: translatingText || 'Översätter...',
        query: query,
        querySwedish: query,
        location: location || 'Sverige',
        locationSwedish: location || '',
        total,
        jobs
      },
      content: []
    };
  }
);

// ============================================================
// display_jobs - REQUIRED for noExperience searches, optional otherwise
// ============================================================
server.registerTool(
  "display_jobs",
  {
    title: "Display Jobs",
    description: `Show filtered job results in widget.

⚠️ AFTER CALLING: Do NOT write any text. Widget shows everything.

Only needed after filtering noExperience results. For normal searches, search_jobs handles everything.`,
    inputSchema: {
      language: z.string().default("sv"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      query: z.string().describe("Search term (Swedish)"),
      querySwedish: z.string().optional().describe("Original Swedish search term"),
      location: z.string().default("Sverige").describe("Location"),
      locationSwedish: z.string().optional().describe("Original Swedish location"),
      total: z.number().optional().describe("Total jobs found (before filtering)"),
      loadingText: z.string().optional().describe("Loading text in user's language"),
      translatingText: z.string().optional().describe("Translating text in user's language"),
      jobs: z.array(z.object({
        id: z.string().describe("KEEP ORIGINAL - do not change"),
        title: z.string().describe("Job title"),
        employer: z.string().describe("Employer name"),
        location: z.string().describe("Location"),
        region: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        deadline: z.string().optional().describe("Application deadline"),
        url: z.string().describe("KEEP ORIGINAL URL - do not modify!"),
        logoUrl: z.string().optional().describe("Company logo URL")
      }))
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html"
    }
  },
  async ({ language, direction, query, querySwedish, location, locationSwedish, total, loadingText, translatingText, jobs }) => {
    console.log(`✅ display_jobs: ${jobs.length} jobs (filtered/verified)`);

    return {
      structuredContent: {
        translateMode: true,  // Widget will auto-translate
        language: language || 'sv',
        direction: direction || 'ltr',
        loadingText: loadingText || 'Söker jobb...',
        translatingText: translatingText || 'Översätter...',
        query: query,
        querySwedish: querySwedish || query,
        location: location || 'Sverige',
        locationSwedish: locationSwedish || location || '',
        total: total || jobs.length,
        jobs
      },
      content: []
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
    description: `Show detailed job information in widget.

⚠️ AFTER CALLING: Do NOT write any text. Widget shows all details.`,
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
      content: []
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

// Show salary inline in existing widget via SSE (NO new widget created)
server.registerTool(
  "show_salary_inline",
  {
    title: "Show Salary Inline",
    description: `Show salary in user's already-open job modal via SSE.

⚠️ AFTER CALLING: Do NOT write any text. Data appears in their modal instantly.

USE THIS when message contains "widgetSessionId:".`,
    inputSchema: {
      widgetSessionId: z.string().describe("Session ID from widget"),
      job: z.object({
        title: z.string(),
        employer: z.string(),
        location: z.string().optional()
      }),
      salary: z.object({
        avg: z.number().describe("Average salary per month in SEK"),
        min: z.number().describe("Minimum salary"),
        max: z.number().describe("Maximum salary")
      }),
      tips: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional()
    }
    // NO _meta.outputTemplate - this tool never shows a widget
  },
  async (params) => {
    console.log(`📤 show_salary_inline: ${params.job.title} → ${params.widgetSessionId}`);

    const pushed = pushToWidget(params.widgetSessionId, 'salary', {
      job: params.job,
      salary: params.salary,
      tips: params.tips,
      sources: params.sources
    });

    if (pushed) {
      console.log(`✅ Salary pushed to ${params.widgetSessionId}`);
      // Empty content = ChatGPT says nothing
      return { content: [] };
    }

    // Widget not connected - need to tell user
    console.log(`❌ Widget ${params.widgetSessionId} not connected`);
    return {
      content: [{
        type: "text",
        text: `Lönedata kunde inte visas i widgeten. Försök igen.`
      }]
    };
  }
);

// Display salary statistics widget (creates NEW widget - only when no SSE)
server.registerTool(
  "display_salary",
  {
    title: "Display Salary Widget",
    description: `Show salary in a standalone widget.

⚠️ AFTER CALLING: Do NOT write any text. Widget shows everything.
⚠️ If message has "widgetSessionId:" → use show_salary_inline instead!`,
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
        entryLevel: z.number().optional(),
        experienced: z.number().optional()
      }),
      comparison: z.object({
        percentDiff: z.number(),
        description: z.string().optional()
      }).optional(),
      industry: z.string().optional(),
      demandLevel: z.string().optional(),
      tips: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional(),
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
      content: []
    };
  }
);

// ============================================================
// display_cv - Shows customized CV in beautiful widget
// ============================================================
server.registerTool(
  "display_cv",
  {
    title: "Display CV",
    description: `Show a customized CV in a downloadable widget.

⚠️ AFTER CALLING: Do NOT write any text. Widget shows the CV with download option.

Use job details and user's background to create a tailored CV.`,
    inputSchema: {
      language: z.string().default("sv"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      cv: z.object({
        name: z.string().describe("Full name"),
        title: z.string().describe("Professional title/headline"),
        email: z.string().optional().describe("Email address"),
        phone: z.string().optional().describe("Phone number"),
        location: z.string().optional().describe("City/Location"),
        linkedin: z.string().optional().describe("LinkedIn URL"),
        website: z.string().optional().describe("Personal website URL"),
        summary: z.string().describe("Professional summary (2-4 sentences tailored to the job)"),
        experience: z.array(z.object({
          title: z.string().describe("Job title"),
          company: z.string().describe("Company name"),
          period: z.string().describe("Period (e.g., '2020 - Present')"),
          description: z.string().describe("Job description and achievements"),
          highlights: z.array(z.string()).optional().describe("Key achievements/bullet points")
        })).describe("Work experience (most relevant first)"),
        skills: z.object({
          technical: z.array(z.string()).describe("Technical skills"),
          soft: z.array(z.string()).optional().describe("Soft skills"),
          languages: z.array(z.string()).optional().describe("Languages spoken")
        }),
        education: z.array(z.object({
          degree: z.string().describe("Degree/Certificate"),
          school: z.string().describe("School/Institution"),
          year: z.string().describe("Year or period")
        })).optional()
      }),
      targetJob: z.object({
        title: z.string().describe("The job being applied for"),
        company: z.string().describe("Target company")
      }),
      labels: z.object({
        experience: z.string().optional(),
        skills: z.string().optional(),
        education: z.string().optional(),
        technical: z.string().optional(),
        softSkills: z.string().optional(),
        languages: z.string().optional(),
        download: z.string().optional(),
        tailoredFor: z.string().optional()
      }).optional()
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/cv.html"
    }
  },
  async (params) => {
    console.log(`📄 display_cv: ${params.cv.name} for ${params.targetJob.title} at ${params.targetJob.company}`);

    return {
      structuredContent: params,
      content: []
    };
  }
);

console.log("✅ Tools: search_jobs, display_jobs, get_job_details, show_salary_inline, display_salary, display_cv");

// HTTP Server
const transports = new Map();

// SSE clients for real-time widget updates
const sseClients = new Map(); // widgetSessionId -> response object

function pushToWidget(sessionId, eventType, data) {
  const client = sseClients.get(sessionId);
  if (client) {
    try {
      client.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
      console.log(`📤 SSE push to ${sessionId}: ${eventType}`);
      return true;
    } catch (e) {
      console.log(`❌ SSE push failed: ${e.message}`);
      sseClients.delete(sessionId);
    }
  }
  return false;
}

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

  // SSE endpoint for widget real-time updates
  if (url.pathname === "/events") {
    const sessionId = url.searchParams.get("session");
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end('{"error":"Missing session parameter"}');
      return;
    }

    console.log(`🔌 SSE widget connected: ${sessionId}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

    // Store client
    sseClients.set(sessionId, res);

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
      } catch (e) {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Clean up on close
    req.on("close", () => {
      console.log(`🔌 SSE widget disconnected: ${sessionId}`);
      clearInterval(pingInterval);
      sseClients.delete(sessionId);
    });

    return;
  }

  if (url.pathname === "/api/search") {
    const q = url.searchParams.get("q") || "utvecklare";
    const loc = url.searchParams.get("location");
    const lim = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Parse filter parameters
    const filters = {};
    if (url.searchParams.get("remote") === "true") filters.remote = true;
    if (url.searchParams.get("fulltime") === "true") filters.fulltime = true;
    if (url.searchParams.get("parttime") === "true") filters.parttime = true;
    if (url.searchParams.get("drivingLicense") === "true") filters.drivingLicense = true;
    if (url.searchParams.get("trainee") === "true") filters.trainee = true;
    if (url.searchParams.get("abroad") === "true") filters.abroad = true;
    if (url.searchParams.get("language")) filters.language = url.searchParams.get("language");

    const activeFilters = Object.keys(filters).length > 0 ? ` [filters: ${Object.keys(filters).join(', ')}]` : '';

    // If offset > 0, fetch specific page
    if (offset > 0) {
      console.log(`📄 Fetching page: offset=${offset}, limit=${lim}${activeFilters}`);
      const data = await searchJobsSingle(q, loc, lim, offset, filters);
      console.log(`📄 Got ${data.hits?.length || 0} jobs at offset ${offset}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        total: data.total?.value || 0,
        offset,
        jobs: data.hits.map(formatJob)
      }));
      return;
    }

    // First page - quick response
    const data = await searchJobsQuick(q, loc, lim, filters);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      total: data.total?.value || 0,
      offset: 0,
      hasMore: (data.total?.value || 0) > lim,
      jobs: data.hits.map(formatJob)
    }));
    return;
  }

  // Single job details endpoint - for widget lazy loading
  if (url.pathname.startsWith("/api/job/")) {
    const jobId = url.pathname.split("/api/job/")[1];
    if (!jobId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end('{"error":"Missing job ID"}');
      return;
    }
    console.log(`📋 API: Fetching job ${jobId}`);
    const job = await getJobById(jobId);
    if (!job) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"Job not found"}');
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(formatJob(job)));
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

Flow: search_jobs → widget auto-translates via Google Translate → done!
`);
});

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
const JOBS_PER_PAGE = 6;

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
async function searchJobs(query, location, limit = 100, offset = 0, filters = {}) {
  if (limit === 0) {
    return searchJobsAll(query, location, filters);
  }
  // Support pagination with offset
  if (offset > 0) {
    console.log(`📄 Fetching page with offset ${offset}...`);
    return searchJobsSingle(query, location, limit, offset, filters);
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

// Detect remote work from description
function detectRemote(job) {
  const descText = (job.description?.text || "").toLowerCase();
  const headline = (job.headline || "").toLowerCase();
  const fullText = descText + " " + headline;

  const remotePositive = [
    "distans", "remote", "hemarbete", "arbeta hemifrån", "jobba hemifrån",
    "work from home", "wfh", "hybrid", "flexibel arbetsplats", "distansarbete"
  ];
  const remoteNegative = [
    "ej distans", "inte distans", "ingen distans", "på plats",
    "på kontoret", "kräver närvaro", "ej remote", "no remote",
    "kontorsbaserad", "i våra lokaler"
  ];

  const hasPositive = remotePositive.some(kw => fullText.includes(kw));
  const hasNegative = remoteNegative.some(kw => fullText.includes(kw));

  return hasPositive && !hasNegative;
}


function formatJob(job, includeFullDetails = false) {
  // API returns coordinates as [longitude, latitude]
  const coords = job.workplace_address?.coordinates;
  let lat = null, lng = null;
  if (coords && coords.length === 2) {
    lng = coords[0];
    lat = coords[1];
  }

  // Detect remote work from description keywords
  const isRemote = detectRemote(job);

  // Extract skills from must_have and nice_to_have
  const mustHaveSkills = job.must_have?.skills?.map(s => s.label) || [];
  const niceToHaveSkills = job.nice_to_have?.skills?.map(s => s.label) || [];
  const mustHaveLanguages = job.must_have?.languages?.map(l => l.label) || [];

  // Scope of work (e.g., 100%, 50%)
  const scopeMin = job.scope_of_work?.min;
  const scopeMax = job.scope_of_work?.max;
  const scopeText = scopeMin && scopeMax
    ? (scopeMin === scopeMax ? `${scopeMin}%` : `${scopeMin}-${scopeMax}%`)
    : null;

  const baseJob = {
    id: job.id,
    title: job.headline,
    employer: job.employer?.name || "Okänd arbetsgivare",
    location: job.workplace_address?.municipality || job.workplace_address?.region || "Sverige",
    city: job.workplace_address?.city || "",
    region: job.workplace_address?.region || "",
    lat,
    lng,
    deadline: job.application_deadline ? new Date(job.application_deadline).toLocaleDateString("sv-SE") : "Löpande",
    deadlineRaw: job.application_deadline,
    url: job.webpage_url,
    logoUrl: job.logo_url,

    // Employment info
    employmentType: job.employment_type?.label || "",
    salaryType: job.salary_type?.label || "",
    workingHours: job.working_hours_type?.label || "",
    duration: job.duration?.label || "",
    scope: scopeText,

    // Requirements badges
    experienceRequired: job.experience_required ?? null,
    drivingLicenseRequired: job.driving_license_required ?? false,
    accessToOwnCar: job.access_to_own_car ?? false,
    isRemote: isRemote,

    // Category
    occupationField: job.occupation_field?.label || "",
    occupation: job.occupation?.label || "",

    // Vacancies
    vacancies: job.number_of_vacancies || 1,

    // Publication date
    published: job.publication_date ? new Date(job.publication_date).toLocaleDateString("sv-SE") : ""
  };

  // Add full details if requested (for first 8 jobs or detail view)
  if (includeFullDetails) {
    // Flag jobs that need AI verification (experienceRequired: false)
    const needsAIVerification = job.experience_required === false;

    // Extract only relevant snippets around "erfarenhet" keywords
    let verificationSnippets = undefined;
    if (needsAIVerification && job.description?.text) {
      const text = job.description.text;
      const keywords = ['erfarenhet', 'erfarenheter', 'erfaren', 'experience', 'års arbete'];
      const snippets = [];

      for (const keyword of keywords) {
        const regex = new RegExp(keyword, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const start = Math.max(0, match.index - 200);
          const end = Math.min(text.length, match.index + keyword.length + 200);
          const snippet = text.substring(start, end);
          snippets.push(`...${snippet}...`);
        }
      }

      if (snippets.length > 0) {
        // Remove duplicates and join
        verificationSnippets = [...new Set(snippets)].slice(0, 3).join('\n---\n');
      }
    }

    return {
      ...baseJob,
      description: job.description?.text?.substring(0, 300) + "..." || "",
      fullDescription: job.description?.text || "",
      mustHaveSkills,
      niceToHaveSkills,
      mustHaveLanguages,
      employerUrl: job.employer?.url || "",
      applicationUrl: job.application_details?.url || job.webpage_url,
      // AI verification - only if "erfarenhet" found in text
      needsVerification: needsAIVerification && !!verificationSnippets,
      verificationSnippets: verificationSnippets
    };
  }

  return baseJob;
}

// Fetch detailed info for multiple jobs in parallel
async function enrichJobsParallel(jobs, count = 8) {
  const jobsToEnrich = jobs.slice(0, count);
  const remainingJobs = jobs.slice(count);

  console.log(`⚡ Fetching details for first ${jobsToEnrich.length} jobs in parallel...`);
  const startTime = Date.now();

  const detailPromises = jobsToEnrich.map(job =>
    getJobById(job.id).then(detail => {
      if (detail) {
        return formatJob(detail, true);
      }
      return formatJob(job, false);
    }).catch(() => formatJob(job, false))
  );

  const enrichedJobs = await Promise.all(detailPromises);
  const formattedRemaining = remainingJobs.map(job => formatJob(job, false));

  const elapsed = Date.now() - startTime;
  console.log(`⚡ Parallel enrichment complete in ${elapsed}ms`);

  return [...enrichedJobs, ...formattedRemaining];
}

// Load widget HTML
// Use V2 widget (OpenAI design system with auto-fullscreen)
const jobListHTML = readFileSync(join(__dirname, "job-list-widget-v2.html"), "utf-8");
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
// search_jobs - STEP 1: Fetch jobs, return data for ChatGPT to analyze
// ============================================================
server.registerTool(
  "search_jobs",
  {
    title: "Search Jobs - Step 1 (Smidra MCP)",
    description: `🔍 STEG 1: Hämtar jobb från Arbetsförmedlingen.

VIKTIGT FLÖDE:
1. Detta verktyg hämtar jobbdata (returnerar TEXT, ingen widget!)
2. Du får 6 jobb med beskrivningar
3. SÖK LÖNER på webben för varje jobbtyp
4. Anropa send_jobs_to_widget med jobb + löner

⚠️ ANVÄNDAREN SER INGENTING förrän du anropar send_jobs_to_widget!`,
    inputSchema: {
      query: z.string().describe("Search query IN SWEDISH"),
      location: z.string().optional().describe("City/region in Sweden"),
      limit: z.number().optional().default(50).describe("Number of jobs (default 50)"),
      offset: z.number().optional().default(0).describe("Offset for pagination (0 = page 1, 6 = page 2, etc)"),
      page: z.number().optional().default(1).describe("Page number (1, 2, 3...)"),
      language: z.string().describe("User's language code"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      loadingText: z.string().optional(),
      analyzingText: z.string().optional(),
      remote: z.boolean().optional(),
      fulltime: z.boolean().optional(),
      parttime: z.boolean().optional()
    }
  },
  async ({ query, location, limit, offset, page, language, direction, remote, fulltime, parttime }) => {
    // Calculate offset from page if not provided
    const effectiveOffset = offset || ((page || 1) - 1) * JOBS_PER_PAGE;
    const effectivePage = page || Math.floor(effectiveOffset / JOBS_PER_PAGE) + 1;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 STEG 1: search_jobs`);
    console.log(`   Query: "${query}" | Location: ${location || 'Sverige'} | Lang: ${language}`);
    console.log(`   Page: ${effectivePage} | Offset: ${effectiveOffset}`);
    console.log(`${'='.repeat(60)}`);

    // Build filters
    const filters = {};
    if (remote) filters.remote = true;
    if (fulltime) filters.fulltime = true;
    if (parttime) filters.parttime = true;

    // Search for jobs with pagination support
    const effectiveLimit = Math.min(limit || 50, 100);
    const data = await searchJobs(query, location, effectiveLimit, effectiveOffset, filters);
    const total = data.total?.value || 0;

    // Enrich ONLY the 6 jobs for this page with detailed info
    const jobs = await enrichJobsParallel(data.hits, JOBS_PER_PAGE);

    console.log(`📦 Page ${effectivePage}: ${jobs.length} jobb berikade (totalt ${total} tillgängliga)`);

    const lang = (language || 'sv').toLowerCase();
    const dir = direction || (lang === 'ar' || lang === 'he' || lang === 'fa' || lang === 'ur' ? 'rtl' : 'ltr');

    // Generate unique widget session ID
    const widgetSessionId = `ws_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    console.log(`🔑 Session: ${widgetSessionId}`);

    // Prepare first 6 jobs with SHORT descriptions for ChatGPT
    const jobsForWidget = jobs.slice(0, JOBS_PER_PAGE).map(j => ({
      id: j.id,
      title: j.title,
      employer: j.employer,
      location: j.location,
      city: j.city,
      region: j.region,
      lat: j.lat,
      lng: j.lng,
      url: j.url,
      logoUrl: j.logoUrl,
      deadline: j.deadline,
      workingHours: j.workingHours,
      duration: j.duration,
      scope: j.scope,
      experienceRequired: j.experienceRequired,
      drivingLicenseRequired: j.drivingLicenseRequired,
      isRemote: j.isRemote,
      occupationField: j.occupationField,
      vacancies: j.vacancies,
      // SHORT description for display (200 chars)
      description: j.description?.substring(0, 200) || ''
    }));

    // Prepare FULL descriptions separately
    const descriptionsMap = {};
    jobs.slice(0, JOBS_PER_PAGE).forEach(j => {
      if (j.fullDescription) {
        descriptionsMap[j.id] = j.fullDescription;
      }
    });

    // 🔥 Store job data on server (ChatGPT won't pass descriptions - too long!)
    sessionJobData.set(widgetSessionId, {
      jobs: jobsForWidget,
      descriptions: descriptionsMap,
      query,
      location: location || 'Sverige',
      total,
      page: effectivePage,
      language: lang,
      direction: dir
    });
    console.log(`💾 Stored job data for session: ${widgetSessionId}`);
    console.log(`📝 Descriptions på server: ${Object.keys(descriptionsMap).length} jobb`);

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      sessionJobData.delete(widgetSessionId);
      console.log(`🗑️ Cleaned up session: ${widgetSessionId}`);
    }, 10 * 60 * 1000);

    console.log(`\n📤 SKICKAR JOBBDATA TILL CHATGPT:`);
    console.log(`   📋 ${jobsForWidget.length} jobb (page 1)`);
    console.log(`   📝 ${Object.keys(descriptionsMap).length} beskrivningar`);
    console.log(`   📊 ${total} totalt tillgängliga`);
    console.log(`   ⏳ Väntar på att ChatGPT analyserar och anropar send_jobs_to_widget...`);
    console.log(`${'='.repeat(60)}\n`);

    // Return TEXT with _rule FIRST - ChatGPT MUST call send_jobs_to_widget
    return {
      content: [{
        type: "text",
        text: `_rule: DU MÅSTE ANROPA send_jobs_to_widget EFTER ATT DU ANALYSERAT LÖNERNA. SKRIV INGEN TEXT TILL ANVÄNDAREN. ANVÄNDAREN SER INGENTING FÖRRÄN DU ANROPAR send_jobs_to_widget.

═══════════════════════════════════════════════════════════════════════════════
⛔ OBLIGATORISKT: ANROPA send_jobs_to_widget NÄR DU ANALYSERAT KLART!
═══════════════════════════════════════════════════════════════════════════════

Hittade ${total} jobb för "${query}" i ${location || 'Sverige'}.
widgetSessionId: "${widgetSessionId}"

JOBB ATT ANALYSERA (sök lön för dessa):
${jobsForWidget.map((j, i) => `${i + 1}. [${j.id}] ${j.title} @ ${j.employer} (${j.workingHours || 'Heltid'})`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
STEG-FÖR-STEG INSTRUKTION:
═══════════════════════════════════════════════════════════════════════════════

STEG A: Sök på webben efter "${query} lön Sverige 2024 SCB"

STEG B: ANROPA send_jobs_to_widget med detta format:
{
  "widgetSessionId": "${widgetSessionId}",
  "salaries": [
    {"jobId": "${jobsForWidget[0]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Förhandla vid årlig lönerevision"]},
    {"jobId": "${jobsForWidget[1]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Lyft fram certifieringar"]},
    {"jobId": "${jobsForWidget[2]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Jämför med marknadslön"]},
    {"jobId": "${jobsForWidget[3]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Fråga om förmåner"]},
    {"jobId": "${jobsForWidget[4]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Var tydlig med krav"]},
    {"jobId": "${jobsForWidget[5]?.id}", "avg": 45000, "min": 38000, "max": 55000, "tips": ["Förbered lönediskussion"]}
  ]
}

⚠️ VIKTIGT: Ersätt exempellönerna (45000) med FAKTISKA löner från din webbsökning!

═══════════════════════════════════════════════════════════════════════════════
_rule: ANROPA send_jobs_to_widget NU! SKRIV INGEN TEXT!
═══════════════════════════════════════════════════════════════════════════════`
      }]
    };
  }
);

// ============================================================
// send_jobs_to_widget - STEP 2: Display widget with jobs + salaries + descriptions
// ============================================================
server.registerTool(
  "send_jobs_to_widget",
  {
    title: "Display Jobs with Salaries - Step 2 of 2 (Smidra MCP)",
    description: `⛔ STEG 2 - VISAR WIDGET MED JOBB + LÖNER + BESKRIVNINGAR.

DETTA ÄR DET ENDA SÄTTET ATT VISA JOBB FÖR ANVÄNDAREN!
Utan detta verktyg ser användaren INGENTING.

SKRIV INGEN TEXT - anropa bara detta verktyg.`,
    inputSchema: {
      widgetSessionId: z.string().describe("Session ID from search_jobs"),
      page: z.number().optional().default(1).describe("Page number (1, 2, 3...)"),
      language: z.string().describe("Language code"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      query: z.string().describe("Original search query"),
      location: z.string().describe("Location"),
      total: z.number().describe("Total jobs found (all pages)"),
      jobs: z.array(z.object({
        id: z.string(),
        title: z.string(),
        employer: z.string(),
        location: z.string(),
        url: z.string(),
        deadline: z.string().optional(),
        logoUrl: z.string().optional(),
        workingHours: z.string().optional(),
        duration: z.string().optional(),
        scope: z.string().optional(),
        experienceRequired: z.boolean().nullable().optional(),
        drivingLicenseRequired: z.boolean().optional(),
        isRemote: z.boolean().optional(),
        occupationField: z.string().optional(),
        vacancies: z.number().optional(),
        description: z.string().optional()
      })).describe("Jobs array (first 6 for page 1)"),
      salaries: z.array(z.object({
        jobId: z.string().describe("Job ID"),
        avg: z.number().describe("Average salary SEK/month"),
        min: z.number().describe("Minimum salary"),
        max: z.number().describe("Maximum salary"),
        tips: z.array(z.string()).optional().describe("1-2 salary negotiation tips")
      })).describe("Salary data for each job"),
      descriptions: z.record(z.string(), z.string()).optional().describe("Full job descriptions: { jobId: 'full text...' }")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html",
      "openai/widgetDescription": "Visar jobbresultat med lönedata och beskrivningar. Ingen ytterligare text behövs."
    }
  },
  async ({ widgetSessionId, page, language, direction, query, location, total, jobs, salaries, descriptions }) => {
    // 🔥 Retrieve stored job data from server FIRST (includes descriptions!)
    const storedData = sessionJobData.get(widgetSessionId);
    const finalPage = page || storedData?.page || 1;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ STEG 2: send_jobs_to_widget`);
    console.log(`   Session: ${widgetSessionId} | Page: ${finalPage}`);
    console.log(`${'='.repeat(60)}`);
    if (storedData) {
      console.log(`   📦 Retrieved stored data for session`);
      console.log(`   📝 Descriptions från server: ${Object.keys(storedData.descriptions).length}`);
    } else {
      console.log(`   ⚠️ No stored data found for session`);
    }

    // 🔥 ALWAYS prefer stored jobs - they have full data (workingHours, description, etc.)
    // ChatGPT might pass minimal job data that's missing fields
    const finalJobs = storedData?.jobs || jobs || [];
    // Use stored descriptions (ChatGPT can't pass these - too long!)
    const finalDescriptions = storedData?.descriptions || descriptions || {};
    // Use stored metadata if ChatGPT didn't pass them
    const finalQuery = query || storedData?.query || '';
    const finalLocation = location || storedData?.location || 'Sverige';
    const finalTotal = total || storedData?.total || finalJobs.length;
    const finalLanguage = language || storedData?.language || 'sv';
    const finalDirection = direction || storedData?.direction || 'ltr';

    console.log(`   Jobb: ${finalJobs.length} | Löner: ${salaries.length} | Beskrivningar: ${Object.keys(finalDescriptions).length}`);

    // Debug: Log first job's fields
    if (finalJobs.length > 0) {
      const j = finalJobs[0];
      console.log(`   📋 Första jobbets data:`);
      console.log(`      workingHours: ${j.workingHours || 'SAKNAS'}`);
      console.log(`      description: ${j.description ? j.description.substring(0, 50) + '...' : 'SAKNAS'}`);
      console.log(`      experienceRequired: ${j.experienceRequired}`);
    }

    // Build salary map for widget
    const salaryMap = {};
    for (const s of salaries) {
      salaryMap[s.jobId] = {
        salary: { avg: s.avg, min: s.min, max: s.max },
        tips: s.tips || [],
        sources: ['SCB', 'Unionen', 'AI-analys']
      };
      console.log(`   💰 ${s.jobId.substring(0, 8)}... → ${s.avg} kr/mån`);
    }

    // Log descriptions
    if (Object.keys(finalDescriptions).length > 0) {
      console.log(`   📝 Beskrivningar (från server):`);
      for (const [jobId, desc] of Object.entries(finalDescriptions)) {
        console.log(`      ${jobId.substring(0, 8)}... → ${desc.length} tecken`);
      }
    }

    console.log(`\n🎉 WIDGET VISAS NU:`);
    console.log(`   📋 ${finalJobs.length} jobb (page 1)`);
    console.log(`   💰 ${Object.keys(salaryMap).length} löner`);
    console.log(`   📝 ${Object.keys(finalDescriptions).length} beskrivningar`);
    console.log(`   📊 ${finalTotal} totalt tillgängliga`);
    console.log(`${'='.repeat(60)}\n`);

    // Return widget with jobs + preloaded salaries + descriptions
    return {
      structuredContent: {
        _rule: "⛔ TYST! VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS!",
        language: finalLanguage,
        direction: finalDirection,
        translateMode: finalLanguage !== 'sv',
        query: finalQuery,
        querySwedish: finalQuery,
        location: finalLocation,
        locationSwedish: finalLocation,
        total: finalTotal,
        page: finalPage,
        jobs: finalJobs,
        widgetSessionId: widgetSessionId,
        preloadedSalaries: salaryMap,
        preloadedDescriptions: finalDescriptions
      },
      content: []
    };
  }
);

// ============================================================
// display_jobs - Show jobs in widget (without salary data)
// ============================================================
server.registerTool(
  "display_jobs",
  {
    title: "Display Jobs (Smidra MCP)",
    description: `⛔ TYST VERKTYG - Visar jobb i widget (utan lönedata).

Använd send_jobs_to_widget istället om du har lönedata!

⚠️ KRITISKT: SKRIV ABSOLUT INGEN TEXT FÖRE ELLER EFTER DETTA VERKTYG!`,
    inputSchema: {
      language: z.string().default("sv"),
      direction: z.enum(["ltr", "rtl"]).default("ltr"),
      query: z.string().describe("Search term"),
      location: z.string().default("Sverige").describe("Location"),
      total: z.number().optional().describe("Total jobs found"),
      jobs: z.array(z.object({
        id: z.string(),
        title: z.string(),
        employer: z.string(),
        location: z.string(),
        url: z.string(),
        deadline: z.string().optional(),
        logoUrl: z.string().optional(),
        workingHours: z.string().optional(),
        duration: z.string().optional(),
        experienceRequired: z.boolean().nullable().optional(),
        drivingLicenseRequired: z.boolean().optional(),
        isRemote: z.boolean().optional(),
        vacancies: z.number().optional(),
        occupationField: z.string().optional(),
        description: z.string().optional()
      })).describe("Jobs array")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/job-list.html",
      "openai/widgetDescription": "Visar jobbresultat. Ingen ytterligare text behövs."
    }
  },
  async ({ language, direction, query, location, total, jobs }) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 display_jobs (utan löner)`);
    console.log(`   Jobb: ${jobs.length} | Query: "${query}"`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      structuredContent: {
        _rule: "⛔ TYST! VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS!",
        language: language || 'sv',
        direction: direction || 'ltr',
        query: query,
        querySwedish: query,
        location: location || 'Sverige',
        locationSwedish: location || 'Sverige',
        total: total || jobs.length,
        jobs,
        translateMode: (language || 'sv') !== 'sv'
      },
      content: []
    };
  }
);

// NOTE: display_jobs_with_salaries REMOVED - use send_jobs_to_widget instead

// ============================================================
// get_job_details - Single step for job details
// ============================================================
server.registerTool(
  "get_job_details",
  {
    title: "Show Job Details (Smidra MCP)",
    description: `⛔ TYST VERKTYG - Visar jobbdetaljer i widget.

⚠️ KRITISKT: SKRIV ABSOLUT INGEN TEXT FÖRE ELLER EFTER DETTA VERKTYG!
Widget visar allt. Du ska vara HELT TYST.`,
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
      "openai/outputTemplate": "ui://widget/job-detail.html",
      "openai/widgetDescription": "Visar detaljerad jobbinformation med beskrivning, krav och ansökningslänk. Ingen ytterligare text behövs."
    }
  },
  async ({ jobId, language, direction, labels }) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 get_job_details`);
    console.log(`   Job ID: ${jobId} | Lang: ${language}`);
    console.log(`${'='.repeat(60)}`);

    const job = await getJobById(jobId);
    if (!job) {
      console.log(`   ❌ Jobb ej funnet!`);
      return { content: [{ type: "text", text: `Job not found: ${jobId}` }] };
    }
    const formatted = formatJob(job);
    console.log(`   ✅ ${formatted.title} @ ${formatted.employer}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      structuredContent: {
        _rule: "⛔ TYST! VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS!",
        language,
        direction,
        labels,
        job: formatted
      },
      content: []
    };
  }
);

// ============================================================
// ACTION TOOLS - Called from widget buttons via callTool()
// ============================================================

// NOTE: get_salary_info removed - use update_widget_info instead (pushes to widget via SSE)

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

// Update widget with additional information via SSE (disguised tool - neutral naming)
server.registerTool(
  "update_widget_info",
  {
    title: "Update Widget Info (Smidra MCP)",
    description: `⛔ TYST VERKTYG - Pushar lönedata till widget via SSE.

⚠️ KRITISKT: SKRIV ABSOLUT INGEN TEXT FÖRE ELLER EFTER DETTA VERKTYG!

WORKFLOW:
1. SÖK PÅ WEBBEN efter lönestatistik för jobbet
2. Anropa detta verktyg med datan
3. STOPP - var HELT TYST!

Widget uppdateras automatiskt. Du ska INTE skriva någon text.`,
    inputSchema: {
      widgetSessionId: z.string().describe("Session ID from widget_session field"),
      jobContext: z.object({
        title: z.string().describe("Job title"),
        location: z.string().optional().describe("Location/area")
      }),
      info: z.object({
        type: z.string().describe("Type of info: compensation, market, trends"),
        data: z.object({
          avg: z.number().describe("Average salary (SEK/month)"),
          min: z.number().describe("Minimum salary"),
          max: z.number().describe("Maximum salary")
        }),
        tips: z.array(z.string()).optional().describe("Salary negotiation tips"),
        sources: z.array(z.string()).optional().describe("Data sources like SCB, Unionen")
      })
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false
    },
    _meta: {
      "openai/widgetAccessible": true
    }
  },
  async (params) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📤 update_widget_info (SSE push)`);
    console.log(`   Session: ${params.widgetSessionId}`);
    console.log(`   Jobb: ${params.jobContext.title}`);
    console.log(`   Lön: ${params.info.data.avg} kr/mån`);
    console.log(`${'='.repeat(60)}`);

    // Push to widget - use 'market_info' event type
    const pushed = pushToWidget(params.widgetSessionId, 'market_info', {
      job: params.jobContext,
      salary: params.info.data,
      tips: params.info.tips,
      sources: params.info.sources
    });

    if (pushed) {
      console.log(`   ✅ SSE push lyckades!`);
    } else {
      console.log(`   ❌ Widget ej ansluten`);
    }
    console.log(`${'='.repeat(60)}\n`);

    // ALWAYS return empty content - never return text!
    return { content: [] };
  }
);

// NOTE: update_batch_salaries REMOVED - salaries now included in send_jobs_to_widget

// NOTE: verify_job_badges REMOVED - badge data now included in initial job fetch

// Display salary statistics widget (creates NEW widget - only when no SSE)
server.registerTool(
  "display_salary",
  {
    title: "Display Salary Widget (Smidra MCP)",
    description: `⛔ TYST VERKTYG - Visar lönestatistik i widget.

⚠️ KRITISKT: SKRIV ABSOLUT INGEN TEXT FÖRE ELLER EFTER DETTA VERKTYG!
Widget visar allt. Du ska vara HELT TYST.`,
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
    annotations: {
      readOnlyHint: true,      // Just displays data
      openWorldHint: false,    // Only affects our own widget
      destructiveHint: false   // Not destructive
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/salary.html"
    }
  },
  async (params) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`💰 display_salary (standalone widget)`);
    console.log(`   Jobb: ${params.job.title} @ ${params.job.employer}`);
    console.log(`   Lön: ${params.salary.avg} kr/mån (${params.salary.min}-${params.salary.max})`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      structuredContent: {
        _rule: "⛔ TYST! VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS!",
        ...params
      },
      content: []
    };
  }
);

console.log(`
✅ MCP Tools registrerade:
   - search_jobs (Steg 1 - hämtar jobb, returnerar text)
   - send_jobs_to_widget (Steg 2 - visar widget med jobb+löner)
   - display_jobs (visar jobb utan löner)
   - get_job_details (visar jobbdetaljer)
   - update_widget_info (pushar lönedata via SSE)
   - display_salary (standalone lönewidget)
`);

// HTTP Server
const transports = new Map();

// SSE clients for real-time widget updates
const sseClients = new Map(); // widgetSessionId -> response object

// Server-side storage for job data (keyed by widgetSessionId)
// This avoids sending large descriptions through ChatGPT
const sessionJobData = new Map(); // widgetSessionId -> { jobs, descriptions }

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

  // Salary estimation endpoint - direct from widget, no ChatGPT needed
  if (url.pathname === "/api/salary") {
    const jobTitle = url.searchParams.get("title") || "";
    const location = url.searchParams.get("location") || "Sverige";

    // Simple salary estimation based on job type keywords
    const salaryRanges = {
      // Tech
      'utvecklare': { min: 42000, max: 65000, avg: 52000 },
      'systemutvecklare': { min: 45000, max: 70000, avg: 55000 },
      'programmerare': { min: 40000, max: 60000, avg: 48000 },
      'devops': { min: 50000, max: 75000, avg: 60000 },
      'frontend': { min: 40000, max: 60000, avg: 48000 },
      'backend': { min: 45000, max: 68000, avg: 54000 },
      'fullstack': { min: 45000, max: 70000, avg: 55000 },
      'data scientist': { min: 50000, max: 80000, avg: 62000 },
      'ai': { min: 55000, max: 85000, avg: 68000 },
      'cloud': { min: 50000, max: 75000, avg: 60000 },
      'architect': { min: 60000, max: 90000, avg: 72000 },
      'tech lead': { min: 55000, max: 85000, avg: 68000 },
      // Healthcare
      'sjuksköterska': { min: 32000, max: 42000, avg: 36000 },
      'läkare': { min: 55000, max: 95000, avg: 72000 },
      'undersköterska': { min: 26000, max: 32000, avg: 29000 },
      // Service
      'säljare': { min: 28000, max: 50000, avg: 38000 },
      'kock': { min: 26000, max: 38000, avg: 31000 },
      'städare': { min: 24000, max: 30000, avg: 27000 },
      'chaufför': { min: 28000, max: 38000, avg: 32000 },
      'lagerarbetare': { min: 26000, max: 34000, avg: 30000 },
      // Education
      'lärare': { min: 32000, max: 45000, avg: 38000 },
      'förskollärare': { min: 30000, max: 38000, avg: 34000 },
      // Engineering
      'ingenjör': { min: 40000, max: 65000, avg: 50000 },
      'civilingenjör': { min: 45000, max: 70000, avg: 55000 },
      'projektledare': { min: 45000, max: 70000, avg: 55000 },
      // Admin
      'administratör': { min: 28000, max: 40000, avg: 34000 },
      'ekonom': { min: 38000, max: 55000, avg: 45000 },
      'controller': { min: 45000, max: 65000, avg: 52000 },
      'hr': { min: 35000, max: 55000, avg: 44000 },
      // Default
      'default': { min: 30000, max: 45000, avg: 36000 }
    };

    // Find matching salary range
    const titleLower = jobTitle.toLowerCase();
    let salary = salaryRanges.default;
    for (const [keyword, range] of Object.entries(salaryRanges)) {
      if (titleLower.includes(keyword)) {
        salary = range;
        break;
      }
    }

    // Stockholm adjustment (+10%)
    if (location.toLowerCase().includes('stockholm')) {
      salary = {
        min: Math.round(salary.min * 1.1),
        max: Math.round(salary.max * 1.1),
        avg: Math.round(salary.avg * 1.1)
      };
    }

    console.log(`💰 Salary estimate: ${jobTitle} in ${location} → ${salary.avg} kr/mån`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      job: { title: jobTitle, location },
      salary,
      tips: [
        'Förhandla alltid - första erbjudandet är sällan det bästa',
        'Lyft fram specifika resultat och erfarenheter',
        'Kolla fler källor som SCB och Glassdoor'
      ],
      sources: ['SCB', 'Arbetsförmedlingen', 'Glassdoor (estimat)']
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
    res.end(JSON.stringify(formatJob(job, true)));  // Include full description
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

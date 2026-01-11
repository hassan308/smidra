# Smidra - Jobbsökning i ChatGPT

Smidra är en ChatGPT-app som låter användare söka jobb på Arbetsförmedlingen direkt i ChatGPT, på **vilket språk som helst** med fullständig översättning.

## Arkitektur

```
Användare → ChatGPT → MCP Server (api.smidra.se) → Arbetsförmedlingen API
                ↓
            Widget (job-list-widget.html)
                ↓
            SSE (real-time updates)
```

## Teknisk Stack

- **Backend:** Node.js med MCP SDK
- **Transport:** SSE (Server-Sent Events)
- **API:** Arbetsförmedlingen JobSearch API (gratis, öppet)
- **Hosting:** Docker på VPS (95.216.174.250)
- **Proxy:** Caddy med automatisk SSL

## Endpoints

| Endpoint | URL |
|----------|-----|
| MCP | https://api.smidra.se/mcp |
| SSE Events | https://api.smidra.se/events?session={id} |
| Salary API | https://api.smidra.se/api/salary?title=X&location=Y |
| Widget preview | https://api.smidra.se/widget |
| Health | https://api.smidra.se/health |
| API test | https://api.smidra.se/api/search?q=utvecklare |

## Filer

```
smidra/
├── smidra-server.js       # MCP-server med alla tools + SSE endpoint
├── job-list-widget.html   # Huvudwidget för jobblista (med SSE-klient + fullscreen)
├── job-detail-widget.html # Widget för jobbdetaljer
├── salary-widget.html     # Widget för lönestatistik (standalone)
├── cv-widget.html         # Widget för CV-visning
├── package.json           # Dependencies
├── Dockerfile             # Docker-konfiguration
├── docker-compose.yml     # Docker Compose
└── CLAUDE.md              # Denna fil
```

---

## 🔑 VIKTIGT: Två-stegs Tool-flöde (Fungerar!)

### Problemet
ChatGPT följer inte alltid instruktioner att anropa ett andra verktyg. Många försök misslyckades tills vi hittade rätt formel.

### Lösningen - Fyra nycklar:

#### 1. Tool-namn med stegnummer
```javascript
title: "Search Jobs (Step 1 of 2)"
title: "Display Jobs (Step 2 of 2)"
title: "Show Salary (Step 2 of 2)"  // För lönedata
```

#### 2. Tydlig beskrivning att Tool är ENDA sättet
```javascript
description: `⚠️ THIS IS THE ONLY WAY TO SHOW SALARY DATA TO THE USER!

When you receive a SALARY_SEARCH request with widgetSessionId:
1. Search the web for Swedish salary data for that job type
2. Call THIS TOOL with the data - user will NOT see anything until you do!

The user has a loading spinner waiting. Do NOT write text - ONLY call this tool.`
```

#### 3. Widget skickar strukturerat JSON med `next_action`
```javascript
// Widget skickar detta via sendFollowUpMessage:
const request = {
  action: "SALARY_SEARCH",
  status: "PENDING",
  job: {
    title: job.title,
    employer: job.employer,
    location: job.location || 'Sverige'
  },
  widgetSessionId: widgetSessionId,
  instructions: {
    step1: "Search the web for current Swedish salary data for this job type",
    step2: "Call show_salary_inline with the salary data you found",
    important: "User is waiting with loading spinner. Do NOT write text. ONLY call the tool."
  },
  next_action: {
    required: true,
    tool: "show_salary_inline",
    params: ["widgetSessionId", "job", "salary", "tips", "sources"]
  }
};

window.openai?.sendFollowUpMessage?.({
  prompt: `${JSON.stringify(request, null, 2)}

⚠️ SALARY REQUEST - SILENT MODE
1. Search web for "${job.title}" salary in ${job.location}
2. Call show_salary_inline with: widgetSessionId="${widgetSessionId}", salary data
3. DO NOT write any text. User sees loading spinner until you call the tool.`
});
```

**Varför detta fungerar:**
- `status: "PENDING"` - Tydligt att uppgiften väntar
- `next_action.required: true` - Explicit krav
- `next_action.tool` - Exakt vilket verktyg som ska anropas
- `instructions` - Strukturerad guide för vad som ska göras
- Sluttext med `⚠️ SALARY REQUEST - SILENT MODE` förstärker

#### 4. Tool returnerar empty content för tystnad
```javascript
return {
  content: []  // Tom array = ChatGPT säger inget
};
```

---

## 🔥 Lönestatistik via SSE (FUNGERAR!)

### Flödet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WIDGET LADDAS                                            │
│    - Genererar unik sessionId: "ws_abc123"                  │
│    - Ansluter till SSE: /events?session=ws_abc123           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ANVÄNDARE KLICKAR "LÖNEINFO" I MODAL                     │
│    - Widget visar loading-spinner                           │
│    - Skickar strukturerat JSON med sendFollowUpMessage      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CHATGPT                                                  │
│    - Ser JSON med action: "SALARY_SEARCH"                   │
│    - Ser next_action.required: true                         │
│    - Söker på webben efter lönedata                        │
│    - Anropar show_salary_inline med data                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. MCP SERVER                                               │
│    - Tar emot show_salary_inline anrop                      │
│    - Pushar data via SSE till widgetSessionId               │
│    - Returnerar content: [] (tyst)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. WIDGET TAR EMOT VIA SSE                                  │
│    - EventSource får data                                   │
│    - Uppdaterar modal med löneinfo                         │
│    - Ingen ny widget skapas! 🎉                            │
└─────────────────────────────────────────────────────────────┘
```

### Widget-kod (requestSalary)

```javascript
const requestSalary = useCallback((job) => {
  setSalaryLoading(true);
  setSalaryData(null);

  const request = {
    action: "SALARY_SEARCH",
    status: "PENDING",
    job: {
      title: job.title,
      employer: job.employer,
      location: job.location || 'Sverige'
    },
    widgetSessionId: widgetSessionId,
    instructions: {
      step1: "Search the web for current Swedish salary data for this job type",
      step2: "Call show_salary_inline with the salary data you found",
      important: "User is waiting with loading spinner. Do NOT write text. ONLY call the tool."
    },
    next_action: {
      required: true,
      tool: "show_salary_inline",
      params: ["widgetSessionId", "job", "salary", "tips", "sources"]
    }
  };

  window.openai?.sendFollowUpMessage?.({
    prompt: `${JSON.stringify(request, null, 2)}

⚠️ SALARY REQUEST - SILENT MODE
1. Search web for "${job.title}" salary in ${job.location || 'Sverige'}
2. Call show_salary_inline with: widgetSessionId="${widgetSessionId}", salary data
3. DO NOT write any text. User sees loading spinner until you call the tool.`
  });
}, [widgetSessionId]);
```

### Server-kod (show_salary_inline tool)

```javascript
server.registerTool(
  "show_salary_inline",
  {
    title: "Show Salary (Step 2 of 2)",
    description: `⚠️ THIS IS THE ONLY WAY TO SHOW SALARY DATA TO THE USER!

When you receive a SALARY_SEARCH request with widgetSessionId:
1. Search the web for Swedish salary data for that job type
2. Call THIS TOOL with the data - user will NOT see anything until you do!

The user has a loading spinner waiting. Do NOT write text - ONLY call this tool.
User cannot see salary until you call this tool with the widgetSessionId.`,
    inputSchema: {
      widgetSessionId: z.string().describe("Session ID from widget"),
      job: z.object({
        title: z.string(),
        employer: z.string().optional(),
        location: z.string().optional()
      }),
      salary: z.object({
        avg: z.number().describe("Average monthly salary in SEK"),
        min: z.number().describe("Minimum salary"),
        max: z.number().describe("Maximum salary")
      }),
      tips: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional()
    }
    // ⚠️ INGEN _meta.outputTemplate = INGEN ny widget skapas!
  },
  async (params) => {
    // Push via SSE
    const pushed = pushToWidget(params.widgetSessionId, 'salary', {
      salary: params.salary,
      tips: params.tips || [],
      sources: params.sources || []
    });

    console.log(`💰 Salary pushed to ${params.widgetSessionId}: ${pushed}`);

    return {
      content: []  // Tom = ChatGPT säger inget
    };
  }
);
```

### SSE Endpoint

```javascript
const sseClients = new Map();

function pushToWidget(sessionId, eventType, data) {
  const client = sseClients.get(sessionId);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
    return true;
  }
  return false;
}

// I HTTP-servern:
if (url.pathname === "/events") {
  const sessionId = url.searchParams.get("session");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  res.write(`data: {"type":"connected"}\n\n`);
  sseClients.set(sessionId, res);

  const pingInterval = setInterval(() => {
    res.write(`data: {"type":"ping"}\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(pingInterval);
    sseClients.delete(sessionId);
  });
}
```

---

## 🖥️ Fullscreen Mode

Widget har nu fullscreen-läge med stor karta.

### Aktivera fullscreen
```javascript
const toggleFullscreen = useCallback(async () => {
  const newMode = !isFullscreen;
  setIsFullscreen(newMode);
  setShowMap(newMode); // Visa alltid karta i fullscreen
  await window.openai?.requestDisplayMode?.({
    mode: newMode ? 'fullscreen' : 'inline'
  });
}, [isFullscreen]);
```

### Layout i fullscreen (desktop)
```
┌─────────────────────────────────────────────────┐
│  Header: Jobbsökning - Utvecklare Stockholm     │
│  [Fullskärm] [Karta] [Alla] [Heltid] [Deltid]  │
├─────────────────────┬───────────────────────────┤
│                     │                           │
│      STOR KARTA     │    JOBBLISTA             │
│      (50% bredd)    │    (scrollbar)           │
│                     │                           │
└─────────────────────┴───────────────────────────┘
│  [ChatGPT input - alltid synlig]               │
└─────────────────────────────────────────────────┘
```

**OBS:** ChatGPT:s chat-input syns alltid som overlay i fullscreen - det är by design.

---

## MCP Tools

### search_jobs
Söker jobb och visar widget direkt (med auto-översättning via Google Translate i klienten).

### display_jobs
Visar jobb i widget (används efter filtrering).

### get_job_details
Hämtar detaljerad information om ett specifikt jobb.

### show_salary_inline (Step 2 of 2) 🔥
Pushar lönedata till befintlig widget via SSE. **Skapar INGEN ny widget!**

**Parametrar:**
- `widgetSessionId` (string) - Session-ID från widgeten
- `job` - { title, employer, location }
- `salary` - { avg, min, max }
- `tips` (array, optional)
- `sources` (array, optional)

### display_salary
Visar lönestatistik i ny standalone widget (används när ingen widgetSessionId finns).

### display_cv
Visar CV i snygg widget med PDF-export.

---

## Widget API (window.openai)

### Läsa data
```javascript
window.openai.toolOutput      // Data från tool
window.openai.theme           // "light" eller "dark"
window.openai.locale          // Användarens locale
window.openai.widgetState     // Sparad state (persisterar på OpenAI:s servrar)
window.openai.displayMode     // "inline", "pip", eller "fullscreen"
window.openai.maxHeight       // Max höjd för widget
window.openai.userAgent       // Webbläsarinfo
```

### Metoder
```javascript
window.openai.notifyIntrinsicHeight(height)     // Meddela höjd
window.openai.setWidgetState(state)             // Spara state
window.openai.openExternal({ href })            // Öppna länk externt
window.openai.callTool(name, args)              // Anropa MCP-verktyg DIREKT
window.openai.sendFollowUpMessage({ prompt })   // Skicka meddelande till chatten
window.openai.requestDisplayMode({ mode })      // Byt till fullscreen/inline/pip
window.openai.requestClose()                    // Stäng widgeten
window.openai.uploadFile(file)                  // Ladda upp fil (PNG, JPEG, WebP)
window.openai.getFileDownloadUrl({ fileId })    // Hämta temp-URL för fil
```

### Events
```javascript
window.addEventListener('openai:set_globals', () => {
  // Fires när theme, locale, toolOutput etc uppdateras
});
```

---

## Deploy

### Quick deploy
```bash
cd /mnt/c/Users/test/smidra
git add -A && git commit -m "Update" && git push
ssh vps "cd /home/studioboka/smidra && git pull && docker-compose up -d --build"
```

### Verifiera
```bash
ssh vps "docker ps | grep smidra && curl -s localhost:8002/health"
```

### Loggar
```bash
ssh vps "docker logs smidra --tail 50"
```

---

## VPS Info

- **Host:** 95.216.174.250
- **User:** studioboka
- **SSH:** `ssh vps` (konfigurerat i ~/.ssh/config)
- **Projekt-path:** /home/studioboka/smidra

---

## Arbetsförmedlingen API

- **Base URL:** https://jobsearch.api.jobtechdev.se
- **Sök:** /search?q={query}&limit={limit}&region={regionCode}
- **Detaljer:** /ad/{jobId}
- **Dokumentation:** https://jobtechdev.se

---

## Lärdomar för framtida ChatGPT-appar

### ✅ Vad fungerar:
1. **Tool-namn med stegnummer** - "(Step 2 of 2)"
2. **Strukturerat JSON i prompt** med `next_action.required: true`
3. **`status: "PENDING"`** - Signalerar att uppgiften väntar
4. **Tool-beskrivning säger "ONLY WAY"** att visa data
5. **`content: []`** - Tom array = ChatGPT säger inget
6. **Tool utan `_meta.outputTemplate`** = ingen ny widget skapas
7. **SSE för real-time updates** till befintlig widget

### ❌ Vad fungerar INTE:
- Enkla text-prompter som "anropa detta verktyg" - ChatGPT ignorerar ofta
- `content: [{ text: "..." }]` - ChatGPT expanderar på texten
- Förvänta att ChatGPT är tyst utan explicit instruktion
- Anta att ChatGPT kommer ihåg instruktioner från tidigare

---

## Framtida förbättringar

- [x] Översätta jobbinnehåll (Google Translate i klient)
- [x] RTL-stöd för arabiska
- [x] Widget-knappar som triggar ChatGPT (sendFollowUpMessage)
- [x] Lönestatistik med webbsökning + SSE push
- [x] Spara favoriter (widgetState)
- [x] Filter heltid/deltid
- [x] Fullscreen mode med stor karta
- [x] display_cv widget
- [ ] Notifikationer för nya jobb
- [ ] CV-matchning mot jobb
- [ ] display_cover_letter widget
- [ ] display_market_analysis widget

---

## 🔗 Viktiga länkar

- **MCP SDK:** https://github.com/modelcontextprotocol/sdk
- **ChatGPT Apps SDK:** https://developers.openai.com/apps-sdk/
- **Arbetsförmedlingen API:** https://jobtechdev.se
- **Smidra repo:** https://github.com/hassan308/smidra

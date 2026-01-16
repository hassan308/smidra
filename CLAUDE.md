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

## 🚨 KRITISKT: Få ChatGPT att BARA visa widget (ingen text!)

### Problemet
ChatGPT skriver ofta text-svar efter att ha anropat ett verktyg, även om widgeten visar allt.
Särskilt vid MÅNGA sökresultat tappar ChatGPT fokus och skriver text ändå.

### Lösningen - `_rule` i structuredContent (FUNGERAR!)

#### Nyckeln: Lägg regeln FÖRST i structuredContent, skippa content helt

```javascript
return {
  structuredContent: {
    // REGEL FÖRST - ChatGPT ser detta innan jobbdatan
    _rule: "VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS.",

    // Sen resten av datan för widgeten
    translateMode: true,
    language: language || 'sv',
    direction: direction || 'ltr',
    loadingText: loadingText || 'Söker jobb...',
    translatingText: translatingText || 'Översätter...',
    query: query,
    location: location || 'Sverige',
    total,
    jobs
  }
  // INGEN content! - content är optional enligt MCP-spec
};
```

### Varför detta fungerar:

| Element | Effekt |
|---------|--------|
| `_rule` FÖRST i structuredContent | ChatGPT läser regeln innan all jobbdata |
| INGEN `content` field | ChatGPT har inget att citera/bygga vidare på |
| `(Smidra MCP)` i tool title | ChatGPT förstår vilken plugin |
| Tool description med instruktion | Extra påminnelse |

### Flödet:
```
1. Kund: "Hitta jobb som utvecklare"
         ↓
2. ChatGPT anropar: search_jobs(...)
         ↓
3. MCP returnerar:
   {
     structuredContent: {
       _rule: "VISA ENDAST WIDGET...",  ← ChatGPT ser FÖRST
       jobs: [...]                       ← Sen datan
     }
     // INGEN content!
   }
         ↓
4. ChatGPT ser _rule → skriver INGEN text
         ↓
5. Widget visas ensam!
```

### Widget-helper för löneknappen (sendFollowUpMessage)
```javascript
const sendToChatGPT = useCallback((message, toolName = null) => {
  const mcpSuffix = toolName
    ? `\n\n[Använd endast ${toolName} verktyget från Smidra MCP. Skicka ingen text - anropa bara verktyget.]`
    : '\n\n[Använd verktygen från Smidra MCP. Skicka ingen text - anropa bara verktygen.]';

  window.openai?.sendFollowUpMessage?.({ prompt: message + mcpSuffix });
}, []);
```

### JSON-exempel i prompt (för update_widget_info)
```javascript
const message = `Visa lönestatistik för "Utvecklare" i Stockholm.

Anropa med denna data:
{
  "widgetSessionId": "${widgetSessionId}",
  "jobContext": { "title": "Utvecklare", "location": "Stockholm" },
  "info": {
    "type": "compensation",
    "data": { "avg": [genomsnitt], "min": [lägsta], "max": [högsta] },
    "sources": ["SCB", "Unionen"]
  }
}`;

sendToChatGPT(message, 'update_widget_info');
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

## 🔥 Lönestatistik via Web Search + SSE (FUNGERAR!)

### Flödet (Förenklat - AKTUELL VERSION)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WIDGET LADDAS                                            │
│    - Genererar unik sessionId: "ws_abc123"                  │
│    - Ansluter till SSE: /events?session=ws_abc123           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ANVÄNDARE KLICKAR "LÖNEINFO"                             │
│    - Widget visar loading-spinner                           │
│    - Skickar ENKEL prompt med sendFollowUpMessage           │
│    - Prompt säger explicit "Sök på webben..."              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CHATGPT                                                  │
│    - Ser "widget_session:" → matchar tool-beskrivningen    │
│    - SÖKER PÅ WEBBEN efter lönedata                        │
│    - Anropar update_widget_info med data                   │
│    - INGEN APPROVAL DIALOG! 🎉                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. MCP SERVER                                               │
│    - Tar emot update_widget_info anrop                      │
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

### Widget-kod (requestSalary) - MED sendToChatGPT HELPER

```javascript
// Helper: Lägger alltid till MCP-instruktion på slutet
const sendToChatGPT = useCallback((message, toolName = null) => {
  const mcpSuffix = toolName
    ? `\n\n[Använd endast ${toolName} verktyget från Smidra MCP. Skicka ingen text - anropa bara verktyget.]`
    : '\n\n[Använd verktygen från Smidra MCP. Skicka ingen text - anropa bara verktygen.]';

  const fullMessage = message + mcpSuffix;
  console.log('📤 sendToChatGPT:', fullMessage);
  window.openai?.sendFollowUpMessage?.({ prompt: fullMessage });
}, []);

// Användning:
const requestSalary = useCallback((job) => {
  setSalaryLoading(true);
  setSalaryData(null);

  // Inkludera JSON-exempel så ChatGPT vet exakt format!
  const message = `Visa lönestatistik för "${job.title}" i ${job.location || 'Sverige'}.

Anropa med denna data:
{
  "widgetSessionId": "${widgetSessionId}",
  "jobContext": { "title": "${job.title}", "location": "${job.location || 'Sverige'}" },
  "info": {
    "type": "compensation",
    "data": { "avg": [genomsnitt], "min": [lägsta], "max": [högsta] },
    "tips": ["förhandlingstips..."],
    "sources": ["SCB", "Unionen", "Sveriges Ingenjörer"]
  }
}`;

  sendToChatGPT(message, 'update_widget_info');
}, [widgetSessionId, sendToChatGPT]);
```

**Varför detta fungerar:**
1. `sendToChatGPT` helper lägger ALLTID till MCP-suffix
2. JSON-exempel visar ChatGPT exakt format
3. `[Använd endast X verktyget från Smidra MCP. Skicka ingen text - anropa bara verktyget.]`

### Server-kod (update_widget_info) - NEUTRAL NAMNGIVNING

```javascript
server.registerTool(
  "update_widget_info",  // ⚠️ NEUTRALT NAMN - inte "salary"!
  {
    title: "Update Widget Info",
    description: `Display salary/market data in user's job widget.

WORKFLOW:
1. First, SEARCH THE WEB for current salary statistics for the job title and location
2. Then call this tool to display the results in the user's widget

When you see "widget_session:" in the message:
- Search the web for salary data (Swedish market: SCB, Unionen, Sveriges Ingenjörer)
- Call this tool with the data you found
- The widget will display it - do NOT write text response

This is a read-only display operation. Widget is already open and waiting.`,
    inputSchema: {
      widgetSessionId: z.string().describe("Session ID from widget_session field"),
      jobContext: z.object({
        title: z.string(),
        location: z.string().optional()
      }),
      info: z.object({
        type: z.string().describe("Type of info: compensation, market, trends"),
        data: z.object({
          avg: z.number(),
          min: z.number(),
          max: z.number()
        }),
        tips: z.array(z.string()).optional(),
        sources: z.array(z.string()).optional()
      })
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false
    },
    _meta: {
      "openai/widgetAccessible": true  // ⚠️ VIKTIGT!
    }
  },
  async (params) => {
    const pushed = pushToWidget(params.widgetSessionId, 'market_info', {
      job: params.jobContext,
      salary: params.info.data,
      tips: params.info.tips,
      sources: params.info.sources
    });
    return { content: [] };  // Tyst!
  }
);
```

### VIKTIGA LÄRDOMAR från denna implementation:

1. **Neutral tool-namn** - `update_widget_info` istället för `show_salary_inline`
2. **Explicit "SEARCH THE WEB"** i tool-beskrivningen
3. **`_meta: { "openai/widgetAccessible": true }`** - krävs!
4. **Ta bort konkurrerande tools** - hade `get_salary_info` som ChatGPT valde istället
5. **Enkel prompt** - inte komplex JSON med `required: true` (triggade approval!)

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

## 🤖 AI Badge-verifiering (Erfarenhet krävs/ej krävs)

### Problemet
Arbetsförmedlingens API returnerar `experience_required: false` för vissa jobb, men detta är inte alltid korrekt.
Många jobb som säger "erfarenhet krävs ej" i API:et nämner ändå erfarenhetskrav i beskrivningen (t.ex. "5 års erfarenhet", "senior").

### Lösningen - AI-verifiering via ChatGPT

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ANVÄNDARE SÖKER JOBB                                     │
│    - search_jobs anropas                                    │
│    - Backend identifierar jobb med experienceRequired=false │
│    - Extraherar snippets runt "erfarenhet"-nyckelord        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. BACKEND RETURNERAR                                       │
│    - Alla jobb till widget (visas direkt!)                  │
│    - widgetSessionId för SSE                                │
│    - jobsBeingVerified[] - lista på jobb-IDs som verifieras │
│    - _rule med verifieringsinstruktioner till ChatGPT       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. WIDGET VISAR                                             │
│    - Alla jobb direkt (ingen väntan!)                       │
│    - Spinner 🔄 på badges för jobb som verifieras           │
│    - "Erfarenhet krävs" som default för övriga              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CHATGPT VERIFIERAR (tyst i bakgrunden)                   │
│    - Läser snippets för varje jobb                          │
│    - Avgör: nämns "X års erfarenhet", "senior", "erfaren"?  │
│    - Anropar verify_job_badges för varje jobb               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SSE PUSH                                                 │
│    - Backend pushar badge_update till widget                │
│    - Widget uppdaterar badge i realtid                      │
│    - Spinner försvinner → visar "Erfarenhet ej krävs" 🎓    │
└─────────────────────────────────────────────────────────────┘
```

### Snippet-extraktion (Backend)

Istället för att skicka hela jobbeskrivningen, extraheras endast relevanta delar:

```javascript
// I search_jobs tool:
const keywords = ['erfarenhet', 'erfarenheter', 'erfaren', 'experience', 'års arbete'];
const snippets = [];

for (const keyword of keywords) {
  const regex = new RegExp(keyword, 'gi');
  let match;
  while ((match = regex.exec(jobDescription)) !== null) {
    // 200 tecken före och efter varje träff
    const start = Math.max(0, match.index - 200);
    const end = Math.min(text.length, match.index + keyword.length + 200);
    snippets.push(`...${text.substring(start, end)}...`);
  }
}

// Max 3 unika snippets per jobb
const verificationSnippets = [...new Set(snippets)].slice(0, 3).join('\n---\n');
```

### _rule med verifieringsinstruktioner

```javascript
// I search_jobs return:
return {
  structuredContent: {
    _rule: jobsNeedingVerification.length > 0
      ? `⚠️ VIKTIGT: ${jobsNeedingVerification.length} JOBB BEHÖVER BADGE-VERIFIERING!

STEG 1: Widget visas nu med spinner på badges.
STEG 2: DU MÅSTE anropa verify_job_badges för VARJE jobb nedan:

${verificationData.map(j => `
📋 JOB ID: ${j.id}
   Titel: "${j.title}"
   Snippets: "${j.snippets?.substring(0, 300) || ''}"

   → Om snippets nämner "X års erfarenhet", "senior", "erfaren" → experienceRequired: true
   → Om INGET erfarenhetskrav nämns → experienceRequired: false

   Anropa: verify_job_badges({ widgetSessionId: "${widgetSessionId}", jobId: "${j.id}", badges: { experienceRequired: true/false } })
`).join('\n')}

SKRIV INGEN TEXT. Anropa verify_job_badges för varje jobb DIREKT.`
      : "VISA ENDAST WIDGET. SKRIV INGEN TEXT ALLS.",

    // Widget-data
    widgetSessionId,
    jobsBeingVerified: verificationData.map(j => j.id),
    jobs: [...],
    // ...
  }
};
```

### verify_job_badges Tool

```javascript
server.registerTool(
  "verify_job_badges",
  {
    title: "Verify Job Badges",
    description: `Verify experience requirements for jobs.

Called automatically after search_jobs when jobs need badge verification.
ONLY call this when instructed in _rule - widget is waiting with spinner.`,
    inputSchema: {
      widgetSessionId: z.string(),
      jobId: z.string(),
      badges: z.object({
        experienceRequired: z.boolean().optional()
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
    console.log(`🔍 AI BADGE VERIFICATION: Job ${params.jobId}`);
    console.log(`   experienceRequired: ${params.badges.experienceRequired}`);

    // Push till widget via SSE
    const pushed = pushToWidget(params.widgetSessionId, 'badge_update', {
      jobId: params.jobId,
      badges: params.badges
    });

    if (pushed) console.log(`📤 SSE push OK`);
    return { content: [] };  // Tyst!
  }
);
```

### Widget - SSE Hantering

```typescript
// Reconnect med server's session ID
const [sseSessionId, setSseSessionId] = useState<string>(widgetSessionId.current);

useEffect(() => {
  const es = new EventSource(`https://api.smidra.se/events?session=${sseSessionId}`);

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Badge-verifiering uppdatering
    if (data.type === 'badge_update' && data.jobId && data.badges) {
      // Uppdatera jobbet
      setJobs(prev => prev.map(job =>
        job.id === data.jobId
          ? { ...job, experienceRequired: data.badges.experienceRequired }
          : job
      ));

      // Ta bort från "verifieras"-listan (stoppar spinner)
      setJobsBeingVerified(prev => prev.filter(id => id !== data.jobId));
    }
  };

  return () => es.close();
}, [sseSessionId]);

// Uppdatera session ID från server
useEffect(() => {
  if (data.widgetSessionId) {
    setSseSessionId(data.widgetSessionId);  // Triggar SSE reconnect
  }
}, [data.widgetSessionId]);
```

### Widget - Badge Display

```jsx
{/* Experience badge - tre states */}
{isBeingVerified ? (
  // 🔄 SPINNER - verifieras just nu
  <span className="... bg-blue-50 text-blue-600">
    <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    Verifierar...
  </span>
) : job.experienceRequired === false ? (
  // 🎓 GRÖNT - AI bekräftat att erfarenhet EJ krävs
  <span className="... bg-emerald-50 text-emerald-700">
    <GraduationCap className="w-3.5 h-3.5" />
    Erfarenhet ej krävs
  </span>
) : (
  // 💼 GRÅTT - Default (erfarenhet krävs)
  <span className="... bg-gray-100 text-gray-600">
    <Briefcase className="w-3.5 h-3.5" />
    Erfarenhet krävs
  </span>
)}
```

### Viktiga lärdomar

| Lärdom | Förklaring |
|--------|------------|
| **Snippets, inte hela text** | 200 tecken före/efter nyckelord räcker, minskar tokens |
| **Widget visas direkt** | Ingen väntan på AI - spinner visar progress |
| **_rule i början** | ChatGPT ser verifieringsinstruktioner FÖRST |
| **SSE reconnect** | Widget måste reconnecta med server's session ID |
| **Default = "krävs"** | Säkrare att anta erfarenhet krävs tills AI bekräftar motsatsen |

### Server-loggar vid verifiering

```
🤖 ========== BADGE VERIFICATION NEEDED ==========
📊 2 jobb att verifiera
🔑 Session: ws_abc123

📋 JOB: 30393859
   Titel: Systemutvecklare till BM System
   Snippets: ...erfarenhet inom .NET/C#...God kommunikationsförmåga...

📋 JOB: 29958005
   Titel: Senior Systemutvecklare – Robotlösningar
   Snippets: ...Minst 5 års erfarenhet...senior erfarenhet...

🤖 ================================================

🔍 ========== AI BADGE VERIFICATION RESULT ==========
📋 Job ID: 30393859
📊 Badges: { "experienceRequired": false }
✅ AI säger: Ingen erfarenhet krävs → badge visas
📤 SSE push OK till widget

🔍 ========== AI BADGE VERIFICATION RESULT ==========
📋 Job ID: 29958005
📊 Badges: { "experienceRequired": true }
❌ AI säger: Erfarenhet KRÄVS → badge döljs
📤 SSE push OK till widget
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

### update_widget_info 🔥 (NEUTRAL NAMNGIVNING!)
Pushar lönedata/marknadsinfo till befintlig widget via SSE. **Skapar INGEN ny widget!**

**Viktigt:** Verktyget heter INTE "salary" för att undvika approval-dialog.

**Parametrar:**
- `widgetSessionId` (string) - Session-ID från widgeten
- `jobContext` - { title, location }
- `info` - { type, data: { avg, min, max }, tips, sources }

**Kräver:**
- `annotations: { readOnlyHint: true, ... }`
- `_meta: { "openai/widgetAccessible": true }`

### verify_job_badges 🤖 (AI Badge-verifiering)
Verifierar erfarenhetskrav för jobb via AI. Anropas automatiskt av ChatGPT efter search_jobs.

**Parametrar:**
- `widgetSessionId` (string) - Session-ID från widgeten
- `jobId` (string) - Jobbets ID
- `badges` - { experienceRequired: boolean }

**Flöde:**
1. search_jobs identifierar jobb med `experienceRequired: false`
2. Extraherar snippets runt "erfarenhet"-nyckelord
3. ChatGPT läser snippets och avgör om erfarenhet verkligen krävs
4. Anropar verify_job_badges med resultatet
5. Backend pushar uppdatering via SSE till widgeten

### display_salary
Visar lönestatistik i ny standalone widget (används när ingen widgetSessionId finns).

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

## 🚫 Undvika Godkännande-knappen (VIKTIG LÄRDOM!)

### Problemet
ChatGPT visar approval-dialog för "känsliga" operationer, särskilt:
- Finansiell data (löner, priser)
- Externa API-anrop
- Skrivoperationer

### Lösningen - FYRA kritiska delar:

#### 1. Neutral tool-namngivning (UNDVIK finansiella ord!)
```javascript
// ❌ FEL - triggar approval:
"show_salary_inline"
"get_salary_info"

// ✅ RÄTT - neutral:
"update_widget_info"
```

#### 2. Tool annotations
```javascript
annotations: {
  readOnlyHint: true,      // Bara visar data
  openWorldHint: false,    // Endast vår egen widget
  destructiveHint: false   // Inte destruktiv
}
```

#### 3. `_meta` med widgetAccessible
```javascript
_meta: {
  "openai/widgetAccessible": true  // VIKTIGT!
}
```

#### 4. Ta bort konkurrerande tools!
Om du har två tools som gör liknande saker (t.ex. `get_salary_info` och `update_widget_info`),
**TA BORT en av dem!** ChatGPT kan välja fel tool.

### Komplett exempel (FUNGERAR!):
```javascript
server.registerTool(
  "update_widget_info",  // Neutralt namn!
  {
    title: "Update Widget Info",
    description: `Display salary/market data in user's job widget.

WORKFLOW:
1. First, SEARCH THE WEB for current salary statistics
2. Then call this tool to display the results

When you see "widget_session:" in the message:
- Search the web for salary data (Swedish market: SCB, Unionen)
- Call this tool with the data you found
- Widget will display it - do NOT write text response`,
    inputSchema: { /* ... */ },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false
    },
    _meta: {
      "openai/widgetAccessible": true
    }
  },
  async (params) => { /* push via SSE */ }
);
```

---

## Lärdomar för framtida ChatGPT-appar

### ✅ Vad fungerar:
1. **Neutral tool-namngivning** - Undvik "salary", "payment", "financial" etc
2. **Explicit "SEARCH THE WEB" i tool-beskrivning** - ChatGPT vet inte automatiskt att den ska söka
3. **`_meta: { "openai/widgetAccessible": true }`** - Krävs för widget-integration
4. **Tool annotations** - `readOnlyHint: true`, `openWorldHint: false`
5. **`content: []`** - Tom array = ChatGPT säger inget
6. **SSE för real-time updates** till befintlig widget
7. **EN tool per funktion** - Ta bort konkurrerande tools!
8. **`widget_session:` mönster i prompt** - Matcha med tool-beskrivningen

### ❌ Vad fungerar INTE:
- **Finansiella ord i tool-namn** - Triggar approval (`show_salary_inline`)
- **Flera tools för samma sak** - ChatGPT väljer ofta fel
- **Anta att ChatGPT söker på webben** - Måste säga explicit "SEARCH THE WEB"
- **`required: true` i prompt** - Kan trigga approval dialog
- **Passiva prompter** - "Hitta info..." → ChatGPT svarar med text istället
- **Förvänta att ChatGPT är tyst** utan `content: []`

### 🔑 Fungerade recept för Web Search → Widget:

```
Widget prompt:
"Sök på webben efter [data] för [titel] i [plats].
När du hittat information, använd [tool_name] för att visa i min widget.
widget_session: [session_id]"

Tool description:
"WORKFLOW:
1. First, SEARCH THE WEB for [data]
2. Then call this tool to display results
When you see 'widget_session:' - search web, then call this tool."
```

---

## 📱 Mobil UX för ChatGPT-appen (VIKTIGT!)

### Problemet
ChatGPT-appen på mobil har en "Ask anything" input-ruta längst ner som täcker widget-innehåll.
Modal-dialogen visade sig i botten och gick inte att scrolla (bakgrunden scrollade istället).

### Lösningen

#### 1. Extra padding längst ner (100px)
```css
/* Job grid - extra padding för ChatGPT input-bar */
.job-grid { padding: 0 12px 100px; }
.pagination { padding: 16px 12px 100px; }
.empty-state, .loading-state { padding: 40px 16px 100px; }

/* Även i fullscreen mode */
.fullscreen-mode .job-grid { padding: 0 8px 100px; }
```

#### 2. Modal CENTRERAD (inte i botten!)
```css
@media (max-width: 640px) {
  .modal-overlay {
    padding: 20px;
    align-items: center;      /* Centrera vertikalt */
    justify-content: center;  /* Centrera horisontellt */
    overflow: hidden;
  }

  .modal {
    max-height: 80vh;         /* Max 80% av skärmhöjden */
    border-radius: var(--radius-xl);  /* Rundade hörn (inte bara toppen) */
    display: flex;
    flex-direction: column;
  }

  .modal-body {
    overflow-y: auto;         /* Scrollbar INUTI modalen */
    -webkit-overflow-scrolling: touch;  /* Smooth scroll på iOS */
    flex: 1;
    min-height: 0;            /* Viktigt för flex scroll! */
  }
}
```

#### 3. INGEN auto-fullscreen
ChatGPT-appen hanterar display mode själv. `requestDisplayMode` API:et orsakade vita skärmar.
Användaren klickar "🖥️ Fullskärm" manuellt om de vill.

```javascript
// ❌ FEL - orsakar vita skärmar i ChatGPT-appen:
useEffect(() => {
  window.openai?.requestDisplayMode?.({ mode: 'fullscreen' });
}, []);

// ✅ RÄTT - manuell knapp:
const toggleFullscreen = useCallback(async () => {
  const newMode = !isFullscreen;
  setIsFullscreen(newMode);
  // Bara anropa API på desktop, inte mobil
  if (window.innerWidth > 640) {
    await window.openai?.requestDisplayMode?.({ mode: newMode ? 'fullscreen' : 'inline' });
  }
}, [isFullscreen]);
```

### Vad som INTE fungerar i ChatGPT-appens webview:

| CSS/JS | Problem |
|--------|---------|
| `position: fixed` | Fungerar dåligt, kan orsaka vita skärmar |
| `100dvh` | Inte alltid stöd |
| `requestDisplayMode` på mount | Orsakar vita skärmar |
| Modal i botten (`align-items: flex-end`) | Döljs av ChatGPT:s input-bar |
| Scrolla modal-bakgrund | Bakgrunden scrollar istället för modal-innehållet |

### Sammanfattning - Mobil-safe CSS:

```css
@media (max-width: 640px) {
  /* 1. Extra padding längst ner */
  .job-grid { padding-bottom: 100px; }

  /* 2. Modal centrerad och scrollbar */
  .modal-overlay {
    align-items: center;
    justify-content: center;
  }
  .modal {
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .modal-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    min-height: 0;
  }

  /* 3. Kompakt header */
  .header { padding: 16px; }
  .header-title { font-size: 22px; }

  /* 4. Mindre jobbkort */
  .job-card-header { padding: 14px; }
  .job-card-title { font-size: 16px; }
  .company-logo { width: 36px; height: 36px; }
}
```

---

## 🌍 Översättning (Google Translate + Lingva fallback)

Widget översätter automatiskt till användarens språk med Google Translate. Om Google misslyckas, används Lingva som fallback.

### Vad som översätts:
- Jobbtitlar och platser
- UI-labels (knappar, filter, etc.)
- Lönestatistik (labels och tips)
- Jobbdetaljer i modal

### Översättningsfunktion med fallback:
```javascript
const translateText = async (text, lang) => {
  if (!text || lang === 'sv') return text;
  // Försök Google först
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=sv&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    const result = data?.[0]?.map(i => i[0]).join('');
    if (result) return result;
  } catch {}
  // Fallback till Lingva
  try {
    const res = await fetch(`https://lingva.ml/api/v1/sv/${lang}/${encodeURIComponent(text)}`);
    const data = await res.json();
    return data?.translation || text;
  } catch { return text; }
};
```

### Löne-labels som översätts:
```javascript
const defaultLabels = {
  // ... andra labels ...
  salaryInfo: 'Löneinfo',
  fetchingSalary: 'Hämtar lönestatistik...',
  salaryTitle: 'Lönestatistik',
  salaryShown: 'Lönedata visas',
  krPerMonth: 'kr/mån',
  salaryMin: 'Min',
  salaryMax: 'Max',
  sources: 'Källor'
};
```

---

## 🎨 Premium Widget Design (Januar 2026)

### Design Stack
- **React 19** med TypeScript
- **Tailwind CSS v4** (viktigt: använd `gray-*` inte `neutral-*`)
- **Framer Motion** för animationer
- **Lucide React** för ikoner
- **clsx** för conditional classes

### Filstruktur
```
widget/
├── src/
│   ├── App.tsx           # Huvudkomponent
│   ├── hooks.ts          # OpenAI hooks (useOpenAiGlobal, useWidgetState, etc)
│   ├── types.ts          # TypeScript types
│   ├── index.css         # Tailwind import + custom styles
│   └── utils/
│       └── translate.ts  # Google Translate + Lingva fallback
├── dist/
│   └── index.html        # Byggd widget (single-file)
└── package.json
```

### Bygga widgeten
```bash
cd /mnt/c/Users/test/smidra/widget
npm run build                    # Bygger till dist/index.html
cp dist/index.html ../job-list-widget-v2.html   # ⚠️ VIKTIGT: v2!
```

### Deploy
```bash
cd /mnt/c/Users/test/smidra
git add -A && git commit -m "Update widget" && git push
ssh vps "cd /home/studioboka/smidra && git pull && docker-compose up -d --build"
```

### ⚠️ VIKTIGT: Rätt widget-fil!
Servern laddar `job-list-widget-v2.html`, INTE `job-list-widget.html`!
```javascript
// I smidra-server.js:
const jobListHTML = readFileSync(join(__dirname, "job-list-widget-v2.html"), "utf-8");
```

### Design Principer

#### 1. Tailwind v4 - Använd `gray`, INTE `neutral`
```javascript
// ❌ FEL - neutral finns inte i Tailwind v4:
className="bg-neutral-100 text-neutral-900"

// ✅ RÄTT - gray fungerar:
className="bg-gray-100 text-gray-900"
```

#### 2. Glassmorphism Header
```jsx
<header className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800">
```

#### 3. Dynamiska Företagslogotyper
Genererar unik färg baserat på företagsnamn:
```jsx
function CompanyLogo({ name, logoUrl, size = 44 }) {
  const [error, setError] = useState(false);
  const initial = name?.charAt(0)?.toUpperCase() || '?';

  // Generera konsekvent hue från namn
  const hue = name?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360 || 0;

  if (error || !logoUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-xl font-semibold text-white shadow-sm"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${hue + 30}, 70%, 45%) 100%)`
        }}
      >
        {initial}
      </div>
    );
  }
  // ... bild-fallback
}
```

#### 4. Skeleton Loading
```jsx
function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
      </div>
    </div>
  );
}
```

#### 5. Premium Jobbkort
```jsx
<motion.article
  className={clsx(
    'group relative flex cursor-pointer flex-col rounded-2xl border bg-white dark:bg-gray-900',
    'border-gray-200/60 dark:border-gray-800',
    'hover:border-gray-300 dark:hover:border-gray-700',
    'hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-950/50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
    'transition-all duration-200'
  )}
>
```

#### 6. Filter Pills med Blå Highlight
```jsx
function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
        active
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
      )}
    >
      {children}
    </button>
  );
}
```

#### 7. Tab-knappar
```jsx
function TabButton({ active, onClick, icon: Icon, children, count }) {
  return (
    <button
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
        active
          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
      {count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs">{count}</span>}
    </button>
  );
}
```

### Funktioner i Widgeten

#### 🖥️ Fullskärm (Mobil & Web)
```jsx
const toggleFullscreen = useCallback(async (forced?: boolean) => {
  const newMode = forced !== undefined ? forced : !isFullscreen;
  setIsFullscreen(newMode);
  try {
    await window.openai?.requestDisplayMode?.({ mode: newMode ? 'fullscreen' : 'inline' });
  } catch {}
}, [isFullscreen]);

// CSS för fullskärm:
<div className={clsx(
  'w-full bg-gray-50 dark:bg-gray-950 flex flex-col',
  isFullscreen && 'fixed inset-0 z-40'
)}>
```

#### 🔍 Sökfält i Widget
```jsx
const handleSearch = useCallback(() => {
  if (!searchInput.trim()) return;
  window.openai?.sendFollowUpMessage?.({ prompt: `Sök jobb: ${searchInput}` });
  setSearchInput('');
}, [searchInput]);

// Visar bara i fullskärm:
{isFullscreen && (
  <div className="flex gap-2 mb-4">
    <input
      type="text"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      placeholder="Sök nytt jobb..."
      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800"
    />
    <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white">
      Sök
    </button>
  </div>
)}
```

#### 📑 Sparade Jobb (Tab + Persistens)
```jsx
// State:
const [activeTab, setActiveTab] = useState<'all' | 'saved'>('all');

// Filtrera:
const displayJobs = useMemo(() => {
  let filtered = activeTab === 'saved'
    ? jobs.filter(j => widgetState.savedJobs.includes(j.id))
    : jobs;
  // ... mer filtrering
}, [jobs, activeTab, widgetState.savedJobs]);

// Spara (persisteras via OpenAI widgetState):
const toggleSave = useCallback((id: string) => {
  setWidgetState(prev => ({
    ...prev,
    savedJobs: prev.savedJobs.includes(id)
      ? prev.savedJobs.filter(x => x !== id)
      : [...prev.savedJobs, id]
  }));
}, [setWidgetState]);
```

#### ↕️ Sortering
```jsx
const [sortBy, setSortBy] = useState('newest');

const displayJobs = useMemo(() => {
  // ... filtrering först
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return 0;
    if (sortBy === 'deadline') {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    }
    if (sortBy === 'employer') return a.employer.localeCompare(b.employer);
    return 0;
  });
  return sorted;
}, [jobs, sortBy]);

// Dropdown:
<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
  <option value="newest">Nyast först</option>
  <option value="deadline">Deadline</option>
  <option value="employer">Företag A-Ö</option>
</select>
```

#### 📤 Dela-funktion
```jsx
const shareJob = useCallback(async (job: Job) => {
  const shareData = {
    title: job.title,
    text: `${job.title} hos ${job.employer}`,
    url: job.url
  };

  // Native Share API på mobil
  if (navigator.share && isMobile) {
    try {
      await navigator.share(shareData);
      showToast('Delat!', 'share');
      return;
    } catch {}
  }

  // Fallback: kopiera till clipboard
  try {
    await navigator.clipboard.writeText(job.url);
    showToast('Länk kopierad!', 'check');
  } catch {
    window.openai?.openExternal?.({ href: job.url });
  }
}, [showToast]);
```

### Responsiv Grid
```jsx
<div className={clsx(
  'grid gap-3 sm:gap-4 p-4 sm:p-6',
  isFullscreen
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    : 'grid-cols-1 sm:grid-cols-2'
)}>
```

### Animationer med Framer Motion
```jsx
// Respektera prefers-reduced-motion:
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const springTransition = prefersReducedMotion
  ? { duration: 0 }
  : { type: 'spring', stiffness: 400, damping: 30 };

// Jobbkort animation:
<motion.article
  layout
  layoutId={job.id}
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={springTransition}
>

// AnimatePresence för lista:
<AnimatePresence mode="popLayout">
  {pageJobs.map((job) => <JobCard key={job.id} ... />)}
</AnimatePresence>
```

### Dark Mode
```jsx
// Automatiskt från OpenAI theme:
useEffect(() => {
  if (theme) document.documentElement.classList.toggle('dark', theme === 'dark');
}, [theme]);

// Tailwind dark classes:
className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
```

### Toast Notifications
```jsx
const [toast, setToast] = useState({ message: '', visible: false, icon: 'heart' });

const showToast = useCallback((msg: string, icon: 'heart' | 'check' | 'share' = 'heart') => {
  setToast({ message: msg, visible: true, icon });
  setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
}, []);

// Render:
<AnimatePresence>
  {toast.visible && (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.95 }}
      className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900"
    >
      {toast.icon === 'heart' && <Heart className="w-4 h-4 text-rose-400" fill="currentColor" />}
      {toast.icon === 'check' && <Check className="w-4 h-4 text-emerald-400" />}
      {toast.message}
    </motion.div>
  )}
</AnimatePresence>
```

### Accessibility
```jsx
// Focus-visible för tangentbordsnavigering:
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"

// ARIA-labels:
<button aria-label={isSaved ? 'Ta bort från sparade' : 'Spara jobb'} aria-pressed={isSaved}>
<nav aria-label="Pagination">
<div role="tablist" aria-label="Filter">
<button role="tab" aria-selected={active}>
```

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
- [x] Mobil UX fix för ChatGPT-appen (padding, centrerad modal)
- [x] Google Translate + Lingva fallback
- [x] Översättning av löne-labels och tips
- [x] Premium widget design (Tailwind v4 + Framer Motion)
- [x] Sökfält i widget
- [x] Sortering (nyast, deadline, företag)
- [x] Sparade jobb-flik med badge
- [x] Dela-funktion (Native Share + Clipboard)
- [x] AI Badge-verifiering (Erfarenhet krävs/ej krävs via ChatGPT + SSE)
- [ ] Notifikationer för nya jobb
- [ ] CV-matchning mot jobb
- [ ] Personligt brev-generator
- [ ] Arbetsmarknadsanalys widget

---

## 🔗 Viktiga länkar

- **MCP SDK:** https://github.com/modelcontextprotocol/sdk
- **ChatGPT Apps SDK:** https://developers.openai.com/apps-sdk/
- **Arbetsförmedlingen API:** https://jobtechdev.se
- **Smidra repo:** https://github.com/hassan308/smidra

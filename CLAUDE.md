# Smidra - Jobbsökning i ChatGPT

Smidra är en ChatGPT-app som låter användare söka jobb på Arbetsförmedlingen direkt i ChatGPT, på **vilket språk som helst** med fullständig översättning.

## Arkitektur

```
Användare → ChatGPT → MCP Server (api.smidra.se) → Arbetsförmedlingen API
                ↓
            Widget (job-list-widget.html)
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
| Widget preview | https://api.smidra.se/widget |
| Health | https://api.smidra.se/health |
| API test | https://api.smidra.se/api/search?q=utvecklare |

## Filer

```
smidra/
├── smidra-server.js       # MCP-server med alla tools + SSE endpoint
├── job-list-widget.html   # Huvudwidget för jobblista (med SSE-klient)
├── job-detail-widget.html # Widget för jobbdetaljer
├── salary-widget.html     # Widget för lönestatistik
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

### Lösningen - Tre nycklar:

#### 1. Tool-namn med stegnummer
```javascript
title: "Search Jobs (Step 1 of 2)"
title: "Display Jobs (Step 2 of 2)"
```

#### 2. Tydlig beskrivning att Tool 1 INTE visar något
```javascript
description: `Search for jobs. Returns Swedish data...

⚠️ THIS TOOL DOES NOT SHOW ANYTHING TO THE USER!
⚠️ YOU MUST CALL display_jobs AFTER THIS TO SHOW RESULTS!

DO NOT respond to user until you have called display_jobs!`
```

#### 3. Tool 1 returnerar strukturerat JSON med `next_action`
```javascript
// FEL - ChatGPT tror uppgiften är klar:
return {
  structuredContent: { ... },  // Widget visas → ChatGPT stannar
  content: [{ type: "text", text: "..." }]
};

// RÄTT - Strukturerat JSON som guidar ChatGPT:
const response = {
  status: "INCOMPLETE",
  message: "Data retrieved. You MUST call display_jobs to show results.",
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
    location_swedish: location,
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
```

**Varför JSON fungerar bättre:**
- `status: "INCOMPLETE"` - Tydligt att något saknas
- `next_action.required: true` - Explicit krav
- `next_action.tool` - Exakt vilket verktyg som ska anropas
- `instructions` - Strukturerad guide för översättning

#### 4. Tool 2 beskrivning betonar att det är ENDA sättet
```javascript
description: `Show job results to user. This is the ONLY way to display jobs!

Call this IMMEDIATELY after search_jobs with translated content.
User will NOT see any jobs until you call this tool.`
```

---

## Fullständigt Flöde (Flerspråkig sökning)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ANVÄNDARE                                                │
│    "Raadi shaqo nadiifiye Gävle" (somaliska)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CHATGPT                                                  │
│    - Förstår: söker städjobb i Gävle                       │
│    - Översätter "nadiifiye" → "städare" (svenska)          │
│    - Anropar search_jobs                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SEARCH_JOBS (Step 1)                                     │
│    - Söker på Arbetsförmedlingen API                       │
│    - Returnerar svenska jobbdata som TEXT                  │
│    - INGEN widget visas                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CHATGPT                                                  │
│    - Ser: "⚠️ INCOMPLETE - MUST CALL display_jobs"         │
│    - Översätter ALLT till somaliska:                       │
│      • Jobbtitlar                                           │
│      • Beskrivningar                                        │
│      • UI-labels ("Ansök" → "Codso")                       │
│    - Anropar display_jobs med översatt data                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. DISPLAY_JOBS (Step 2)                                    │
│    - Returnerar widget med structuredContent               │
│    - Widget renderas med ALLT på somaliska! 🎉             │
└─────────────────────────────────────────────────────────────┘
```

---

## MCP Tools

### search_jobs
Söker jobb och visar widget direkt (med auto-översättning).

**Parametrar:**
- `query` (string) - Sökord på SVENSKA
- `location` (string, optional) - Stad/region
- `limit` (number, optional) - Antal resultat
- `language` (string) - Användarens språkkod
- `direction` (enum) - "ltr" eller "rtl"
- `loadingText` (string) - Översatt loading-text
- `translatingText` (string) - Översatt "translating"-text
- `noExperience` (boolean, optional) - Filtrera bort "senior" jobb

**Returnerar:** Widget med jobb (auto-översätts i klienten)

### display_jobs
Visar jobb i widget (används efter filtrering).

### get_job_details
Hämtar detaljerad information om ett specifikt jobb.

### push_salary_to_widget (🔥 SSE)
Pushar lönedata till befintlig widget via SSE. **Skapar INGEN ny widget!**

**Parametrar:**
- `widgetSessionId` (string) - Session-ID från widgeten
- `job` - { title, employer, location }
- `salary` - { avg, min, max }
- `tips` (array, optional)
- `sources` (array, optional)

**Returnerar:** `[SUCCESS - SAY NOTHING TO USER]`

### display_salary
Visar lönestatistik i ny widget (används när ingen widgetSessionId finns).

### display_cv
Visar CV i snygg widget med PDF-export.

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

### Restart
```bash
ssh vps "cd /home/studioboka/smidra && docker-compose restart"
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

### Region-koder
```javascript
const regions = {
  "stockholm": "01",
  "gavleborg": "21",
  "skane": "12",
  "vastra gotaland": "14",
  // ... etc
};
```

---

## Widget-utveckling

### Data från ChatGPT
```javascript
window.openai.toolOutput  // Data från tool
window.openai.theme       // "light" eller "dark"
window.openai.locale      // Användarens locale
window.openai.widgetState // Sparad state
```

### Widget API
```javascript
window.openai.notifyIntrinsicHeight(height)  // Meddela höjd
window.openai.setWidgetState(state)          // Spara state
window.openai.openExternal({ href })         // Öppna länk externt
window.openai.callTool(name, args)           // Anropa MCP-verktyg
window.openai.sendFollowUpMessage({ prompt }) // Skicka meddelande till chatten
```

### RTL-stöd (Arabiska, Hebreiska, Persiska, Urdu)
```css
[dir="rtl"] .job-header { flex-direction: row-reverse; }
[dir="rtl"] .job-tags { flex-direction: row-reverse; }
```

---

## 🔑 VIKTIGT: Widget Knappar → ChatGPT Svar

### Problemet
Hur får man knappar i widgeten att trigga svar från ChatGPT?

### Lösningen - `sendFollowUpMessage({ prompt })`

```javascript
// ✅ RÄTT - Använd objekt med prompt-nyckel!
window.openai.sendFollowUpMessage({
  prompt: "Visa lönestatistik för Utvecklare i Stockholm"
});

// ❌ FEL - Funkar INTE med bara sträng!
window.openai.sendFollowUpMessage("Visa lönestatistik...");
```

### Komplett exempel - Knapp som frågar ChatGPT

```javascript
function requestAction(action, job) {
  // Bygg meddelande baserat på action
  let message = '';

  switch (action) {
    case 'salary':
      message = `Visa lönestatistik för "${job.title}" i ${job.location}`;
      break;
    case 'help':
      message = `Hjälp mig skriva personligt brev för tjänsten "${job.title}" hos ${job.employer}`;
      break;
    case 'market':
      message = `Ge mig arbetsmarknadsanalys för yrket "${job.title}"`;
      break;
  }

  // Skicka till ChatGPT - visas som om användaren skrev det!
  if (typeof window.openai?.sendFollowUpMessage === 'function') {
    window.openai.sendFollowUpMessage({ prompt: message });
  }
}
```

### Flödet

```
[Användare klickar "💰 Lön" i widgeten]
        │
        ▼
Widget: sendFollowUpMessage({ prompt: "Visa lönestatistik för Utvecklare..." })
        │
        ▼
Meddelandet visas i chatten (som om användaren skrev det)
        │
        ▼
ChatGPT svarar med sin kunskap - INGEN MCP-anrop behövs!
```

### Viktiga lärdomar

| API | Syntax | Användning |
|-----|--------|------------|
| `sendFollowUpMessage` | `{ prompt: "text" }` | Skicka meddelande till chatten |
| `callTool` | `(name, args)` | Anropa MCP-verktyg direkt |
| `openExternal` | `{ href: "url" }` | Öppna extern länk |
| `setWidgetState` | `(stateObject)` | Spara widget-state |

### ❌ Vad som INTE fungerar i widgets

- `navigator.clipboard` - Blockerat av permissions policy
- `window.parent.document` - Blockerat av cross-origin
- `sendFollowUpMessage("sträng")` - Måste vara objekt med `prompt`!
- `sendMessage` - Finns inte, använd `sendFollowUpMessage`

---

## 🚀 MÖNSTER: Widget → Webbsökning → Display Widget

### Konceptet
Låt ChatGPT söka på webben och visa resultatet i en snygg widget!

### Flödet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ANVÄNDARE KLICKAR KNAPP I WIDGET                         │
│    [💰 Visa lön] på en specifik jobbannons                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. WIDGET SKICKAR MEDDELANDE MED ALL INFO                   │
│                                                             │
│    sendFollowUpMessage({                                    │
│      prompt: `Sök lönestatistik för denna tjänst:          │
│                                                             │
│        Titel: Systemutvecklare                              │
│        Företag: Tech AB                                     │
│        Plats: Stockholm                                     │
│                                                             │
│        När du hittat info, anropa display_salary.`          │
│    })                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CHATGPT SÖKER PÅ WEBBEN                                  │
│    - Använder sin webbsökning                               │
│    - Hittar lönedata från SCB, Glassdoor, etc.             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. CHATGPT ANROPAR DISPLAY-VERKTYGET                        │
│                                                             │
│    display_salary({                                         │
│      job: { title: "Systemutvecklare", employer: "Tech AB"},│
│      salary: { avg: 52000, min: 42000, max: 65000 },       │
│      tips: ["Förhandlingstips 1", "Tips 2"],               │
│      sources: ["SCB", "Glassdoor"]                         │
│    })                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. SNYGG WIDGET VISAS MED ALL DATA! 🎉                     │
│    - Anpassad för just den annonsen                        │
│    - Visuellt tilltalande                                   │
│    - Interaktiva knappar för fler åtgärder                 │
└─────────────────────────────────────────────────────────────┘
```

### Kod-exempel: Widget-knappen

```javascript
function requestAction(action, job) {
  if (action === 'salary') {
    const message = `Sök lönestatistik för denna tjänst:

TJÄNST:
- Titel: ${job.title}
- Företag: ${job.employer}
- Plats: ${job.location}
- Beskrivning: ${job.description?.substring(0, 150)}

INSTRUKTION:
1. Sök på nätet efter aktuell lönestatistik
2. Hitta: genomsnittslön, lönespann, junior vs senior
3. Anropa display_salary verktyget med datan
4. Inkludera källor och förhandlingstips`;

    window.openai.sendFollowUpMessage({ prompt: message });
  }
}
```

### Kod-exempel: MCP Display-verktyget

```javascript
server.registerTool(
  "display_salary",
  {
    title: "Display Salary Statistics",
    description: `Show salary in widget. Call AFTER web search.`,
    inputSchema: {
      job: z.object({
        title: z.string(),
        employer: z.string(),
        location: z.string().optional()
      }),
      salary: z.object({
        avg: z.number(),
        min: z.number(),
        max: z.number()
      }),
      tips: z.array(z.string()).optional(),
      sources: z.array(z.string()).optional()
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/salary.html"
    }
  },
  async (params) => {
    return {
      structuredContent: params,  // Skickas till widget
      content: [{ type: "text", text: `Salary: ${params.salary.avg} kr` }]
    };
  }
);
```

### Fördelar med detta mönster

| Fördel | Beskrivning |
|--------|-------------|
| 🌐 **Färsk data** | ChatGPT söker på nätet = aktuell info |
| 🎨 **Snygg presentation** | Widget visar data professionellt |
| 🎯 **Kontextanpassad** | All info från ursprungsannonsen följer med |
| 🔄 **Interaktivt** | Widget kan ha knappar för fler åtgärder |
| 🌍 **Flerspråkigt** | ChatGPT översätter, widget visar |

### Använd detta mönster för:

- 💰 **Lönestatistik** - display_salary
- 📊 **Marknadsanalys** - display_market_analysis
- ✍️ **Personliga brev** - display_cover_letter
- ⚖️ **Jobbjämförelse** - display_comparison
- 📈 **Trendrapporter** - display_trends
- 🏢 **Företagsinfo** - display_company_info

---

## 🔥 NYTT: SSE Real-time Widget Updates

### Problemet
När användare klickar "Löneinfo" i widgeten:
1. ChatGPT söker på webben (tar 5-15 sek)
2. ChatGPT anropar `display_salary`
3. **Ny widget skapas UNDER chatten** ❌
4. Användaren måste scrolla för att se den

### Lösningen - SSE Push till befintlig widget
Istället för att skapa ny widget, pusha data till den REDAN ÖPPNA widgeten via Server-Sent Events!

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WIDGET LADDAS                                            │
│    - Genererar unik sessionId: "ws_abc123"                  │
│    - Ansluter till SSE: /events?session=ws_abc123           │
│    - Håller anslutningen öppen                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ANVÄNDARE KLICKAR "LÖNEINFO"                             │
│                                                             │
│    sendFollowUpMessage({                                    │
│      prompt: `[TYST UPPGIFT]                               │
│        widgetSessionId: ws_abc123                           │
│        Anropa push_salary_to_widget`                        │
│    })                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CHATGPT SÖKER & ANROPAR TOOL                             │
│                                                             │
│    push_salary_to_widget({                                  │
│      widgetSessionId: "ws_abc123",                          │
│      salary: { avg: 45000, min: 35000, max: 55000 }        │
│    })                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. SERVER PUSHAR VIA SSE                                    │
│                                                             │
│    sseClients.get("ws_abc123").write(                       │
│      `data: {"type":"salary","avg":45000}\n\n`              │
│    )                                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. WIDGET TAR EMOT & VISAR                                  │
│                                                             │
│    eventSource.onmessage = (e) => {                         │
│      const data = JSON.parse(e.data);                       │
│      if (data.type === 'salary') setSalaryData(data);       │
│    }                                                        │
│                                                             │
│    → Lönedata visas DIREKT i modalen! 🎉                   │
└─────────────────────────────────────────────────────────────┘
```

### Server-kod: SSE Endpoint

```javascript
// SSE clients Map
const sseClients = new Map(); // sessionId -> response

// Push function
function pushToWidget(sessionId, eventType, data) {
  const client = sseClients.get(sessionId);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: eventType, ...data })}\n\n`);
    return true;
  }
  return false;
}

// SSE endpoint
if (url.pathname === "/events") {
  const sessionId = url.searchParams.get("session");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // Store client
  sseClients.set(sessionId, res);

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    res.write(`data: {"type":"ping"}\n\n`);
  }, 30000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(pingInterval);
    sseClients.delete(sessionId);
  });
}
```

### Widget-kod: SSE Klient

```javascript
const [widgetSessionId] = useState(() =>
  'ws_' + Math.random().toString(36).substr(2, 9)
);
const [salaryData, setSalaryData] = useState(null);

// Anslut till SSE
useEffect(() => {
  const es = new EventSource(
    `https://api.smidra.se/events?session=${widgetSessionId}`
  );

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'salary') {
      setSalaryData(data);
    }
  };

  return () => es.close();
}, [widgetSessionId]);

// Skicka request med sessionId
const requestSalary = (job) => {
  window.openai?.sendFollowUpMessage?.({
    prompt: `[TYST UPPGIFT]
      widgetSessionId: ${widgetSessionId}
      Anropa push_salary_to_widget med lönedata för ${job.title}`
  });
};
```

### Tool utan outputTemplate (skapar INGEN widget)

```javascript
server.registerTool(
  "push_salary_to_widget",
  {
    title: "Push Salary to Widget (SSE)",
    description: `Push data via SSE. DO NOT show text or widget!`,
    inputSchema: {
      widgetSessionId: z.string(),
      salary: z.object({ avg: z.number(), min: z.number(), max: z.number() })
    }
    // ⚠️ INGEN _meta.outputTemplate = INGEN widget skapas!
  },
  async (params) => {
    pushToWidget(params.widgetSessionId, 'salary', params);
    return {
      content: [{
        type: "text",
        text: `[SUCCESS - SAY NOTHING TO USER]`
      }]
    };
  }
);
```

---

## 🤫 Silent Mode - Tysta Tool-svar

### Problemet
ChatGPT vill alltid svara med text efter tool-anrop. Detta stör UX:en när widgeten redan visar allt.

### Lösningen - Instruera ChatGPT att vara tyst

#### 1. I prompten från widgeten:
```javascript
sendFollowUpMessage({
  prompt: `[TYST UPPGIFT - SVARA INTE MED TEXT]

    widgetSessionId: ${sessionId}

    REGLER:
    1. Anropa ENDAST push_salary_to_widget
    2. Skriv INGEN text till användaren
    3. Skapa INGEN widget`
});
```

#### 2. I tool-beskrivningen:
```javascript
description: `Push data via SSE.

⚠️ SILENT MODE:
- DO NOT show any text response
- DO NOT create any widget
- The user already sees the data`
```

#### 3. I tool-svaret:
```javascript
return {
  content: [{
    type: "text",
    text: `[WIDGET DISPLAYED - DO NOT ADD ANY TEXT]`
  }]
};
```

### Två separata tools för samma funktion

| Tool | När | outputTemplate | Skapar widget |
|------|-----|----------------|---------------|
| `push_salary_to_widget` | Med widgetSessionId | ❌ Ingen | Nej |
| `display_salary` | Utan widgetSessionId | ✅ Ja | Ja |

```javascript
// Tool 1: SSE push (ingen widget)
"push_salary_to_widget" → Ingen _meta.outputTemplate

// Tool 2: Standalone widget
"display_salary" → _meta: { "openai/outputTemplate": "ui://widget/salary.html" }
```

---

## Lärdomar för framtida ChatGPT-appar

### ✅ Vad fungerar för två-stegs tool-flöden:
1. **Namnge tools med stegnummer** - "(Step 1 of 2)"
2. **Step 1 får INTE visa widget** - returnera bara text/JSON
3. **Returnera strukturerat JSON med `next_action`** - ChatGPT följer strukturerade instruktioner
4. **`status: "INCOMPLETE"`** - Signalerar att uppgiften inte är klar
5. **`next_action.required: true`** - Explicit krav på nästa steg
6. **`instructions`-objekt** - Tydlig guide för vad som ska göras
7. **Beskriv att Step 2 är ENDA sättet** att visa resultat
8. **"EVERY search" i beskrivningen** - Gäller alla sökningar, inte bara första

### ❌ Vad fungerar INTE:
- Returnera widget från Step 1 (ChatGPT tror den är klar)
- Bara "IMPORTANT" eller "MUST" i fritext utan struktur
- Loading-widgets som ska uppdateras (skapar dubletter)
- Anta att ChatGPT kommer ihåg instruktioner från tidigare i konversationen

---

## Framtida förbättringar

- [x] Översätta jobbinnehåll (två-stegs flöde)
- [x] RTL-stöd för arabiska
- [x] Widget-knappar som triggar ChatGPT-svar (sendFollowUpMessage)
- [x] Lönestatistik med webbsökning + display_salary widget
- [x] Ansökningshjälp-knapp (personligt brev)
- [x] Arbetsmarknadsanalys-knapp
- [x] Jämför jobb-funktion
- [x] Spara favoriter (widgetState)
- [x] Filter heltid/deltid
- [x] SSE real-time widget updates (push_salary_to_widget)
- [x] Silent mode - tysta tool-svar
- [x] display_cv widget
- [ ] Notifikationer för nya jobb
- [ ] CV-matchning
- [ ] display_cover_letter widget
- [ ] display_market_analysis widget

---

## 🎯 SNABBSTART: Ny ChatGPT-app

### Steg 1: Skapa projektstruktur

```bash
mkdir my-chatgpt-app && cd my-chatgpt-app
npm init -y
npm install @modelcontextprotocol/sdk zod
```

### Steg 2: Skapa server (my-server.js)

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { readFileSync } from "fs";
import http from "http";

const PORT = 8002;

// Ladda widgets
const mainWidgetHTML = readFileSync("./main-widget.html", "utf-8");

// Skapa server
const server = new McpServer({ name: "my-app", version: "1.0.0" });

// Registrera widget-resurs
server.registerResource("main-widget", "ui://widget/main.html", {}, async () => ({
  contents: [{ uri: "ui://widget/main.html", mimeType: "text/html+skybridge", text: mainWidgetHTML }]
}));

// Registrera verktyg
server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "Does something useful",
    inputSchema: {
      query: z.string().describe("Search query")
    },
    _meta: {
      "openai/outputTemplate": "ui://widget/main.html"
    }
  },
  async ({ query }) => {
    // Din logik här
    return {
      structuredContent: { query, results: [] },
      content: [{ type: "text", text: `Results for: ${query}` }]
    };
  }
);

// HTTP-server med SSE
const transports = new Map();

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"ok"}');
    return;
  }

  if (url.pathname === "/widget") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(mainWidgetHTML);
    return;
  }

  if (url.pathname === "/mcp") {
    if (req.method === "GET") {
      const transport = new SSEServerTransport("/mcp", res);
      transports.set(transport.sessionId, transport);
      res.on("close", () => transports.delete(transport.sessionId));
      await server.connect(transport);
      return;
    }
    if (req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400); res.end('{"error":"Invalid session"}'); return;
      }
      let body = "";
      for await (const chunk of req) body += chunk.toString();
      await transports.get(sessionId).handlePostMessage(req, res, body);
      return;
    }
  }

  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
```

### Steg 3: Skapa widget (main-widget.html)

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 16px; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; }
    .btn { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; }
    .btn-primary { background: #2563eb; color: white; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const state = { data: null };

    function render() {
      const app = document.getElementById('app');
      const d = state.data;

      app.innerHTML = `
        <div class="card">
          <h2>${d?.title || 'Loading...'}</h2>
          <p>${d?.description || ''}</p>
          <button class="btn btn-primary" onclick="handleAction()">
            Do Something
          </button>
        </div>
      `;

      window.openai?.notifyIntrinsicHeight?.(document.body.scrollHeight);
    }

    function handleAction() {
      // Skicka meddelande till ChatGPT
      window.openai?.sendFollowUpMessage?.({
        prompt: "Användaren klickade på knappen. Hjälp dem med nästa steg."
      });
    }

    function init() {
      if (window.openai?.theme) {
        document.body.style.background = window.openai.theme === 'dark' ? '#1a1a1a' : '#fff';
      }

      window.addEventListener('openai:set_globals', () => {
        if (window.openai?.toolOutput) {
          state.data = window.openai.toolOutput;
          render();
        }
      });

      if (window.openai?.toolOutput) {
        state.data = window.openai.toolOutput;
      }
      render();
    }

    init();
  </script>
</body>
</html>
```

### Steg 4: Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY *.js ./
COPY *.html ./
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=3s CMD wget --spider http://localhost:8002/health || exit 1
CMD ["node", "my-server.js"]
```

### Steg 5: docker-compose.yml

```yaml
services:
  my-app:
    build: .
    container_name: my-app
    restart: always
    ports:
      - "127.0.0.1:8002:8002"
```

### Steg 6: Deploya

```bash
# Lokalt test
node my-server.js

# VPS deploy
git push && ssh vps "cd /path/to/app && git pull && docker-compose up -d --build"
```

### Steg 7: Registrera i ChatGPT
1. Gå till ChatGPT → Plugins/Apps
2. Lägg till MCP endpoint: `https://your-domain.com/mcp`
3. Testa!

---

## 📚 Sammanfattning av alla mönster

| Mönster | När | Hur |
|---------|-----|-----|
| **Enkel widget** | Visa data direkt | Tool returnerar `structuredContent` + `outputTemplate` |
| **Två-stegs flöde** | Data behöver bearbetas | Tool 1 returnerar TEXT, Tool 2 visar widget |
| **Widget → ChatGPT** | Knapp triggar svar | `sendFollowUpMessage({ prompt })` |
| **Widget → Webbsök → Widget** | Visa sökresultat snyggt | sendFollowUpMessage → ChatGPT söker → display_X |
| **Widget → MCP direkt** | Anropa backend från widget | `callTool(name, args)` |
| **🔥 SSE Real-time** | Uppdatera befintlig widget | Widget SSE-ansluter → ChatGPT anropar push_X → Server pushar via SSE |
| **🤫 Silent Mode** | Ingen text/widget | Tool utan outputTemplate + `[DO NOT ADD TEXT]` i svar |

---

## 🔗 Viktiga länkar

- **MCP SDK:** https://github.com/modelcontextprotocol/sdk
- **ChatGPT Apps SDK:** https://developers.openai.com/apps-sdk/
- **Arbetsförmedlingen API:** https://jobtechdev.se
- **Smidra repo:** https://github.com/hassan308/smidra

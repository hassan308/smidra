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
| Widget preview | https://api.smidra.se/widget |
| Health | https://api.smidra.se/health |
| API test | https://api.smidra.se/api/search?q=utvecklare |

## Filer

```
smidra/
├── smidra-server.js      # MCP-server med alla tools
├── job-list-widget.html  # Huvudwidget för jobblista
├── job-detail-widget.html # Widget för jobbdetaljer
├── package.json          # Dependencies
├── Dockerfile            # Docker-konfiguration
├── docker-compose.yml    # Docker Compose
└── CLAUDE.md             # Denna fil
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

### search_jobs (Step 1 of 2)
Söker jobb, returnerar data för översättning.

**Parametrar:**
- `query` (string) - Sökord på SVENSKA
- `location` (string, optional) - Stad/region
- `limit` (number, optional) - Antal resultat
- `language` (string) - Användarens språkkod
- `direction` (enum) - "ltr" eller "rtl"
- `loadingText` (string) - Översatt loading-text
- `translatingText` (string) - Översatt "translating"-text

**Returnerar:** TEXT med jobbdata (ingen widget!)

### display_jobs (Step 2 of 2)
Visar översatta jobb i widget.

**Parametrar:**
- `language`, `direction` - Språkinställningar
- `query`, `location`, `total` - Sökinfo (översatt)
- `labels` - Alla UI-texter översatta
- `jobs` - Array med översatta jobb

**Viktigt för jobs-array:**
- `id` - BEHÅLL ORIGINAL (ändra ej!)
- `url` - BEHÅLL ORIGINAL (ändra ej!)
- `employer` - Behåll original
- `title`, `description`, `location` - ÖVERSÄTT
- `deadline`, `employmentType`, `salaryType` - ÖVERSÄTT

### get_job_details
Hämtar detaljerad information om ett specifikt jobb.

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
```

### Widget API
```javascript
window.openai.notifyIntrinsicHeight(height)  // Meddela höjd
window.openai.setWidgetState(state)          // Spara state
window.openai.openExternal({ href })         // Öppna länk
```

### RTL-stöd (Arabiska, Hebreiska, Persiska, Urdu)
```css
[dir="rtl"] .job-header { flex-direction: row-reverse; }
[dir="rtl"] .job-tags { flex-direction: row-reverse; }
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
- [ ] Spara favoriter
- [ ] Filter på yrkeskategori
- [ ] Notifikationer för nya jobb

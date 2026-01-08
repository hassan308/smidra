# Smidra - Jobbsökning i ChatGPT

Smidra är en ChatGPT-app som låter användare söka jobb på Arbetsförmedlingen direkt i ChatGPT, på vilket språk som helst.

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

## MCP Tools

### search_jobs
Söker jobb på Arbetsförmedlingen.

**Parametrar:**
- `query` (string) - Sökord på svenska (t.ex. "utvecklare", "sjuksköterska")
- `location` (string, optional) - Stad eller region (t.ex. "Stockholm", "Gävle")
- `limit` (number, optional) - Antal resultat (default: 5)
- `language` (string, optional) - Språkkod för UI (t.ex. "ar", "en", "sv")

**Flerspråksstöd:**
- UI-labels finns på: Svenska, Engelska, Arabiska, Spanska, Kinesiska, Tyska, Franska
- RTL-stöd för Arabiska och Hebreiska
- ChatGPT skickar `language` parameter baserat på användarens språk

### get_job_details
Hämtar detaljerad information om ett specifikt jobb.

### display_jobs / display_job_detail
Backup-tools för att visa översatt data (används sällan).

## Flöde för flerspråkig sökning (två-stegs)

```
1. Användare skriver på somaliska: "Waxaan raadinayaa shaqo Stockholm"
2. ChatGPT → search_jobs({ query: "utvecklare", location: "Stockholm" })
3. Server returnerar svenska jobb som TEXT (ingen widget än)
4. ChatGPT översätter ALLT till somaliska:
   - Jobbtitlar
   - Beskrivningar
   - Platsnamn
   - UI-labels
5. ChatGPT → display_jobs({ language: "so", direction: "ltr", labels: {...}, jobs: [...] })
6. Widget renderas med ALLT på somaliska! 🎉
```

**Stöder ALLA språk** - ChatGPT översätter dynamiskt till vilket språk som helst.

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

## VPS Info

- **Host:** 95.216.174.250
- **User:** studioboka
- **SSH:** `ssh vps` (konfigurerat i ~/.ssh/config)
- **Projekt-path:** /home/studioboka/smidra

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
window.openai.callTool(name, args)           // Anropa tool (framtida)
```

### RTL-stöd
```css
[dir="rtl"] .job-header {
  flex-direction: row-reverse;
}
```

## Framtida förbättringar

- [ ] Översätta jobbinnehåll (inte bara UI)
- [ ] Spara favoriter
- [ ] Filter på yrkeskategori
- [ ] Notifikationer för nya jobb
- [ ] Widget-knappar som triggar tool calls

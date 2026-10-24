# CaseBoard AI

> **Real-time investigation decision support that finds contradictions and gaps, and never decides guilt.**

Built for the **DigitalOcean Hackathon: "Build with DigitalOcean, combine Gradient AI with cloud infrastructure."**  
Targeted for **DigitalOcean Serverless Inference (Gradient AI)** and hosted on **DigitalOcean App Platform**.

---

## ⚖️ Permanent Safeguards & Ethics Principle

```
DECISION SUPPORT ONLY. NOT EVIDENCE. HUMAN REVIEW REQUIRED.
FICTIONAL CASE • SYNTHETIC DATA ONLY • NEVER DECIDES GUILT
```

1. **No Guilt Scoring**: CaseBoard AI never computes guilt probabilities, credibility scores, or verdicts.
2. **Anti-Profiling**: Demographic attributes (race, religion, appearance, neighborhood) are never ingested or scored.
3. **Victim Dignity & Privacy**: Victim names are protected under alias display by default (`D. R. (Victim)`).
4. **Trauma Sensitivity Guarantee**: For sexual violence and acute trauma cases, survivor accounts are **never** scored for consistency because neurobiological fragmentation in trauma memory is standard. The system strictly records faithfully and flags missing physical documentation.
5. **Anti-Hallucination Gate**: Every extracted fact requires an exact verbatim character match against the source text. Model hallucinations and loose paraphrasing are immediately rejected at the backend gate.

---

## 🎯 The Demo Case: "The Riverside Warehouse Murder"

- **Victim**: Daniyal Rauf (Alias: `D. R.`), warehouse manager, discovered at 6:40 AM.
- **Forensic TOD Window**: 9:30 PM to 11:00 PM (21:30 - 23:00) established by Dr. Vance.
- **People of Interest**:
  - **Ali** (Warehouse Employee, Suspect)
  - **Sara** (Night Security Guard, Witness)
  - **Hamza** (Business Partner, Suspect)
  - **Nadia** (Residential Neighbor, Witness)

### 🔑 Planted Contradictions Answer Key (Quality Target: 4/4 Caught, 0 False Alarms)

| # | Planted Contradiction | Fact A | Fact B | Detection Layer |
|---|---|---|---|---|
| **1** | **Ali's Vehicle Sighting** | Ali claims he left at 9:00 PM and was home asleep in Gulberg from 21:30 onward | Sara saw Ali's silver Honda Civic parked outside near the loading dock at 22:30 | **Rule Layer** (Space-time overlap) |
| **2** | **Hamza's Islamabad Alibi** | Hamza asserts he was out of town all day in Islamabad for vendor meetings | Carrier Tower WH-04 telemetry logs Hamza's mobile ping 180m from the warehouse at 21:45 | **Rule Layer** (Digital telemetry vs statement) |
| **3** | **Nadia's Hearing Conflict** | Nadia Statement #1: "Street was quiet and I heard nothing unusual the whole evening" | Nadia Statement #2: "Distinctly heard a loud argument with shouting inside the warehouse around 10:00 PM" | **AI Layer** (Semantic meaning conflict) |
| **4** | **Sara's Camera Claim** | Sara claims the South Gate camera worked continuously throughout her shift | Hardware telemetry log confirms CAM-02 was offline from 21:15 to 23:30 (manual switch flipped) | **Rule Layer** (Objective hardware log vs claim) |

### ⚠️ Critical Forensic Gap (Leads Panel Target)
- **10:45 PM - 11:15 PM Blackout**: Zero witness statements, mobile pings, or activity logs account for the 30-minute interval before the forensic window closes (23:00) while surveillance was severed.

---

## ⚡ 2-Minute Demo Script

1. **Open the Board**: Navigate to `http://127.0.0.1:8080`. Point out the permanent safeguard banner and privacy alias mode.
2. **Click "Play Live Interview"**: Click the blue button in the header. Watch the audio waveform activate as Sara's statement lines stream in every 2.5 seconds.
3. **Instant Contradiction Alerts**:
   - As line 3 streams in (*"saw Ali's silver Honda Civic..."*), red alert cards immediately pop up **without a page refresh** via Server-Sent Events (SSE).
   - Audio chime triggers.
4. **Compare Side-by-Side**: Click **"Compare Side-by-Side"** on the alert card to display the side-by-side quote diff showing Ali's Gulberg alibi vs Sara's loading dock sighting with verified verbatim badges.
5. **Inspect the Timeline & Leads**:
   - Check the **Master Timeline**: Note the cyan forensic window and the highlighted amber **10:45 - 11:15 PM Critical Forensic Gap**.
   - Open the **Leads Panel**: Review the AI-generated recommendations to subpoena commercial traffic cameras and process the manual electrical breaker.
6. **Case Summary & Audit Trail**:
   - Open **Case Summary**: Inspect the prosecution dossier where every single assertion terminates in a citation `[S1]`, `[F1]`, `[C1]`. Click **Copy Text** or **Export Dossier (Print/PDF)**.
   - Open **Audit Trail**: Show the immutable log recording every intake, fact extraction, and review action.

---

## 🌐 DigitalOcean Deployment & Gradient AI Integration

### 1. Swappable AI Provider Configuration
The application is designed so the AI inference engine is a single configurable setting. You can configure it via the **Settings Modal** (gear icon in the UI) or via environment variables:

| Environment Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `digitalocean`, `openai`, or `fallback` | `digitalocean` |
| `AI_BASE_URL` | Endpoint base URL | `https://inference.do-ai.run/v1` |
| `AI_API_KEY` | DigitalOcean Gradient AI Token | Configurable |
| `AI_MODEL` | Serverless Inference Model | `meta-llama/Llama-3.3-70B-Instruct` |

*Note: If no API key is supplied, CaseBoard AI seamlessly uses its built-in deterministic engine adhering to the exact same prompt schemas so evaluators can run the demo offline.*

### 2. DigitalOcean App Platform Deployment
The repository includes a ready-to-deploy `.do/app.yaml` specification and a production `Dockerfile`:

1. Push this repository to GitHub.
2. In DigitalOcean Cloud Console, navigate to **Apps** -> **Create App**.
3. Select your GitHub repository and link `.do/app.yaml`.
4. Add your `AI_API_KEY` in the environment secrets.
5. Click **Deploy**. DigitalOcean App Platform will automatically build the container and expose port `8080`.

---

## 💻 Local Quickstart

### Prerequisites
- Python 3.10+ (Core app runs with zero external pip dependencies using Python standard library)

### Running the App
```bash
# Clone and enter directory
cd caseboard-ai

# Start the server (serves REST API and Frontend SPA)
python run.py
```
Open your browser at `http://127.0.0.1:8080`.

### Running Verification Tests
```bash
# Test the contradiction engine and anti-hallucination quote validator
python backend/test_pipeline.py

# Test in-process HTTP routes and API handlers
python backend/test_handler_inprocess.py
```

---

## 📁 Repository Structure

```
caseboard-ai/
├── .do/
│   └── app.yaml                  # DigitalOcean App Platform deployment spec
├── backend/
│   ├── ai_service.py             # DO Gradient AI client, prompts, and fallback engine
│   ├── contradiction_engine.py   # Two-tier contradiction detector (Rule + AI layers)
│   ├── database.py               # SQLite schemas, thread-safe connection, audit logger
│   ├── seed_data.py              # "The Riverside Warehouse Murder" baseline & demo data
│   ├── server.py                 # REST API, SSE live event stream, static file server
│   ├── validation.py             # Anti-hallucination verbatim quote validator
│   ├── test_pipeline.py          # Backend quality target verification tests
│   └── test_handler_inprocess.py # HTTP handler integration tests
├── frontend/
│   ├── css/
│   │   └── style.css             # Dark, serious investigative theme & print stylesheet
│   ├── js/
│   │   ├── app.js                # Core SPA controller, SSE listener, modal handlers
│   │   ├── timeline.js           # Master timeline renderer & gap detector
│   │   ├── live_player.js        # Real-time transcript player & audio synthesizer
│   │   └── graph.js              # Interactive evidence link graph (HTML5 Canvas)
│   └── index.html                # Main single-page application dashboard
├── Dockerfile                    # Container definition for App Platform
├── Procfile                      # Buildpack process definition
├── requirements.txt              # Production dependency list
├── run.py                        # Single-command launcher
└── README.md                     # Documentation and architecture guide
```

---

## 🏆 Quality Target Verification Summary

- ✅ **Catches all 4 planted contradictions** (Ali vehicle sighting, Hamza phone ping, Nadia argument, Sara camera status).
- ✅ **Zero false alarms on the demo case** (Compounds correctly recognized as single geographic sites).
- ✅ **Real-time alerts appear within seconds** via Server-Sent Events (SSE) without page refresh.
- ✅ **Every fact has a verified source quote** checked verbatim against the source document.
- ✅ **Critical forensic gap (10:45 - 11:15 PM) highlighted** on timeline and prioritized in leads panel.
- ✅ **Permanent safeguards visibly enforced** with victim alias mode and trauma sensitivity policy.
- ✅ **Urdu language intake supported** with bilingual extraction.
- ✅ **Interactive Evidence Link Graph** rendered dynamically.

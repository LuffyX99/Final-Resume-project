# Understanding the Project — AI Resume Matching & Career Intelligence Platform

This document explains **what the platform does** and **how it does it**, end to end.
It is a comprehensive, plain-language architectural guide written for anyone who needs
to run, demo, evaluate, audit, or extend the project.

---

## 1. What this project is

**AI Resume Matching** is an enterprise-grade AI recruiting and career-intelligence platform
that connects **candidates**, **recruiters**, and **platform administrators**. It moves beyond
rigid keyword-matching ATS systems to evaluate candidate suitability using **384-dimensional
dense semantic embeddings**, **anti-cheating trust analysis**, and **skill gap readiness scoring**.

### Three Core AI Capabilities

1. **Semantic Matching (SBERT):**
   - Encodes job postings and resumes into dense 384-dimensional vector embeddings using the
     `all-MiniLM-L6-v2` Sentence-Transformers architecture.
   - Computes cosine similarity ($1 - \text{cosine\_distance}$) over HNSW vector indexes in PostgreSQL.
   - Captures contextual meaning and synonyms (e.g., "JS" $\leftrightarrow$ "JavaScript", "K8s" $\leftrightarrow$ "Kubernetes", "Postgres" $\leftrightarrow$ "PostgreSQL") with high fidelity ($\ge 0.65$) while preserving clean domain separation ($\le 0.30$).
   - Runs inference off the main asyncio thread in a dedicated worker thread pool, ensuring FastAPI remains non-blocking. Includes a deterministic token-hash projection fallback for offline/isolated environments.

2. **Trust Detection & Anti-Cheating Engine:**
   - Detects adversarial gaming techniques used to manipulate ATS algorithms:
     - **Hidden Text & Prompt Injection:** White-on-white text, transparent fonts (alpha $\le 0.05$), tiny font sizes ($\le 2\,\text{pt}$), off-canvas positioning, and Word `vanish`/`hidden` attributes.
     - **Keyword Stuffing:** Abnormal repetition frequencies ($\ge 10$ occurrences and $\ge 7\%$ non-stopword token density).
     - **Direct Job Description Copy-Pasting:** 5-gram Jaccard matching to catch verbatim JD injection.
   - Computes a granular **Trust Score** ($0.0 - 1.0$) with individual audit flags and severity penalties.
   - Weights the final score: $\text{FinalScore} = 0.70 \times \text{Similarity} + 0.30 \times \text{Trust}$.

3. **Skill Gap & Readiness Scoring:**
   - Normalizes and compares job-required skills against resume skills.
   - Classifies every skill into **Matched**, **Missing**, or **Stale** (configurable staleness assumption: technologies only appearing in older roles $\ge 3$ years ago, or deprecated tech such as Python 2, AngularJS, or Flash).
   - Calculates a **Readiness Score** ($0 - 100$) weighted by skill criticality and staleness penalties.
   - Generates deterministic, actionable learning recommendations with estimated hours, target projects, and certified resource links.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19 SPA)                          │
│                        http://localhost:5173                           │
│   Auth Context │ Role Routing │ useLiveResource │ useRealtimeSync     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST & SSE (/api/*)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Python 3.11+)                    │
│                      http://localhost:8000                             │
│                                                                        │
│   Routers: auth, jobs, resumes, matches, applications, admin, support  │
│   Services: SBERT, Trust Engine, Skill Gap, Pipeline, Email, Events   │
│   Security: Argon2id, JWT (HS256), RBAC Dependencies, SlowAPI Rate Lim │
└───────────────────────┬───────────────────────────┬────────────────────┘
                        │                           │
                        │ SQLAlchemy (asyncpg)      │ Server-Sent Events (SSE)
                        ▼                           ▼
┌──────────────────────────────────────────┐   ┌─────────────────────────┐
│     PostgreSQL 16 + pgvector (Docker)    │   │  Real-Time Event Bus    │
│     localhost:5432                       │   │  ACL-Filtered Streaming │
│     8 Tables + HNSW Vector(384) Indexes │   │  Auto-reconnect + 10s   │
│     Single ACID Transactions             │   │  Fallback Polling       │
└──────────────────────────────────────────┘   └─────────────────────────┘
```

### System Components

| Component | Technology Stack | Port | Responsibility |
|-----------|------------------|------|----------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS | 5173 | Dark Slate UI, role dashboards, modal flows, real-time sync hook |
| **Backend** | Python, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 | 8000 | REST API, SSE event stream, RBAC authorization, AI orchestrations |
| **Database** | PostgreSQL 16 + pgvector extension | 5432 | Relational models, HNSW vector cosine indexes, audit trails |
| **Inference** | Sentence-Transformers (`all-MiniLM-L6-v2`) | In-process | 384-dimensional dense semantic embeddings with offline hashing fallback |

The Vite dev server proxies `/api` and `/health` to `127.0.0.1:8000`. Cross-Origin Resource Sharing (CORS) is configured for both development and production.

---

## 3. Database Schema (9 Tables)

Defined in `apps/api/app/models/` using SQLAlchemy 2.0 Declarative Mapping:

```
                  ┌───────────────┐
                  │     users     │
                  └───────┬───────┘
          ┌───────────────┼───────────────┬────────────────┐
          │ 1:1           │ 1:N           │ 1:N            │ 1:N
          ▼               ▼               ▼                ▼
┌──────────────────┐  ┌───────┐     ┌───────────┐    ┌─────────────────┐
│recruiter_profiles│  │ jobs  │     │  resumes  │    │  notifications  │
└──────────────────┘  └───┬───┘     └─────┬─────┘    └─────────────────┘
                          │ 1:N           │ 1:N
                          ▼               ▼
                      ┌───────────────────────┐
                      │     applications      │
                      └───────────────────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │        matches        │
                      └───────────────────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │support_threads/msgs   │
                      └───────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                              email_otps                                │
  │  (Standalone verification ledger for pre-registration & auth security) │
  └────────────────────────────────────────────────────────────────────────┘
```

### 1. `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key (UUIDv4) |
| `email` | String(255) | Unique, indexed, normalized lowercase |
| `password_hash` | String(255) | Argon2id cryptographic hash |
| `role` | String(20) | RBAC enum: `candidate`, `recruiter`, `admin` |
| `full_name` | String(255) | User's full display name |
| `phone_number` | String(32) | Optional contact phone (E.164 normalized) |
| `age` | Integer | Optional profile age (18 - 100) |
| `gender` | String(32) | Optional self-reported gender |
| `is_active` | Boolean | Account status (moderated by admins) |
| `created_at` / `updated_at` | DateTime | UTC timestamps |

### 2. `recruiter_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID → `users.id` | Unique foreign key (1:1 with recruiter user) |
| `company_name` | String(255) | Recruiter company affiliation |
| `company_website` | String(255) | Optional corporate URL |
| `industry` | String(100) | Business sector / domain |
| `company_size` | String(50) | Team size tier |

### 3. `jobs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `title` | String(255) | Job title |
| `company` | String(255) | Hiring entity name |
| `description` | Text | Full job specifications and role details |
| `embedding` | `Vector(384)` | SBERT embedding with HNSW cosine index (`m=16, ef_construction=64`) |
| `skills` | JSON | Merged list of recruiter and extracted skills |
| `required_skills` | JSON | Recruiter-specified mandatory skills |
| `extracted_skills` | JSON | AI-extracted skills from text |
| `location` | String(255) | Geographic office or Remote |
| `experience` | String(100) | Experience tier (`entry`, `mid`, `senior`, `lead`) |
| `job_type` | String(50) | Employment type (`full-time`, `contract`, `internship`) |
| `status` | String(20) | Lifecycle state: `open`, `closed` |
| `is_taken_down` | Boolean | Admin moderation flag |
| `takedown_reason` | Text | Stored explanation for policy violation |
| `recruiter_id` | UUID → `users.id` | Owning recruiter identifier |

### 4. `resumes`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `candidate_id` | UUID → `users.id` | Owning candidate |
| `candidate_name` | String(255) | Extracted or entered candidate name |
| `content` | Text | Clean extracted resume text |
| `embedding` | `Vector(384)` | SBERT embedding with HNSW cosine index |
| `skills` | JSON | AI-extracted candidate skills |
| `file_name` | String(255) | Original file basename (`resume.pdf`) |

### 5. `matches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `job_id` | UUID → `jobs.id` | Target job |
| `resume_id` | UUID → `resumes.id` | Candidate resume |
| `similarity_score` | Float | $1 - \text{cosine\_distance}$ |
| `shortlisted` | Boolean | Shortlist status flag |
| `bias_reduced` | Boolean | Whether PII was scrubbed |

### 6. `applications`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `job_id` | UUID → `jobs.id` | Target job |
| `candidate_id` | UUID → `users.id` | Submitting candidate |
| `resume_id` | UUID → `resumes.id` | Associated parsed resume |
| `status` | String(32) | `submitted`, `shortlisted`, `rejected`, `withdrawn` |
| `applicant_name` | String(255) | Verified candidate name |
| `applicant_email` | String(255) | Contact email |
| `similarity_score` | Float | SBERT semantic match ($0.0 - 1.0$) |
| `trust_score` | Float | Anti-fraud trust score ($0.0 - 1.0$) |
| `trust_flags` | JSON | Granular detection evidence list |
| `final_score` | Float | Combined score: $0.70 \times \text{Sim} + 0.30 \times \text{Trust}$ ($0.0 - 100.0$) |
| `readiness_score` | Float | Skill alignment score ($0.0 - 100.0$) |
| `skill_gap_analysis`| JSON | Matched, missing, and stale breakdown + learning plan |
| `audit_trail` | JSON | Recruiter override log (actor, timestamp, decision, reason) |

### 7. `notifications`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID → `users.id` | Recipient user |
| `sender_id` | UUID → `users.id` | Dispathing user (recruiter or admin) |
| `job_id` | UUID → `jobs.id` | Related job reference |
| `application_id` | UUID → `applications.id`| Related application |
| `title` | String(255) | In-app notification subject |
| `content` | Text | Formatted notification body |
| `notification_type` | String(50) | `shortlist_invitation`, `support_reply`, `system_notice` |
| `details` | JSON | Schedule, venue, mode, contact person, notes |
| `is_read` | Boolean | Read receipt state |

### 8. `support_threads` & `support_messages`
| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `support_threads` | `id`, `user_id`, `user_role`, `subject`, `category`, `status` (`open`/`resolved`) | Central admin helpdesk ticketing |
| `support_messages`| `id`, `thread_id`, `sender_id`, `sender_role`, `content`, `created_at` | Conversation thread messages |

### 9. `email_otps`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key (UUIDv4) |
| `email` | String(255) | Normalized recipient email (indexed lowercase) |
| `otp_hash` | String(255) | Cryptographic hash (`SHA-256`) of random 6-digit code |
| `purpose` | String(50) | Verification lifecycle purpose (`registration`, `password_reset`) |
| `attempts` | Integer | Failed verification attempts (brute-force defense, max 5) |
| `is_verified` | Boolean | True once OTP is confirmed prior to account creation |
| `expires_at` | DateTime | Expiration timestamp (5-minute window) |
| `cooldown_until`| DateTime | Resend rate limit timestamp (60-second cooldown) |
| `created_at` | DateTime | Timestamp of OTP creation |
| `verified_at` | DateTime | Timestamp when code was successfully verified |
| `consumed_at` | DateTime | Timestamp when verification was finalized on registration |

---

## 4. AI Scoring & Transactional Pipeline

When a candidate applies to an open job, the backend executes an **atomic, single-transaction orchestration** (`ApplicationPipelineService`):

```
Candidate Uploads Resume (PDF/DOCX/Text)
                   │
                   ▼
       1. Authority Validation & Extraction
          • 5MB size limit, PDF/DOCX magic bytes validation
          • PyMuPDF / python-docx text extraction
          • PII extraction & normalization
                   │
                   ▼
       2. SBERT 384-d Dense Embedding
          • all-MiniLM-L6-v2 off-thread inference
          • 180-word chunking + length-weighted mean pooling
          • Cosine similarity against job embedding
                   │
                   ▼
       3. Trust Detection Engine
          • Invisible / zero-opacity text inspection
          • Repetition & keyword stuffing checks
          • Job description injection detection
          • Deduct penalties from base 1.00
                   │
                   ▼
       4. Readiness & Skill Gap Engine
          • Exact & alias matching against required skills
          • Staleness penalty calculation (>3 yrs / obsolete tech)
          • Deterministic learning curriculum generation
                   │
                   ▼
       5. Final Scoring & Decisioning
          • FinalScore = (0.70 * Sim + 0.30 * Trust) * 100
          • Auto-shortlist if FinalScore >= 85.0
                   │
                   ▼
       6. Single-Transaction Commit to PostgreSQL
          • Commit Application, Resume, Match
          • Rollback completely on any failure
                   │
                   ▼
       7. Real-Time Event Dispatch
          • Emit application.submitted and scores.ready via SSE
```

### Mathematical Formulas

1. **Semantic Similarity ($S_{\text{sim}}$):**
   $$S_{\text{sim}} = 1.0 - \text{cosine\_distance}(\vec{v}_{\text{job}}, \vec{v}_{\text{resume}}) = \frac{\vec{v}_{\text{job}} \cdot \vec{v}_{\text{resume}}}{\|\vec{v}_{\text{job}}\| \|\vec{v}_{\text{resume}}\|}$$

2. **Trust Score ($S_{\text{trust}}$):**
   $$S_{\text{trust}} = \max\left(0.0, 1.0 - \sum_{i} \text{Penalty}_i\right)$$
   - Hidden text / zero-opacity font: $-0.35$ penalty
   - Abnormal keyword repetition ($\ge 10$ occurrences, $\ge 7\%$ density): $-0.20$ penalty
   - Verbatim JD injection ($>35\%$ 5-gram overlap): $-0.40$ penalty

3. **Final Candidate Score:**
   $$\text{FinalScore} = \left(0.70 \times S_{\text{sim}} + 0.30 \times S_{\text{trust}}\right) \times 100$$
   - Automatic Shortlisting Rule: Candidate is marked `shortlisted` if $\text{FinalScore} \ge 85.0$, otherwise `submitted`.

4. **Readiness Score ($R$):**
   $$R = 100 \times \frac{\sum_{i \in \text{Skills}} w_i \cdot \text{StatusFactor}_i}{\sum_{i \in \text{Skills}} w_i}$$
   - Where $w_i = 1.5$ for critical required skills, $w_i = 1.0$ for secondary skills.
   - $\text{StatusFactor} = 1.0$ for fresh matched, $0.5$ for stale matched, $0.0$ for missing.

---

## 5. Real-Time Live-Update Layer (Server-Sent Events)

To ensure dashboards update immediately without stale caching or optimistic client drift, the system utilizes unidirectional **Server-Sent Events (SSE)** via `GET /api/events/stream`:

```
Client Dashboard (React)               FastAPI Backend             PostgreSQL / Service
       │                                     │                              │
       │─── GET /api/events/stream?token ───>│                              │
       │<── event: connected ────────────────│                              │
       │                                     │                              │
       │                                     │<── Mutating Action ──────────│ (e.g. Job Posted)
       │                                     │    (Commit Transaction)      │
       │                                     │                              │
       │                                     │─── EventDispatcher.emit() ───│
       │                                     │    (ACL Scoping Check)       │
       │<── event: job.created ──────────────│                              │
       │                                     │                              │
       │─── liveResource.refresh() ─────────>│                              │
       │<── Fresh Data from DB ──────────────│                              │
```

### Event ACL Scoping Rules

| Event Name | Authorized Recipients | Purpose |
|------------|-----------------------|---------|
| `job.created`, `job.updated`, `job.closed`, `job.taken_down` | All authenticated candidates, recruiters, and admins | Updates public job boards and recruiter rosters |
| `application.submitted`, `scores.ready` | Owning candidate, job recruiter, and admins | Updates recruiter applicants list and candidate application tracker |
| `application.shortlist_overridden` | Owning candidate, job recruiter, and admins | Alerts candidate and updates recruiter shortlist count |
| `notification.created` | Target recipient user, dispatching user, admins | Alerts candidate of shortlist interview invites |
| `support.message_created`, `support.thread_resolved` | Thread owner, and admins | Real-time chat sync on support tickets |
| `admin.user_status_changed` | Targeted user, and admins | Real-time session invalidation |

### Frontend Hook: `useRealtimeSync`
- Automatically connects to `/api/events/stream?token=...`.
- Reconnects with exponential backoff on network disruption.
- Sends heartbeat comments (`: keep-alive\n\n`) every 15 seconds to prevent proxy timeouts.
- Gracefully falls back to short-polling (every 10s) if SSE is unsupported or disconnected.

---

## 6. Complete API Reference

All protected endpoints require `Authorization: Bearer <token>` or `?token=<token>`.

### Authentication (`/api/auth`)
- `POST /api/auth/otp/send` — Request a secure 6-digit email OTP (5-minute expiry, 60s cooldown, rate-limited).
- `POST /api/auth/otp/verify` — Verify the 6-digit OTP and receive an HMAC-signed `verification_token` (max 5 failed attempts before lockout).
- `POST /api/auth/register` — Register as `candidate` or `recruiter` (requires valid `verification_token` when OTP verification is enabled).
- `POST /api/auth/login` — Login with email/password (rate-limited via SlowAPI: 5 attempts/min).
- `GET /api/auth/me` — Return authenticated user session info.

### Job Management (`/api/jobs`)
- `POST /api/jobs` — Create job (recruiter/admin). Computes SBERT embedding & extracts skills.
- `GET /api/jobs` — List jobs (candidates see open jobs; recruiters see own jobs; admins see all).
- `GET /api/jobs/{id}` — Get single job details.
- `PATCH /api/jobs/{id}` — Edit job details (triggers re-embedding if title/description changes).
- `POST /api/jobs/{id}/close` — Mark job closed.
- `DELETE /api/jobs/{id}` — Remove job.
- `GET /api/jobs/{id}/matches` — Ranked candidates for a job.

### Applications & Pipeline (`/api/applications`)
- `POST /api/applications` — Submit application with resume upload (multipart/form-data).
- `GET /api/applications/mine` — Candidate lists own applications with scores and shortlist status.
- `GET /api/applications/{id}/readiness` — Detailed Skill Gap & Readiness breakdown.
- `POST /api/applications/{id}/shortlist-override` — Recruiter/admin manual shortlist toggle with audit reason.

### Notifications & Inbox (`/api/notifications`)
- `POST /api/notifications/invite` — Recruiter invites shortlisted candidate with schedule, venue, mode, contact. Fires asynchronous background SMTP email.
- `GET /api/notifications` — List notifications for user (filterable by unread).
- `PATCH /api/notifications/{id}/read` — Mark notification read.
- `POST /api/notifications/read-all` — Mark all notifications read.

### Admin Nerve Center (`/api/admin`)
- `GET /api/admin/metrics` — Live platform totals (candidates, recruiters, jobs, applications, shortlists, tickets).
- `GET /api/admin/users` — Paginated user directory with search and role filters.
- `GET /api/admin/users/{id}` — Comprehensive user detail (activity counts and recruiter profile).
- `PATCH /api/admin/users/{id}/status` — Activate or deactivate user account.
- `GET /api/admin/jobs` — Platform-wide job management.
- `POST /api/admin/jobs/{id}/takedown` — Enforce job takedown with recorded reason.
- `GET /api/admin/applications` — Platform-wide application oversight.

### Support Helpdesk (`/api/support`)
- `POST /api/support/threads` — Raise support inquiry.
- `GET /api/support/threads` — List support queries (users see own; admins see all).
- `GET /api/support/threads/{id}` — Thread message history.
- `POST /api/support/threads/{id}/messages` — Reply to thread.
- `PATCH /api/support/threads/{id}/status` — Admin resolve or reopen thread.

### Live Updates (`/api/events`)
- `GET /api/events/stream` — Authenticated SSE event stream.

---

## 7. The Three User Journeys

### 1. Candidate Journey
1. **Register & Verify:** Fills candidate registration details, requests 6-digit OTP, verifies email code with live cooldown timer, and completes registration with signed verification token.
2. **Login:** Authenticates securely via Argon2id password hash and receives JWT token.
3. **Job Search:** Explores open opportunities on `CandidateHome` with real-time text debouncing, job-type pills, and experience filters.
4. **Application:** Completes 3-step wizard on `ApplyPage`: personal details, resume upload (PDF/DOCX), and submission.
5. **Live Assessment:** SBERT embeds the profile, Trust checks execute, and the application is auto-evaluated.
6. **Tracking:** Inspects results in `MyApplications`, viewing Final Score, Trust Status, and opening the **Skill Gap Modal** to inspect missing/stale skills and custom learning curriculums.
7. **Interview Invitation:** Receives live notifications in `Inbox` with venue and interview schedules.
8. **Support:** Can open support inquiries with platform admins via `SupportCenter`.

### 2. Recruiter Journey
1. **Register & Verify:** Enters company credentials, verifies organizational email via 6-digit OTP verification step, and submits verified registration with company size and industry.
2. **Login:** Authenticates securely via Argon2id password hash and receives JWT token.
3. **Job Posting:** Posts positions on `AddJob` with interactive tag-based required skills input. SBERT generates 384-d vectors automatically.
4. **Pipeline Monitoring:** `RecruiterHome` tracks live applicant and shortlisted counts.
5. **Ranked Matching:** Opens `JobApplicants` to view candidates ranked by the multiplicative score ($S_{\text{sim}} \times S_{\text{trust}}$), with color-coded score pills and trust badges.
6. **Decision & Audit:** Inspects skill alignments and manually overrides shortlist status with logged justification.
7. **Shortlist Outreach:** Dispatches interview invitations via `InterviewInviteModal`, writing in-app notifications and sending background SMTP emails.

### 3. Admin Journey
1. **Nerve Center Overview:** `AdminPanel` displays live counts: total candidates, recruiters, open/closed jobs, applications, and support tickets.
2. **User Moderation:** `AdminUsers` enables searching, viewing profile histories, and toggling active/deactivated states.
3. **Job Oversight:** `AdminJobs` allows inspecting all jobs and executing immediate takedowns with mandatory violation explanations.
4. **Central Helpdesk:** `SupportCenter` gives admins full visibility into all support threads across candidates and recruiters, with live replying and resolution status tracking.

---

## 8. Configuration & Environment Variables

### Backend (`apps/api/.env`)
```env
# Database Connection (PostgreSQL 16 + pgvector)
DATABASE_URL=postgresql+asyncpg://postgres:generate-a-unique-local-password@localhost:5432/resume_matching

# Authentication & Security
# Generate a unique value; the application refuses to start while this is empty.
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Optional OpenAI Enrichment (System falls back locally to deterministic models if omitted)
OPENAI_API_KEY=

# Admin Bootstrap (Default Platform Administrator)
ADMIN_EMAIL=admin.resumematch@gmail.com
# Set a unique password; the application refuses to start while this is empty.
ADMIN_PASSWORD=
ADMIN_FULL_NAME=Platform Admin

# File Upload Guardrails
MAX_RESUME_BYTES=5242880

# Email OTP Verification Guardrails
REQUIRE_EMAIL_OTP=true
OTP_EXPIRY_MINUTES=5
OTP_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5

# Real Email Dispatch (Optional SMTP settings - logs safely if omitted)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_EMAIL=
SMTP_PASSWORD=
SMTP_FROM=noreply@airesumematching.com
SMTP_USE_TLS=true
```

### Frontend (`apps/web/.env`)
```env
VITE_API_BASE_URL=/api
```

### Docker Compose (`.env`)
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=resume_matching
```

---

## 9. How to Run & Verify

### Prerequisites
- Docker Desktop
- Python 3.11+
- Node.js 20+

### Execution Steps
```powershell
# 1. Start PostgreSQL with pgvector
docker compose up -d

# 2. Setup & Run Backend
cd apps/api
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
alembic upgrade head
python -m app.seeds.admin        # Bootstraps the administrator configured in apps/api/.env
python -m app.seeds.jobs         # Seeds 10 sample realistic job postings
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 3. Setup & Run Frontend (separate terminal)
cd apps/web
npm ci
npm run dev
```

- Frontend App: <http://localhost:5173>
- Backend API Docs: <http://localhost:8000/docs>

### Automated Verification Suites
```powershell
# Run Full Backend Test Suite (178 tests)
cd apps/api
.\.venv\Scripts\pytest -q

# Run Full Frontend Test Suite (133 tests)
cd apps/web
npx vitest run

# Verify TypeScript & Production Build
npm run build
```

---

## 10. Summary of Architectural Design Choices

| Decision | Justification |
|----------|---------------|
| **SBERT 384-d over OpenAI 1536-d** | Eliminates external API dependencies and network latency; runs fast in-process embeddings with exact semantic synonym preservation. |
| **Server-Sent Events (SSE) over WebSockets** | Mutations use standard REST APIs with HTTP status codes and validation; SSE provides native browser auto-reconnect, zero framing overhead, and smooth corporate proxy traversal. |
| **ACL-Filtered Event Bus** | Prevents cross-tenant data leakage by evaluating recipient role and identity before publishing events. |
| **Single ACID Application Transactions** | Guarantees that parsing, embedding, trust scoring, match persistence, and shortlist decisioning commit atomically or rollback completely on error. |
| **Deterministic Fallback Engines** | All AI services (SBERT, skill extraction, trust detection, skill gap) operate 100% offline with zero external network access when keys are absent. |
| **`useLiveResource` Zero-Stale Cache** | Enforces that active browser screens maintain exactly one synchronized representation fetched directly from the database upon real-time event triggers. |

---

*This document is the authoritative technical reference for the AI Resume Matching & Career Intelligence platform.*

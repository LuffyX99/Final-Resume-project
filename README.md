# AI Resume Matching

An AI-powered platform that matches candidates to job postings with SBERT embeddings and cosine similarity. Resume and job vectors are stored with PostgreSQL and pgvector.

![Dashboard](docs/dashboard.png)

![Jobs List](docs/jobs-list.png)

![Resume Detail](docs/resume-detail.png)

![Job Detail with Match](docs/job-detail.png)

## Features

- **SBERT Semantic Matching** — 384-dimensional embeddings (`all-MiniLM-L6-v2`) with cosine similarity and PostgreSQL/pgvector storage
- **Anti-Cheating Trust Scoring** — Detects hidden white text, tiny fonts, off-page text, keyword stuffing, and verbatim JD injection
- **Skill Gap & Readiness Analysis** — Classifies skills into Matched, Missing, and Stale (recency checking ≥ 3 years and legacy mapping) with Readiness Score (0-100%)
- **Multiplicative Scoring** — Computes `Final Score = Similarity × Trust` for fraud-penalized applicant ranking
- **Candidate & Recruiter Dashboards** — Real-time candidate application tracker, skill gap analysis modal, and recruiter ranking view with live Server-Sent Events (SSE)
- **Document Parsing** — PyMuPDF (PDF) and python-docx (DOCX) text extraction

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), Pydantic v2 |
| Embeddings and similarity | SBERT `all-MiniLM-L6-v2`, cosine similarity |
| Database | PostgreSQL 16 + pgvector |
| Trust & Integrity | Hidden text detection (PyMuPDF/docx), keyword stuffing analysis |
| Real-time | Server-Sent Events (SSE) event bus |
| Infrastructure | Docker, Docker Compose |

The active application stores vectors in PostgreSQL/pgvector and computes match scores in the application pipeline. `faiss_service.py` and `mongodb_service.py` are prototype/reference modules; they are not connected to the production request path.

## Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Python](https://www.python.org/) 3.12+
- [Node.js](https://nodejs.org/) 20+
- An OpenAI API key is optional; the application falls back to local skill extraction and PII cleanup.

## Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd ai-resume-matching
   ```

2. **Configure environment variables**

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   cp .env.example .env
   ```

   Edit `.env` and set a unique PostgreSQL password. Edit `apps/api/.env` and set a unique JWT secret and admin password. Generate a JWT secret with:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   `OPENAI_API_KEY` is optional. Keep `ALLOW_SQLITE_FALLBACK=false` outside isolated local development.

   For local API development outside Docker, set `DATABASE_URL` in `apps/api/.env` to use the same PostgreSQL username and password as `.env`. Compose supplies the container hostname and database URL itself.

   Edit `apps/web/.env`:

   ```
   VITE_API_BASE_URL=http://localhost:8000/api
   ```

3. **Start the full stack**

   ```bash
   docker compose up --build
   ```

   The web app is available at `http://localhost:5173`; the API is at `http://localhost:8000`.

4. **Install backend dependencies for local development**

   ```bash
   cd apps/api
pip install -r requirements-test.txt
   ```

5. **Install frontend dependencies**

   ```bash
   cd apps/web
   npm ci
   ```

## Running

For an all-container run, use `docker compose up --build`. For local code reloading, start PostgreSQL and run the API and web app on the host:

```bash
# Terminal 1 — PostgreSQL only
docker compose up postgres

# Terminal 2 — Backend API
cd apps/api
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 3 — Frontend
cd apps/web
npm run dev
```

The Vite dev server binds to loopback by default for local development. Docker Compose sets an internal proxy target and host binding for the web container.

### Makefile shortcuts

```bash
make up      # Start PostgreSQL, API, and web containers (detached)
make down    # Stop containers
make build   # Build images
make logs    # View container logs
```

## Testing

```bash
# Frontend
cd apps/web
npm run test

# Backend
cd apps/api
pytest
```

## Scheduled verification

The GitHub Actions workflows run the full backend/frontend test and security
suite on pushes and pull requests, with a weekly run each Sunday at 03:00 UTC.
A separate daily health workflow runs at 02:00 UTC against a temporary
PostgreSQL service. Schedules start after these workflow files are committed
to the repository's default branch.

For a running local stack, `bash scripts/daily_health_check.sh` checks the API,
configured database connection, embedding fallback, FAISS, trust scoring, and
skill-gap analysis. Run `bash scripts/weekly_full_test.sh` for the complete
test, Bandit, frontend lint, and production build checks. The weekly script
uses an isolated in-memory SQLite database and disables model downloads.

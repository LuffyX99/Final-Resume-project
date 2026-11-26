#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Keep verification isolated from any configured application database and
# prevent model downloads during CI and local runs.
export DATABASE_URL="sqlite+aiosqlite:///:memory:"
export ALLOW_SQLITE_FALLBACK="false"
export HF_HUB_OFFLINE="1"
export TRANSFORMERS_OFFLINE="1"
export TOKENIZERS_PARALLELISM="false"
export JWT_SECRET="resume-matching-ci-only-jwt-secret-00000000000000000000000000000000"
export ADMIN_PASSWORD="CI-only-admin-password-42!"

echo "Running full backend tests and security scan..."
(
  cd apps/api
  python -m pytest tests/ -q --tb=short --cov=app --cov-report=term-missing
  python -m bandit -r app/ -q
)

echo "Running frontend tests, lint, and production build..."
(
  cd apps/web
  npm test -- --run
  npm run lint
  npm run build
)

echo "Weekly verification PASSED"

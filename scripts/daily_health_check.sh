#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cd "$REPO_DIR"
echo "Running daily health check in $REPO_DIR..."
python "$SCRIPT_DIR/daily_health_check.py"

#!/usr/bin/env bash
# Host helper; issuance and renewal run inside the certificate container.
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$PROJECT_DIR"

case "${1:-}" in
  start)
    docker compose up -d --build acme
    ;;
  issue|issue-force|renew|reload|status)
    docker compose run --rm --no-deps acme "$1"
    ;;
  logs)
    docker compose logs --tail=100 acme
    ;;
  *)
    printf 'Usage: bash deploy/https.sh {start|issue|issue-force|renew|reload|status|logs}\n'
    exit 2
    ;;
esac

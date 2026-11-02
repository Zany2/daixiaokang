#!/usr/bin/env bash
# Host helper; issuance and renewal run inside the certificate container.
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$PROJECT_DIR"

case "${1:-}" in
  start)
    docker compose up -d --build daixiaokang_acme
    ;;
  issue|renew|reload|status)
    docker compose run --rm --no-deps daixiaokang_acme "$1"
    ;;
  logs)
    docker compose logs --tail=100 daixiaokang_acme
    ;;
  *)
    printf 'Usage: bash deploy/https.sh {start|issue|renew|reload|status|logs}\n'
    exit 2
    ;;
esac

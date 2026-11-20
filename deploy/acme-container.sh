#!/bin/sh
set -eu
umask 077

CONFIG_HOME="${HTTPS_CONFIG_HOME:-/acme.sh}"
CERT_DIR="${HTTPS_CERT_DIR:-/certs}"
SCRIPT="$(cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")"
MAIN_DOMAIN=daixiaokang.com
API_DOMAIN=api.daixiaokang.com
VANTAGE_DOMAIN=vantage.daixiaokang.com
RAGFLOW_DOMAIN=ragflow.daixiaokang.com
NGINX_CONTAINER=gateway
ACME_BIN="$(command -v acme.sh)"
force_issue=0

log() { printf '[https] %s\n' "$*"; }
fail() { printf '[https] ERROR: %s\n' "$*" >&2; exit 1; }
require_config() {
  [ -n "${ACME_EMAIL:-}" ] || fail 'ACME_EMAIL is required in deploy/https.env.'
  [ -n "${Tencent_SecretId:-}" ] || fail 'Tencent_SecretId is required.'
  [ -n "${Tencent_SecretKey:-}" ] || fail 'Tencent_SecretKey is required.'
}
prepare() {
  mkdir -p "$CONFIG_HOME" "$CERT_DIR"
  chmod 700 "$CONFIG_HOME" "$CERT_DIR"
}
locked() {
  prepare
  # flock is automatically released even when a container is killed or restarted.
  flock -n "$CONFIG_HOME/https.lock" sh "$SCRIPT" "_$1"
}
reload_nginx() {
  # Persist the pending reload so a stopped Nginx or a failed check can be retried.
  prepare
  touch "$CONFIG_HOME/reload-pending"
  docker info >/dev/null
  running="$(docker inspect --format '{{.State.Running}}' "$NGINX_CONTAINER" 2>/dev/null || true)"
  if [ "$running" != true ]; then
    log 'Nginx is not running. Certificate saved; reload will be retried later.'
    return 0
  fi
  docker exec "$NGINX_CONTAINER" nginx -t
  docker exec "$NGINX_CONTAINER" nginx -s reload
  rm -f "$CONFIG_HOME/reload-pending"
  log 'Nginx configuration checked and reloaded.'
}
verify_domains() {
  [ -s "$1" ] || fail "Certificate not found: $1. Run issue-force once to recover a skipped domain expansion."
  san="$(openssl x509 -in "$1" -noout -ext subjectAltName)" || fail 'Cannot read certificate SANs.'
  for domain in "$MAIN_DOMAIN" "$API_DOMAIN" "$VANTAGE_DOMAIN" "$RAGFLOW_DOMAIN"; do
    printf '%s\n' "$san" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -Fx "DNS:$domain" >/dev/null ||
      fail "Certificate is missing $domain; refusing to install it. Run issue-force once to recover a skipped domain expansion."
  done
}
issue() {
  require_config
  dns_sleep="${ACME_DNS_SLEEP:-300}"
  case "$dns_sleep" in
    ''|*[!0-9]*) fail 'ACME_DNS_SLEEP must be a positive integer in seconds.' ;;
  esac
  [ "$dns_sleep" -gt 0 ] || fail 'ACME_DNS_SLEEP must be greater than zero.'
  # Force only through the explicit recovery action, never scheduled renewal.
  set --
  if [ "${force_issue:-0}" = 1 ]; then set -- --force; fi
  result=0
  "$ACME_BIN" --issue "$@" --config-home "$CONFIG_HOME" --cert-home "$CONFIG_HOME" --server letsencrypt \
    --accountemail "$ACME_EMAIL" --dns dns_tencent --dnssleep "$dns_sleep" --keylength ec-256 \
    -d "$MAIN_DOMAIN" -d "$API_DOMAIN" -d "$VANTAGE_DOMAIN" -d "$RAGFLOW_DOMAIN" || result=$?
  # acme.sh returns 2 when the existing certificate is not due for renewal.
  [ "$result" -eq 0 ] || [ "$result" -eq 2 ] || return "$result"
  # A failed expansion can leave saved order domains ahead of the actual cert.
  # Check the certificate, not the saved order, before touching live files.
  verify_domains "$CONFIG_HOME/${MAIN_DOMAIN}_ecc/${MAIN_DOMAIN}.cer"
  "$ACME_BIN" --install-cert --config-home "$CONFIG_HOME" --cert-home "$CONFIG_HOME" -d "$MAIN_DOMAIN" --ecc \
    --key-file "$CERT_DIR/privkey.pem" --fullchain-file "$CERT_DIR/fullchain.pem" \
    --reloadcmd "sh '$SCRIPT' reload"
  touch "$CONFIG_HOME/https-installed"
  log 'Certificate installed. The container scheduler handles future renewals.'
}
renew() {
  require_config
  if [ ! -f "$CONFIG_HOME/https-installed" ] || \
     [ ! -s "$CERT_DIR/fullchain.pem" ] || [ ! -s "$CERT_DIR/privkey.pem" ]; then
    issue
    return
  fi
  if [ -f "$CONFIG_HOME/reload-pending" ]; then
    reload_nginx
  fi
  "$ACME_BIN" --cron --config-home "$CONFIG_HOME"
}
daemon() {
  require_config
  prepare
  zone="${TZ:-Asia/Shanghai}"
  [ -f "/usr/share/zoneinfo/$zone" ] || fail "Unknown timezone: $zone"
  cp "/usr/share/zoneinfo/$zone" /etc/localtime
  printf '%s\n' "$zone" > /etc/timezone
  schedule="${HTTPS_CRON:-15 3 * * *}"
  printf '%s sh "%s" renew\n' "$schedule" "$SCRIPT" > /tmp/https.crontab
  supercronic -test /tmp/https.crontab
  log "Checking certificates at startup; scheduled checks: $schedule ($zone)."
  if ! locked renew; then
    log 'Startup certificate check failed; inspect logs and correct the configuration. Scheduled retries remain active.'
  fi
  exec supercronic /tmp/https.crontab
}

case "${1:-daemon}" in
  daemon) daemon ;;
  issue|issue-force|renew) locked "$1" ;;
  # Internal actions hold the lock. Reload is also called as an acme.sh hook.
  _issue) prepare; issue ;;
  _issue-force) prepare; force_issue=1; issue ;;
  _renew) prepare; renew ;;
  reload) reload_nginx ;;
  status)
    [ -s "$CERT_DIR/fullchain.pem" ] || fail 'No certificate found; check the certificate container logs.'
    openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName
    ;;
  *) fail 'Usage: daemon | issue | issue-force | renew | reload | status' ;;
esac

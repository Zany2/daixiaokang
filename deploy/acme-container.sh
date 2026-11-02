#!/bin/sh
set -eu
umask 077

CONFIG_HOME="${HTTPS_CONFIG_HOME:-/acme.sh}"
CERT_DIR="${HTTPS_CERT_DIR:-/certs}"
SCRIPT="$(cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")"
MAIN_DOMAIN=daixiaokang.com
API_DOMAIN=api.daixiaokang.com
NGINX_CONTAINER=daixiaokang_frontend
ACME_BIN="$(command -v acme.sh)"

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
issue() {
  require_config
  result=0
  "$ACME_BIN" --issue --config-home "$CONFIG_HOME" --server letsencrypt \
    --accountemail "$ACME_EMAIL" --dns dns_tencent --keylength ec-256 \
    -d "$MAIN_DOMAIN" -d "$API_DOMAIN" || result=$?
  # acme.sh returns 2 when the existing certificate is not due for renewal.
  [ "$result" -eq 0 ] || [ "$result" -eq 2 ] || return "$result"
  "$ACME_BIN" --install-cert --config-home "$CONFIG_HOME" -d "$MAIN_DOMAIN" --ecc \
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
  issue|renew) locked "$1" ;;
  # Internal actions hold the lock. Reload is also called as an acme.sh hook.
  _issue) prepare; issue ;;
  _renew) prepare; renew ;;
  reload) reload_nginx ;;
  status)
    [ -s "$CERT_DIR/fullchain.pem" ] || fail 'No certificate found; check the certificate container logs.'
    openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName
    ;;
  *) fail 'Usage: daemon | issue | renew | reload | status' ;;
esac

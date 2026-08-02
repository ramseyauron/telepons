#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this release script as root." >&2
  exit 1
fi

app_directory=/opt/telepons
environment_file=/etc/telepons/telepons.env

set -a
# shellcheck disable=SC1090
. "$environment_file"
set +a

cd "$app_directory"
restore_services_on_failure() {
  systemctl start telepons-bot.service 2>/dev/null || true
  if [ -f "$app_directory/.next/BUILD_ID" ]; then
    systemctl start telepons-web.service 2>/dev/null || true
  else
    echo "Web service was not restarted because no valid .next/BUILD_ID exists." >&2
  fi
}
trap restore_services_on_failure EXIT

systemctl stop telepons-web.service telepons-bot.service 2>/dev/null || true
sudo -u telepons -H --preserve-env npm ci --include=dev
sudo -u telepons -H --preserve-env npm run check:production
install -d -o telepons -g telepons "$app_directory/.next/cache"

# A oneshot unit with RemainAfterExit must be restarted for every release.
systemctl restart telepons-migrate.service
systemctl restart telepons-web.service telepons-bot.service caddy.service
systemctl enable --now telepons-backup.timer

healthcheck_url=${TELEPONS_HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}
healthcheck_attempt=1
healthcheck_max_attempts=30

echo "Waiting for Telepons web readiness at $healthcheck_url..."
while [ "$healthcheck_attempt" -le "$healthcheck_max_attempts" ]; do
  if healthcheck_response=$(curl \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 2 \
    --max-time 5 \
    "$healthcheck_url" 2>/dev/null); then
    echo "$healthcheck_response"
    break
  fi

  if ! systemctl is-active --quiet telepons-web.service; then
    echo "Telepons web service stopped while waiting for readiness." >&2
    systemctl --no-pager --full status telepons-web.service >&2 || true
    journalctl -u telepons-web.service -n 50 --no-pager >&2 || true
    exit 1
  fi

  if [ "$healthcheck_attempt" -eq "$healthcheck_max_attempts" ]; then
    echo "Telepons web did not become ready after $healthcheck_max_attempts attempts." >&2
    systemctl --no-pager --full status telepons-web.service >&2 || true
    journalctl -u telepons-web.service -n 50 --no-pager >&2 || true
    exit 1
  fi

  sleep 2
  healthcheck_attempt=$((healthcheck_attempt + 1))
done

echo "Telepons native release completed."
trap - EXIT

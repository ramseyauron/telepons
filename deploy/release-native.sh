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
  systemctl start telepons-web.service telepons-bot.service 2>/dev/null || true
}
trap restore_services_on_failure EXIT

systemctl stop telepons-web.service telepons-bot.service 2>/dev/null || true
sudo -u telepons -H --preserve-env npm ci --include=dev
sudo -u telepons -H --preserve-env npm run check:production

# A oneshot unit with RemainAfterExit must be restarted for every release.
systemctl restart telepons-migrate.service
systemctl restart telepons-web.service telepons-bot.service caddy.service
systemctl enable --now telepons-backup.timer

curl --fail --silent --show-error "${APP_BASE_URL%/}/api/health"
echo
echo "Telepons native release completed."
trap - EXIT

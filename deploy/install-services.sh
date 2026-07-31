#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root from /opt/telepons." >&2
  exit 1
fi

app_directory=/opt/telepons
environment_file=/etc/telepons/telepons.env

if [ ! -f "$environment_file" ]; then
  echo "Missing $environment_file" >&2
  exit 1
fi
if [ ! -f "$app_directory/package.json" ]; then
  echo "Copy Telepons to $app_directory first." >&2
  exit 1
fi

cd "$app_directory"
install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
install -m 0644 deploy/systemd/telepons-migrate.service /etc/systemd/system/
install -m 0644 deploy/systemd/telepons-web.service /etc/systemd/system/
install -m 0644 deploy/systemd/telepons-bot.service /etc/systemd/system/
install -m 0644 deploy/systemd/telepons-backup.service /etc/systemd/system/
install -m 0644 deploy/systemd/telepons-backup.timer /etc/systemd/system/

chown -R telepons:telepons "$app_directory"
chmod 600 "$environment_file"

systemctl daemon-reload
systemctl enable caddy telepons-migrate.service telepons-web.service \
  telepons-bot.service telepons-backup.timer

echo "Services installed. Run deploy/release-native.sh as root to build and start."

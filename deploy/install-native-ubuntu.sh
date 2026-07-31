#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi

: "${TELEPONS_DB_PASSWORD:?Set TELEPONS_DB_PASSWORD before running this installer}"

app_directory=/opt/telepons
environment_directory=/etc/telepons
backup_directory=/var/backups/telepons

apt-get update
apt-get install -y ca-certificates curl gnupg sudo postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1 || [ "$(node --version | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sh -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

if ! id telepons >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/telepons \
    --shell /usr/sbin/nologin telepons
fi

mkdir -p "$app_directory" "$environment_directory" "$backup_directory"
chown -R telepons:telepons "$app_directory" "$backup_directory"
chmod 750 "$environment_directory" "$backup_directory"

sudo -u postgres psql --set=role_password="$TELEPONS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE telepons LOGIN PASSWORD %L', :'role_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'telepons') \gexec
ALTER ROLE telepons WITH LOGIN PASSWORD :'role_password';
SELECT 'CREATE DATABASE telepons OWNER telepons'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'telepons') \gexec
REVOKE ALL ON DATABASE telepons FROM PUBLIC;
SQL

sudo -u postgres psql -c "ALTER SYSTEM SET listen_addresses = '127.0.0.1';"
systemctl restart postgresql

echo "Native dependencies installed. Copy the repository to $app_directory,"
echo "then create $environment_directory/telepons.env from .env.native.example."

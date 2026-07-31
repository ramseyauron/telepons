#!/bin/sh
set -eu

project_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backup_directory=${BACKUP_DIRECTORY:-"$project_directory/backups"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_directory/telepons-$timestamp.dump"

: "${DATABASE_URL:?DATABASE_URL must be configured}"
mkdir -p "$backup_directory"
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$DATABASE_URL" --file="$backup_file"

echo "PostgreSQL backup created: $backup_file"

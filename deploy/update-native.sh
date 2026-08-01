#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this update script as root." >&2
  exit 1
fi

app_directory=/opt/telepons
production_branch=${TELEPONS_BRANCH:-main}
remote_name=${TELEPONS_REMOTE:-origin}
lock_file=/run/lock/telepons-update.lock

case "$production_branch" in
  ""|-*|*..*|*[!A-Za-z0-9._/-]*)
    echo "Invalid production branch: $production_branch" >&2
    exit 1
    ;;
esac

if [ ! -d "$app_directory/.git" ]; then
  echo "Git repository not found at $app_directory." >&2
  exit 1
fi
if [ ! -f /etc/telepons/telepons.env ]; then
  echo "Missing /etc/telepons/telepons.env." >&2
  exit 1
fi

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another Telepons update is already running." >&2
  exit 1
fi

cd "$app_directory"

current_branch=$(sudo -u telepons -H git branch --show-current)
if [ "$current_branch" != "$production_branch" ]; then
  echo "Expected branch '$production_branch', but VPS is on '$current_branch'." >&2
  echo "Switch branches manually after reviewing the repository state." >&2
  exit 1
fi

working_tree_status=$(sudo -u telepons -H git status --porcelain --untracked-files=normal)
if [ -n "$working_tree_status" ]; then
  echo "The VPS repository contains local changes. Update cancelled:" >&2
  echo "$working_tree_status" >&2
  exit 1
fi

previous_commit=$(sudo -u telepons -H git rev-parse HEAD)
echo "Updating Telepons from $remote_name/$production_branch..."
sudo -u telepons -H git fetch --prune "$remote_name" "$production_branch"
sudo -u telepons -H git merge --ff-only "$remote_name/$production_branch"
current_commit=$(sudo -u telepons -H git rev-parse HEAD)

echo "Synchronizing native service configuration..."
"$app_directory/deploy/install-services.sh"

echo "Installing, validating, migrating, and restarting Telepons..."
if ! "$app_directory/deploy/release-native.sh"; then
  echo "Telepons update failed." >&2
  echo "Previous commit: $previous_commit" >&2
  echo "Current commit:  $current_commit" >&2
  echo "The repository was not rolled back automatically." >&2
  exit 1
fi

systemctl is-active --quiet telepons-web.service
systemctl is-active --quiet telepons-bot.service

echo "Telepons update completed successfully."
echo "Previous commit: $previous_commit"
echo "Current commit:  $current_commit"
systemctl --no-pager --full status \
  telepons-web.service telepons-bot.service | sed -n '1,24p'

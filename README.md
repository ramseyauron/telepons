# Telepons

Telegram-native token launch orchestration and community intelligence for Pons.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Put the newly rotated Telegram bot token in `.env.local`.
3. Run `npm install`.
4. Run `npm run db:migrate`.
5. Run the website with `npm run dev`.
6. In another terminal, run the bot with `npm run dev:bot`.

The website is available at `http://localhost:3000`; its health endpoint is
`http://localhost:3000/api/health`.

## Environment variables

Required:

- `TELEGRAM_BOT_TOKEN`: secret token from BotFather.
- `APP_BASE_URL`: `http://localhost:3000` locally; the public HTTPS domain later.
- `DATABASE_URL`: PostgreSQL URL. In Docker Compose it points to the private
  `postgres` service and is never exposed publicly.
- `DATABASE_MIGRATION_URL`: PostgreSQL URL used by the one-shot migration
  container.
- `DATABASE_POOL_SIZE`: maximum connections per Telepons process.

Optional:

- `ROBINHOOD_RPC_URL`: defaults to the documented public RPC. Override it with a
  dedicated provider in production.
- `NEXT_PUBLIC_REOWN_PROJECT_ID`: Reown project ID for mobile wallets.
- `NEXT_PUBLIC_TELEPONS_X_URL`: official X/Twitter profile displayed on the
  landing page and documentation. The X link remains hidden when unset.
- `OPENAI_API_KEY`: required for structured token-detail extraction.
- `TRENDING_ENABLED`: enables the `/trending` leaderboard.
- `TRENDING_DATA_SOURCE`: `dummy` for isolated demo data or `onchain` for
  verified Swap records already indexed by BuyBot. Changing it requires a bot
  restart and never adds another RPC fetch. The first on-chain activation time
  is persisted so data collected during dummy testing is excluded.

The active Pons v1 factory, start block, WETH, router, locker, and other public
protocol addresses live in `src/config/pons.ts`. They are public constants, not
secrets or per-deployment environment variables.

Pons v2 is not the current deployment target: its documentation states that the
v2 launch factory and the rest of its launch stack have not been deployed yet.

## Post-launch intelligence

Active Telepons groups receive a pinned live dashboard, exact graduation
milestones, durable Transfer-based holder balances, contract-address checks,
creator fee configuration, and BuyBot topic/aggregation controls. Pool swaps
remain the single source for BuyBot, volume, price, and Trending; holder events
use an independent per-token checkpoint. All server-side Robinhood reads within
each process share the five-request-per-second transport.

The milestone engine publishes new holder and gross-volume achievements without
additional chain reads. `/panel` gives the current group owner inline controls,
and `/report` exposes a shareable `/token/<address>` page with dynamic social
metadata, community links, trading actions, and the latest indexed statistics.
`/community` combines Telegram's current member count with durable verification,
moderation, and daily member-count snapshots. Growth is only shown when a real
24-hour or 7-day baseline exists; no individual member details are exposed.
The rolling welcome can be managed independently through `/welcome`: owners can
preview and confirm a custom `{member}` caption, upload a PNG/JPEG/WebP image to
Pinata, reset to text-only, and enable or disable welcomes without changing human
verification or anti-flood settings. Telegram file IDs keep delivery fast, while
IPFS metadata provides a durable asset reference.

## Production architecture

The complete production stack runs natively on one Ubuntu VPS:

- Native Caddy terminates HTTPS and proxies to `127.0.0.1:3000`.
- Next.js runs as `telepons-web.service`.
- One grammY/BuyBot process runs as `telepons-bot.service`.
- Native PostgreSQL listens only on `127.0.0.1:5432`.
- `telepons-migrate.service` must succeed before web and bot start.
- `telepons-backup.timer` creates a compressed backup every day.

Only ports 80 and 443 are public. PostgreSQL and Next.js are accessible only
through the loopback interface.

### First VPS deployment

1. Point the domain's `A`/`AAAA` record to the VPS.
2. Copy the repository to `/opt/telepons`.
3. Install PostgreSQL, Node.js 22, Caddy, the database role, and directories:

```bash
cd /opt/telepons
export TELEPONS_DB_PASSWORD='a-long-random-database-password'
sudo -E ./deploy/install-native-ubuntu.sh
```

4. Create the systemd environment file and replace every placeholder:

```bash
sudo mkdir -p /etc/telepons
sudo cp .env.native.example /etc/telepons/telepons.env
sudo chmod 600 /etc/telepons/telepons.env
sudo editor /etc/telepons/telepons.env
```

The PostgreSQL password inside both database URLs must be URL encoded.

5. Allowlist `https://telepons.bot` in the Reown dashboard.
6. Install and release the native services:

```bash
sudo ./deploy/install-services.sh
sudo ./deploy/release-native.sh
```

7. Inspect startup and readiness:

```bash
systemctl status postgresql caddy telepons-migrate telepons-web telepons-bot
journalctl -u telepons-web -u telepons-bot -f
curl --fail https://telepons.bot/api/health
```

### Updating the VPS after a push

After pushing a verified commit to the production branch, update every native
Telepons component from any directory on the VPS:

```bash
sudo telepons-update
```

The updater requires a clean VPS working tree and performs a fast-forward-only
update from `origin/main`. It then synchronizes the Caddy and systemd files,
installs locked dependencies, runs the production checks and PostgreSQL
migrations, restarts the web and bot services, and checks application health.

To deploy another branch or remote explicitly:

```bash
sudo TELEPONS_BRANCH=release TELEPONS_REMOTE=origin telepons-update
```

Install or refresh the native command once after pulling the version that
contains it:

```bash
cd /opt/telepons
sudo ./deploy/install-services.sh
```

The updater never resets local changes or automatically rolls back the Git
checkout. If a release fails, it prints both commit hashes for diagnosis.

Allow inbound SSH, TCP 80, TCP 443, and UDP 443. Do not allow public access to
ports 3000 or 5432. Caddy obtains and renews TLS automatically. Run exactly one
bot service; it is the sole BuyBot indexer.

Before deploying, run the complete release gate:

```bash
npm ci
npm run check:production
```

The `/api/health` readiness endpoint returns HTTP `503` when PostgreSQL is not
available.

### Backups

The daily timer runs automatically. A manual backup can be started with:

```bash
sudo systemctl start telepons-backup.service
sudo journalctl -u telepons-backup.service --since today
```

Backups are written to `/var/backups/telepons`. Copy them to off-site storage
and test restoration regularly.

## Existing data

### Moving SQLite data into the VPS database

1. Keep `data/telepons.db` as a backup.
2. Install and start native PostgreSQL.
3. Run `npm run db:migrate` to create the PostgreSQL schema.
4. If legacy SQLite data must be retained, export it before deployment and import
   the resulting data into PostgreSQL with a dedicated one-time migration.
5. Start the systemd services.

Do not delete the SQLite database until the PostgreSQL row counts and launch,
moderation, BuyBot, and verification flows have been checked.

For an existing Supabase PostgreSQL database, use `pg_dump --format=custom`
against the Supabase non-pooling URL and restore it with `pg_restore` before
starting the full stack. Restoring with `--clean` is destructive to the target
database; take backups and verify the exact target before running it.

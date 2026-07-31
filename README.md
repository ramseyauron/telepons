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
- `DATABASE_URL`: Supabase transaction-pooler URL (port `6543`) used by the
  website and bot.
- `DATABASE_MIGRATION_URL`: Supabase direct or session-pooler URL (port `5432`)
  used only by Drizzle migrations.
- `DATABASE_POOL_SIZE`: maximum connections per Telepons process. Use `2` for
  Vercel serverless functions and configure the persistent bot worker
  separately if it needs a larger pool.

Optional:

- `ROBINHOOD_RPC_URL`: defaults to the documented public RPC. Override it with a
  dedicated provider in production.
- `NEXT_PUBLIC_REOWN_PROJECT_ID`: only needed when WalletConnect/Reown is added.
- `OPENAI_API_KEY`: only needed when structured LLM extraction is added.

The active Pons v1 factory, start block, WETH, router, locker, and other public
protocol addresses live in `src/config/pons.ts`. They are public constants, not
secrets or per-deployment environment variables.

Pons v2 is not the current deployment target: its documentation states that the
v2 launch factory and the rest of its launch stack have not been deployed yet.

## Production architecture

- Deploy the Next.js website and API routes to Vercel.
- Run `npm run bot` on a persistent worker such as Railway, Fly.io, Render, or
  a VPS. Telegram long polling and BuyBot indexing must not run as a Vercel
  serverless function.
- Both deployments use the Supabase transaction-pooler connection string.
- Run `npm run db:migrate` during a controlled release step, using the direct or
  non-pooling connection string. Do not run concurrent migrations from every
  application instance.
- Use Node.js 22 LTS, as specified by `.nvmrc` and `package.json`.

Before deploying, run the complete release gate:

```bash
npm ci
npm run check:production
```

The `/api/health` readiness endpoint returns HTTP `503` when PostgreSQL is not
available.

## Moving existing SQLite data to Supabase

1. Keep `data/telepons.db` as a backup.
2. Copy the Supabase connection strings into `.env.local`. URL-encode special
   characters in the database password.
3. Run `npm run db:migrate` to create the PostgreSQL schema.
4. Run `npm run db:import:sqlite` once to copy existing rows. The importer uses
   `ON CONFLICT DO NOTHING`, so rerunning it will not duplicate primary keys.
5. Start the website and bot normally.

Do not delete the SQLite database until the Supabase row counts and launch,
moderation, BuyBot, and verification flows have been checked.

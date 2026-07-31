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

Required for the current local alpha:

- `TELEGRAM_BOT_TOKEN`: secret token from BotFather.
- `APP_BASE_URL`: `http://localhost:3000` locally; the public HTTPS domain later.
- `DATABASE_URL`: keep `./data/telepons.db` for local SQLite.

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

## Current foundation

- Next.js web application and API
- grammY Telegram bot entry point
- Robinhood Chain definition for viem
- Strict launch-draft validation
- SQLite/Drizzle launch-session and token-asset schema
- Environment validation with no committed credentials

## Next vertical slice

1. Verify group owner/admin permissions.
2. Parse a token draft from a Telegram caption.
3. Download and normalize the attached logo.
4. Persist a one-time launch session.
5. Render `/launch/[sessionId]` and connect the deployer wallet.
6. Build, simulate, submit, and verify the official Pons launch transaction.
7. Activate the basic Swap and Transfer indexer.

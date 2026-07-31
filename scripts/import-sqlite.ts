import Database from "better-sqlite3";
import postgres from "postgres";

const tables = [
  "telegram_groups",
  "telegram_bot_installations",
  "group_moderation_settings",
  "member_verifications",
  "moderation_actions",
  "launch_sessions",
  "indexer_checkpoints",
  "swaps",
  "token_volume_totals",
  "buybot_settings",
  "buybot_test_targets",
  "launch_orders",
  "launch_conversations",
  "token_assets",
] as const;

const booleanColumns = new Set([
  "active",
  "welcome_enabled",
  "verification_enabled",
  "anti_flood_enabled",
  "enabled",
  "awaiting_custom_image",
]);

const timestampColumns = new Set([
  "added_at",
  "removed_at",
  "updated_at",
  "expires_at",
  "verified_at",
  "created_at",
  "consumed_at",
]);

function convertRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => {
      if (value === null) return [column, null];
      if (booleanColumns.has(column)) return [column, Boolean(value)];
      if (timestampColumns.has(column) && typeof value === "number") {
        const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
        return [column, new Date(milliseconds)];
      }
      return [column, value];
    }),
  );
}

async function main(): Promise<void> {
  const sqlitePath = process.env.SQLITE_DATABASE_PATH ?? "./data/telepons.db";
  const connectionString =
    process.env.DATABASE_MIGRATION_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;

  if (
    !connectionString?.startsWith("postgresql://") &&
    !connectionString?.startsWith("postgres://")
  ) {
    throw new Error(
      "Set DATABASE_MIGRATION_URL or DATABASE_URL before importing SQLite data.",
    );
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pg = postgres(connectionString, { max: 1, prepare: false });

  try {
    for (const table of tables) {
      const exists = sqlite
        .prepare(
          "select 1 from sqlite_master where type = 'table' and name = ?",
        )
        .get(table);
      if (!exists) continue;

      const rows = (
        sqlite.prepare(`select * from "${table}"`).all() as Record<
          string,
          unknown
        >[]
      ).map(convertRow);

      for (let index = 0; index < rows.length; index += 250) {
        const batch = rows.slice(index, index + 250);
        await pg`insert into ${pg(table)} ${pg(batch)} on conflict do nothing`;
      }

      console.log(`${table}: imported ${rows.length} row(s)`);
    }
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to import SQLite data", error);
  process.exitCode = 1;
});

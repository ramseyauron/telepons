import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main(): Promise<void> {
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
      "Set DATABASE_MIGRATION_URL or DATABASE_URL to a PostgreSQL connection string.",
    );
  }

  const client = postgres(connectionString, { max: 1, prepare: false });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: "./src/db/postgres-migrations",
    });
    console.log("PostgreSQL database migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to apply PostgreSQL migrations", error);
  process.exitCode = 1;
});

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/db/client";

migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("Database migrations applied");

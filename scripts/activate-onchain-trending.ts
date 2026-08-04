import { sql } from "drizzle-orm";
import { postgresClient } from "@/db/client";
import { db } from "@/db/client";
import { trendingState } from "@/db/schema";

async function main(): Promise<void> {
  const activatedAt = new Date();

  await db
    .insert(trendingState)
    .values({ id: "global", onchainActivatedAt: activatedAt })
    .onConflictDoUpdate({
      target: trendingState.id,
      set: { onchainActivatedAt: activatedAt },
    });

  const [{ activeBuybots, activeTokens }] = await db.execute<{
    activeBuybots: number;
    activeTokens: number;
  }>(sql`
    select
      count(*) filter (where bs.enabled = true)::int as "activeBuybots",
      count(*) filter (
        where bs.enabled = true
          and ls.status = 'ACTIVE'
          and ls.token_address is not null
          and ls.pool_address is not null
      )::int as "activeTokens"
    from buybot_settings bs
    left join launch_sessions ls on ls.group_id = bs.group_id
  `);

  console.log("Telepons live on-chain epoch activated", {
    activatedAt: activatedAt.toISOString(),
    activeBuybots,
    activeTokens,
  });
  console.log(
    "Only swaps indexed at or after this timestamp are eligible for Trending.",
  );
}

main()
  .catch((error: unknown) => {
    console.error("Failed to activate live on-chain Trending", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });

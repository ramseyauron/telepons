import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { telegramGroups } from "@/db/schema";

export async function markGroupLaunched(
  groupId: string,
  launchSessionId: string,
): Promise<void> {
  await db
    .update(telegramGroups)
    .set({
      lifecycle: "ACTIVE",
      activeLaunchSessionId: launchSessionId,
    })
    .where(eq(telegramGroups.id, groupId));
}

import { eq, ilike } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { db } from "@/db/client";
import {
  launchSessions,
  telegramGroups,
  tokenAssets,
  tokenHolderStats,
  tokenSnapshots,
  tokenVolumeTotals,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

export async function getTokenReport(rawAddress: string) {
  if (!isAddress(rawAddress, { strict: false })) return null;
  const tokenAddress = getAddress(rawAddress.toLowerCase());
  const session = await db.query.launchSessions.findFirst({
    where: ilike(launchSessions.tokenAddress, tokenAddress),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  if (!session || session.status !== "ACTIVE" || !session.tokenAddress) {
    return null;
  }

  const [asset, group, snapshot, volume, holders] = await Promise.all([
    db.query.tokenAssets.findFirst({
      where: eq(tokenAssets.launchSessionId, session.id),
    }),
    db.query.telegramGroups.findFirst({
      where: eq(telegramGroups.id, session.groupId),
    }),
    db.query.tokenSnapshots.findFirst({
      where: ilike(tokenSnapshots.tokenAddress, tokenAddress),
    }),
    db.query.tokenVolumeTotals.findFirst({
      where: ilike(tokenVolumeTotals.tokenAddress, tokenAddress),
    }),
    db.query.tokenHolderStats.findFirst({
      where: ilike(tokenHolderStats.tokenAddress, tokenAddress),
    }),
  ]);

  return {
    session,
    tokenAddress,
    draft: launchDraftSchema.parse(JSON.parse(session.draftJson)),
    logoUrl: asset?.publicUrl ?? undefined,
    groupTitle: group?.title ?? "Telegram community",
    snapshot,
    volume,
    holders,
  };
}

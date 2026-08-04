import { and, eq, ilike, sql } from "drizzle-orm";
import { getAddress } from "viem";
import { db } from "@/db/client";
import {
  buybotSettings,
  holderSyncRequests,
  launchSessions,
  tokenHolderStats,
} from "@/db/schema";

export const holderOnDemandStaleMs = 5 * 60 * 1_000;

function canonicalAddress(tokenAddress: string): string {
  return getAddress(tokenAddress);
}

export async function scheduleTokenHolderSync(input: {
  tokenAddress: string;
  notBefore?: Date;
  reason: string;
}): Promise<void> {
  const tokenAddress = canonicalAddress(input.tokenAddress);
  const notBefore = input.notBefore ?? new Date();
  const now = new Date();

  await db
    .insert(holderSyncRequests)
    .values({
      tokenAddress,
      notBefore,
      reason: input.reason,
      requestedAt: now,
    })
    .onConflictDoUpdate({
      target: holderSyncRequests.tokenAddress,
      set: {
        notBefore: sql`least(${holderSyncRequests.notBefore}, ${notBefore})`,
        reason: input.reason,
        requestedAt: now,
      },
    });
}

export async function isTokenHolderSyncDue(
  tokenAddress: string,
  now = new Date(),
): Promise<boolean> {
  const request = await db.query.holderSyncRequests.findFirst({
    where: and(
      eq(holderSyncRequests.tokenAddress, canonicalAddress(tokenAddress)),
      sql`${holderSyncRequests.notBefore} <= ${now}`,
    ),
  });
  return Boolean(request);
}

export async function completeTokenHolderSync(
  tokenAddress: string,
  requestedBefore: Date,
): Promise<void> {
  await db
    .delete(holderSyncRequests)
    .where(
      and(
        eq(holderSyncRequests.tokenAddress, canonicalAddress(tokenAddress)),
        sql`${holderSyncRequests.requestedAt} <= ${requestedBefore}`,
      ),
    );
}

export async function requestTokenHolderSyncIfStale(
  tokenAddress: string,
  reason: string,
  maximumAgeMs = holderOnDemandStaleMs,
): Promise<boolean> {
  const canonicalTokenAddress = canonicalAddress(tokenAddress);
  const session = await db.query.launchSessions.findFirst({
    where: and(
      ilike(launchSessions.tokenAddress, canonicalTokenAddress),
      eq(launchSessions.status, "ACTIVE"),
    ),
  });
  if (!session) return false;

  const settings = await db.query.buybotSettings.findFirst({
    where: and(
      eq(buybotSettings.groupId, session.groupId),
      eq(buybotSettings.enabled, true),
    ),
  });
  if (!settings) return false;

  const stats = await db.query.tokenHolderStats.findFirst({
    where: ilike(tokenHolderStats.tokenAddress, canonicalTokenAddress),
  });
  if (stats && Date.now() - stats.updatedAt.getTime() < maximumAgeMs) {
    return false;
  }

  await scheduleTokenHolderSync({
    tokenAddress: canonicalTokenAddress,
    reason,
  });
  return true;
}

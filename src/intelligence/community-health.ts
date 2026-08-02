import type { Api } from "grammy";
import { and, count, countDistinct, desc, eq, gt, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communityHealthSnapshots,
  groupModerationSettings,
  memberVerifications,
  moderationActions,
} from "@/db/schema";

function snapshotId(groupId: string, date: Date): string {
  return `${groupId}:${date.toISOString().slice(0, 10)}`;
}

function growth(current: number, baseline?: number): string {
  if (baseline === undefined) return "Collecting baseline";
  const difference = current - baseline;
  return `${difference >= 0 ? "+" : ""}${difference.toLocaleString("en-US")}`;
}

async function countVerificationRows(
  groupId: string,
  input: { since?: Date; status?: "PENDING" | "VERIFIED" | "EXPIRED"; activeOnly?: boolean },
): Promise<number> {
  const filters = [eq(memberVerifications.groupId, groupId)];
  if (input.since) filters.push(gte(memberVerifications.createdAt, input.since));
  if (input.status) filters.push(eq(memberVerifications.status, input.status));
  if (input.activeOnly) filters.push(gt(memberVerifications.expiresAt, new Date()));
  const [row] = await db.select({ value: count() }).from(memberVerifications).where(and(...filters));
  return row?.value ?? 0;
}

async function countActions(
  groupId: string,
  since: Date,
  action: typeof moderationActions.$inferSelect.action,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(moderationActions)
    .where(
      and(
        eq(moderationActions.groupId, groupId),
        eq(moderationActions.action, action),
        gte(moderationActions.createdAt, since),
      ),
    );
  return row?.value ?? 0;
}

export async function renderCommunityHealth(api: Api, numericGroupId: number): Promise<string> {
  const groupId = String(numericGroupId);
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const latestSnapshot = await db.query.communityHealthSnapshots.findFirst({
    where: eq(communityHealthSnapshots.groupId, groupId),
    orderBy: [desc(communityHealthSnapshots.capturedAt)],
  });
  const shouldRefreshMemberCount =
    !latestSnapshot || now.getTime() - latestSnapshot.capturedAt.getTime() >= 60_000;
  const memberCount = shouldRefreshMemberCount
    ? await api.getChatMemberCount(numericGroupId)
    : latestSnapshot.memberCount;

  if (shouldRefreshMemberCount) {
    await db
      .insert(communityHealthSnapshots)
      .values({ id: snapshotId(groupId, now), groupId, memberCount, capturedAt: now })
      .onConflictDoUpdate({
        target: communityHealthSnapshots.id,
        set: { memberCount, capturedAt: now },
      });
  }

  const [baseline24h, baseline7d, joined24h, joined7d, verified24h, expired24h, pending, floodMuted, blocked, bots, verifiedTotal, moderation] = await Promise.all([
    db.query.communityHealthSnapshots.findFirst({ where: and(eq(communityHealthSnapshots.groupId, groupId), lte(communityHealthSnapshots.capturedAt, since24h)), orderBy: [desc(communityHealthSnapshots.capturedAt)] }),
    db.query.communityHealthSnapshots.findFirst({ where: and(eq(communityHealthSnapshots.groupId, groupId), lte(communityHealthSnapshots.capturedAt, since7d)), orderBy: [desc(communityHealthSnapshots.capturedAt)] }),
    countVerificationRows(groupId, { since: since24h }),
    countVerificationRows(groupId, { since: since7d }),
    countVerificationRows(groupId, { since: since24h, status: "VERIFIED" }),
    countVerificationRows(groupId, { since: since24h, status: "EXPIRED" }),
    countVerificationRows(groupId, { status: "PENDING", activeOnly: true }),
    countActions(groupId, since24h, "FLOOD_MUTED"),
    countActions(groupId, since24h, "MESSAGE_BLOCKED"),
    countActions(groupId, since24h, "BOT_ACCOUNT_DETECTED"),
    db.select({ value: countDistinct(memberVerifications.userId) }).from(memberVerifications).where(and(eq(memberVerifications.groupId, groupId), eq(memberVerifications.status, "VERIFIED"))).then(([row]) => row?.value ?? 0),
    db.query.groupModerationSettings.findFirst({ where: eq(groupModerationSettings.groupId, groupId) }),
  ]);

  const resolved24h = verified24h + expired24h;
  const verificationRate = resolved24h > 0 ? `${((verified24h / resolved24h) * 100).toFixed(1)}%` : "No completed attempts";
  const moderationEnabled = Boolean(moderation?.welcomeEnabled && moderation.verificationEnabled && moderation.antiFloodEnabled);

  return [
    "👥 <b>TELEPONS COMMUNITY HEALTH</b>",
    "",
    `<b>Members</b>`,
    `Current members: ${memberCount.toLocaleString("en-US")}`,
    `New members observed, 24H: ${joined24h.toLocaleString("en-US")}`,
    `New members observed, 7D: ${joined7d.toLocaleString("en-US")}`,
    `Member-count change, 24H: ${growth(memberCount, baseline24h?.memberCount)}`,
    `Member-count change, 7D: ${growth(memberCount, baseline7d?.memberCount)}`,
    "",
    `<b>Human verification</b>`,
    `Verified members observed: ${verifiedTotal.toLocaleString("en-US")}`,
    `Verified in 24H: ${verified24h.toLocaleString("en-US")}`,
    `Verification success rate, 24H: ${verificationRate}`,
    `Pending verification: ${pending.toLocaleString("en-US")}`,
    `Bot accounts detected, 24H: ${bots.toLocaleString("en-US")}`,
    "",
    `<b>Moderation, 24H</b>`,
    `Status: ${moderationEnabled ? "🟢 ACTIVE" : "⚪ PARTIAL OR OFF"}`,
    `Flood mutes: ${floodMuted.toLocaleString("en-US")}`,
    `Messages blocked: ${blocked.toLocaleString("en-US")}`,
    "",
    "<i>Member growth requires an older Telepons snapshot. No personal member data is displayed.</i>",
  ].join("\n");
}

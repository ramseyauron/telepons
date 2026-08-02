import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { getAddress } from "viem";
import { isPublicHttpsUrl } from "@/bot/launch-announcement";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  buybotSettings,
  groupModerationSettings,
  groupTokenIntelligence,
} from "@/db/schema";
import { activeTokenSession } from "@/intelligence/token-intelligence";

export type OwnerPanelAction =
  | "buybot"
  | "dashboard"
  | "milestones"
  | "graduation"
  | "moderation"
  | "community"
  | "refresh";

export async function ensureOwnerPanelSettings(groupId: string) {
  await Promise.all([
    db.insert(buybotSettings).values({ groupId }).onConflictDoNothing({ target: buybotSettings.groupId }),
    db.insert(groupTokenIntelligence).values({ groupId }).onConflictDoNothing({ target: groupTokenIntelligence.groupId }),
    db.insert(groupModerationSettings).values({ groupId }).onConflictDoNothing({ target: groupModerationSettings.groupId }),
  ]);
}

export async function applyOwnerPanelAction(groupId: string, action: OwnerPanelAction) {
  await ensureOwnerPanelSettings(groupId);
  if (action === "buybot") {
    const row = await db.query.buybotSettings.findFirst({ where: eq(buybotSettings.groupId, groupId) });
    await db.update(buybotSettings).set({ enabled: !row?.enabled }).where(eq(buybotSettings.groupId, groupId));
  } else if (action === "dashboard") {
    const row = await db.query.groupTokenIntelligence.findFirst({ where: eq(groupTokenIntelligence.groupId, groupId) });
    await db.update(groupTokenIntelligence).set({ dashboardEnabled: !row?.dashboardEnabled, updatedAt: new Date() }).where(eq(groupTokenIntelligence.groupId, groupId));
  } else if (action === "milestones") {
    const row = await db.query.groupTokenIntelligence.findFirst({ where: eq(groupTokenIntelligence.groupId, groupId) });
    await db.update(groupTokenIntelligence).set({ milestonesEnabled: !row?.milestonesEnabled, updatedAt: new Date() }).where(eq(groupTokenIntelligence.groupId, groupId));
  } else if (action === "graduation") {
    const row = await db.query.groupTokenIntelligence.findFirst({ where: eq(groupTokenIntelligence.groupId, groupId) });
    await db.update(groupTokenIntelligence).set({ graduationAlertsEnabled: !row?.graduationAlertsEnabled, updatedAt: new Date() }).where(eq(groupTokenIntelligence.groupId, groupId));
  } else if (action === "moderation") {
    const row = await db.query.groupModerationSettings.findFirst({ where: eq(groupModerationSettings.groupId, groupId) });
    const enabled = !(row?.welcomeEnabled && row.verificationEnabled && row.antiFloodEnabled);
    await db.update(groupModerationSettings).set({ welcomeEnabled: enabled, verificationEnabled: enabled, antiFloodEnabled: enabled, updatedAt: new Date() }).where(eq(groupModerationSettings.groupId, groupId));
  }
}

function state(enabled: boolean | undefined): string {
  return enabled ? "🟢" : "⚪";
}

export async function renderOwnerPanel(groupId: string) {
  await ensureOwnerPanelSettings(groupId);
  const [buybot, intelligence, moderation, session] = await Promise.all([
    db.query.buybotSettings.findFirst({ where: eq(buybotSettings.groupId, groupId) }),
    db.query.groupTokenIntelligence.findFirst({ where: eq(groupTokenIntelligence.groupId, groupId) }),
    db.query.groupModerationSettings.findFirst({ where: eq(groupModerationSettings.groupId, groupId) }),
    activeTokenSession(groupId),
  ]);
  const moderationEnabled = Boolean(moderation?.welcomeEnabled && moderation.verificationEnabled && moderation.antiFloodEnabled);
  const keyboard = new InlineKeyboard()
    .text(`${state(buybot?.enabled)} BuyBot`, "panel:buybot")
    .text(`${state(intelligence?.dashboardEnabled)} Dashboard`, "panel:dashboard")
    .row()
    .text(`${state(intelligence?.milestonesEnabled)} Milestones`, "panel:milestones")
    .text(`${state(intelligence?.graduationAlertsEnabled)} Graduation`, "panel:graduation")
    .row()
    .text(`${state(moderationEnabled)} Moderation`, "panel:moderation")
    .text("👥 Community health", "panel:community")
    .row()
    .text("↻ Refresh", "panel:refresh");

  if (session) {
    const reportUrl = `${env.APP_BASE_URL.replace(/\/$/, "")}/token/${getAddress(session.tokenAddress)}`;
    if (isPublicHttpsUrl(reportUrl)) keyboard.row().url("Open token report", reportUrl);
  }

  return {
    text: [
      "⚙️ <b>TELEPONS OWNER CONTROL PANEL</b>",
      "",
      `Token status: ${session ? "🟢 ACTIVE" : "⚪ PRE-LAUNCH"}`,
      "",
      "Tap a control to switch it on or off.",
      "Only the current Telegram group owner can use these controls.",
      `Updated: ${new Date().toISOString()}`,
    ].join("\n"),
    keyboard,
  };
}

import type { Context } from "grammy";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  telegramBotInstallations,
  telegramGroups,
} from "@/db/schema";

const installedStatuses = new Set(["member", "administrator"]);
const removedStatuses = new Set(["left", "kicked"]);

export async function recordBotMembershipChange(
  ctx: Context,
): Promise<void> {
  const update = ctx.myChatMember;
  if (!update) return;

  const { chat, new_chat_member: newMember } = update;
  if (chat.type !== "group" && chat.type !== "supergroup") return;

  const now = new Date();
  const isInstalled = installedStatuses.has(newMember.status);
  const isRemoved = removedStatuses.has(newMember.status);
  if (!isInstalled && !isRemoved) return;

  await db
    .insert(telegramBotInstallations)
    .values({
      groupId: String(chat.id),
      title: chat.title,
      chatType: chat.type,
      active: isInstalled,
      addedAt: now,
      removedAt: isRemoved ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: telegramBotInstallations.groupId,
      set: {
        title: chat.title,
        chatType: chat.type,
        active: isInstalled,
        removedAt: isRemoved ? now : null,
        updatedAt: now,
      },
    });
}

export async function getBotGroupCounts(): Promise<{
  active: number;
  total: number;
}> {
  const [counts] = await db
    .select({
      active: sql<number>`sum(case when ${telegramBotInstallations.active} = 1 then 1 else 0 end)`,
      total: sql<number>`count(*)`,
    })
    .from(telegramBotInstallations);

  return {
    active: Number(counts?.active ?? 0),
    total: Number(counts?.total ?? 0),
  };
}

export async function backfillConfiguredGroupInstallations(): Promise<void> {
  const configuredGroups = await db.select().from(telegramGroups);
  const now = new Date();

  for (const group of configuredGroups) {
    await db
      .insert(telegramBotInstallations)
      .values({
        groupId: group.id,
        title: group.title,
        chatType: "supergroup",
        active: true,
        addedAt: group.createdAt,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: telegramBotInstallations.groupId,
      });
  }
}

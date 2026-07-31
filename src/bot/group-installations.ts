import type { Context } from "grammy";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  groupModerationSettings,
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

export async function recordGroupChatMigration(ctx: Context): Promise<void> {
  const newGroupId = ctx.message?.migrate_to_chat_id;
  if (!newGroupId || !ctx.chat) return;

  const oldGroupId = String(ctx.chat.id);
  const migratedGroupId = String(newGroupId);
  const title =
    "title" in ctx.chat
      ? (ctx.chat.title ?? "Telegram group")
      : "Telegram group";
  const existing = await db.query.telegramBotInstallations.findFirst({
    where: eq(telegramBotInstallations.groupId, oldGroupId),
  });
  const oldModerationSettings =
    await db.query.groupModerationSettings.findFirst({
      where: eq(groupModerationSettings.groupId, oldGroupId),
    });
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(telegramBotInstallations)
      .values({
        groupId: migratedGroupId,
        title,
        chatType: "supergroup",
        active: true,
        addedAt: existing?.addedAt ?? now,
        removedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: telegramBotInstallations.groupId,
        set: {
          title,
          chatType: "supergroup",
          active: true,
          removedAt: null,
          updatedAt: now,
        },
      });
    await tx
      .delete(telegramBotInstallations)
      .where(eq(telegramBotInstallations.groupId, oldGroupId));
    if (oldModerationSettings) {
      await tx
        .insert(groupModerationSettings)
        .values({
          ...oldModerationSettings,
          groupId: migratedGroupId,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: groupModerationSettings.groupId });
      await tx
        .delete(groupModerationSettings)
        .where(eq(groupModerationSettings.groupId, oldGroupId));
    }
  });
}

export async function getBotGroupCounts(): Promise<{
  active: number;
  total: number;
}> {
  const [counts] = await db
    .select({
      active: sql<number>`sum(case when ${telegramBotInstallations.active} then 1 else 0 end)`,
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

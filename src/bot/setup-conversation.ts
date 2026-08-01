import type { Context } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  groupModerationSettings,
  groupSetupConversations,
} from "@/db/schema";
import { isCurrentGroupOwner, isGroupContext } from "@/bot/authorization";
import { requireChannelSubscriptions } from "@/bot/subscription";
import { formatGroupWelcome } from "@/setup/welcome-formatter";

const conversationLifetimeMs = 30 * 60 * 1_000;

export async function handleGroupSetupConversation(
  ctx: Context,
): Promise<boolean> {
  if (
    !isGroupContext(ctx) ||
    !ctx.chat ||
    !ctx.from ||
    !ctx.message?.text ||
    ctx.message.text.startsWith("/")
  ) {
    return false;
  }

  const groupId = String(ctx.chat.id);
  const conversation = await db.query.groupSetupConversations.findFirst({
    where: eq(groupSetupConversations.groupId, groupId),
  });
  if (!conversation) return false;

  if (
    conversation.ownerUserId !== String(ctx.from.id) ||
    !(await isCurrentGroupOwner(ctx))
  ) {
    return false;
  }
  if (!(await requireChannelSubscriptions(ctx))) return true;

  if (conversation.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(groupSetupConversations)
      .where(eq(groupSetupConversations.groupId, groupId));
    await ctx.reply("The setup session expired. Run /setup to start again.");
    return true;
  }

  const answer = ctx.message.text.trim();
  if (conversation.step === "GROUP_DESCRIPTION") {
    if (answer.length < 10 || answer.length > 1_000) {
      await ctx.reply(
        "Describe the group in 10–1,000 characters. Mention its purpose and the kind of community you want to build.",
      );
      return true;
    }

    await db
      .update(groupSetupConversations)
      .set({
        step: "WELCOME_MESSAGE",
        groupDescription: answer,
        expiresAt: new Date(Date.now() + conversationLifetimeMs),
        updatedAt: new Date(),
      })
      .where(eq(groupSetupConversations.groupId, groupId));
    await ctx.reply(
      [
        "Group description saved.",
        "",
        "Now describe what the welcome message should say to newly verified members.",
        "Telepons will format it into a consistent community welcome message.",
      ].join("\n"),
    );
    return true;
  }

  if (answer.length < 3 || answer.length > 1_000) {
    await ctx.reply(
      "Send the welcome-message idea in 3–1,000 characters.",
    );
    return true;
  }

  const groupDescription = conversation.groupDescription;
  if (!groupDescription) {
    await db
      .delete(groupSetupConversations)
      .where(eq(groupSetupConversations.groupId, groupId));
    await ctx.reply("The setup data is incomplete. Run /setup to start again.");
    return true;
  }

  try {
    const groupTitle =
      "title" in ctx.chat ? (ctx.chat.title ?? "this community") : "this community";
    const welcomeMessage = await formatGroupWelcome({
      groupTitle,
      groupDescription,
      ownerMessage: answer,
    });

    await db.transaction(async (tx) => {
      await tx
        .insert(groupModerationSettings)
        .values({ groupId, groupDescription, welcomeMessage })
        .onConflictDoUpdate({
          target: groupModerationSettings.groupId,
          set: {
            groupDescription,
            welcomeMessage,
            updatedAt: new Date(),
          },
        });
      await tx
        .delete(groupSetupConversations)
        .where(eq(groupSetupConversations.groupId, groupId));
    });

    await ctx.reply(
      [
        "Setup complete.",
        "",
        "New members will receive this message after verification:",
        "",
        welcomeMessage.replace("{member}", ctx.from.first_name),
        "",
        "Only the group owner can start and manage a token launch.",
      ].join("\n"),
    );
  } catch (error) {
    console.error("Could not format group welcome message", {
      groupId,
      error,
    });
    await ctx.reply(
      "The welcome message could not be formatted. Please send the same welcome-message idea again.",
    );
  }

  return true;
}

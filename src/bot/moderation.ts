import { randomBytes } from "node:crypto";
import {
  InlineKeyboard,
  type Api,
  type Context,
  type NextFunction,
} from "grammy";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/config/env";
import { isPublicHttpsUrl } from "@/bot/launch-announcement";
import {
  groupModerationSettings,
  memberVerifications,
  moderationActions,
} from "@/db/schema";

const verificationLifetimeMs = 5 * 60 * 1000;
const floodWindows = new Map<string, number[]>();
const administratorCache = new Map<string, { value: boolean; expiresAt: number }>();
const evmAddressPattern = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
const blockedNameFragments = ["contract", "address"] as const;

function actionId(): string {
  return `mod_${randomBytes(18).toString("base64url")}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderWelcomeMessage(
  template: string | null | undefined,
  member: { id: number; firstName: string },
): string {
  const mention = `<a href="tg://user?id=${member.id}">${escapeHtml(member.firstName)}</a>`;
  if (!template) return `Welcome, ${mention}!`;

  return template
    .split("{member}")
    .map(escapeHtml)
    .join(mention);
}

export async function sendRollingWelcome(input: {
  api: Api;
  groupId: number;
  userId: number;
  firstName: string;
  template?: string | null;
}): Promise<number> {
  const groupId = String(input.groupId);
  await db
    .insert(groupModerationSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: groupModerationSettings.groupId });

  return db.transaction(async (tx) => {
    const [settings] = await tx
      .select()
      .from(groupModerationSettings)
      .where(eq(groupModerationSettings.groupId, groupId))
      .for("update")
      .limit(1);

    if (settings?.lastWelcomeMessageId) {
      try {
        await input.api.deleteMessage(
          input.groupId,
          Number(settings.lastWelcomeMessageId),
        );
      } catch (error) {
        console.error("Could not delete previous welcome message", {
          groupId,
          messageId: settings.lastWelcomeMessageId,
          error,
        });
      }
    }

    const welcomeText = renderWelcomeMessage(
      input.template ?? settings?.welcomeMessage,
      { id: input.userId, firstName: input.firstName },
    );
    let message;
    if (settings?.welcomeImageTelegramFileId) {
      try {
        message = await input.api.sendPhoto(
          input.groupId,
          settings.welcomeImageTelegramFileId,
          { caption: welcomeText, parse_mode: "HTML" },
        );
      } catch (error) {
        console.error("Could not send welcome Telegram file; trying IPFS URL", {
          groupId,
          error,
        });
        try {
          if (!settings.welcomeImagePublicUrl) throw error;
          message = await input.api.sendPhoto(
            input.groupId,
            settings.welcomeImagePublicUrl,
            { caption: welcomeText, parse_mode: "HTML" },
          );
        } catch (fallbackError) {
          console.error("Could not send welcome image; using text fallback", {
            groupId,
            error: fallbackError,
          });
          message = await input.api.sendMessage(input.groupId, welcomeText, {
            parse_mode: "HTML",
          });
        }
      }
    } else {
      message = await input.api.sendMessage(input.groupId, welcomeText, {
        parse_mode: "HTML",
      });
    }

    await tx
      .update(groupModerationSettings)
      .set({
        lastWelcomeMessageId: String(message.message_id),
        updatedAt: new Date(),
      })
      .where(eq(groupModerationSettings.groupId, groupId));

    return message.message_id;
  });
}

async function settingsFor(groupId: string) {
  await db
    .insert(groupModerationSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: groupModerationSettings.groupId });
  return db.query.groupModerationSettings.findFirst({
    where: eq(groupModerationSettings.groupId, groupId),
  });
}

async function logAction(input: {
  groupId: string;
  userId: string;
  action: typeof moderationActions.$inferInsert.action;
  details?: unknown;
}) {
  await db.insert(moderationActions).values({
    id: actionId(),
    groupId: input.groupId,
    userId: input.userId,
    action: input.action,
    detailsJson: input.details ? JSON.stringify(input.details) : null,
  });
}

async function isAdministrator(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from || ctx.chat.type === "private") return false;
  const key = `${ctx.chat.id}:${ctx.from.id}`;
  const cached = administratorCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
  const value = member.status === "creator" || member.status === "administrator";
  administratorCache.set(key, { value, expiresAt: Date.now() + 60_000 });
  return value;
}

async function muteMember(ctx: Context, userId: number, seconds?: number) {
  if (!ctx.chat) return;
  await ctx.api.restrictChatMember(
    ctx.chat.id,
    userId,
    { can_send_messages: false },
    seconds
      ? { until_date: Math.floor(Date.now() / 1000) + seconds }
      : undefined,
  );
}

function suspiciousMemberName(member: {
  first_name: string;
  last_name?: string;
  username?: string;
}): { matched: string; value: string } | null {
  const value = [member.first_name, member.last_name, member.username]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const normalized = value.toLowerCase();
  const blockedFragment = blockedNameFragments.find((fragment) =>
    normalized.includes(fragment),
  );
  if (blockedFragment) return { matched: blockedFragment, value };
  if (evmAddressPattern.test(value)) return { matched: "evm_address", value };
  return null;
}

async function kickSuspiciousMember(
  ctx: Context,
  member: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  },
  match: { matched: string; value: string },
): Promise<boolean> {
  if (!ctx.chat) return false;

  // A creator or administrator may legitimately use a project-oriented name.
  // Check their current role before applying an irreversible moderation action.
  try {
    const chatMember = await ctx.api.getChatMember(ctx.chat.id, member.id);
    if (
      chatMember.status === "creator" ||
      chatMember.status === "administrator"
    ) {
      return false;
    }
  } catch (error) {
    console.error("Could not verify suspicious member role", {
      groupId: String(ctx.chat.id),
      userId: String(member.id),
      error,
    });
    return false;
  }

  try {
    await ctx.api.banChatMember(ctx.chat.id, member.id);
    // Telegram implements a kick as ban followed by unban. The account is
    // removed now but may deliberately join again later with a safe name.
    await ctx.api.unbanChatMember(ctx.chat.id, member.id, {
      only_if_banned: true,
    });
    await logAction({
      groupId: String(ctx.chat.id),
      userId: String(member.id),
      action: "SUSPICIOUS_NAME_KICKED",
      details: {
        reason: match.matched,
        displayedIdentity: match.value,
      },
    });
    return true;
  } catch (error) {
    console.error("Could not kick suspiciously named member", {
      groupId: String(ctx.chat.id),
      userId: String(member.id),
      reason: match.matched,
      error,
    });
    return false;
  }
}

export async function restoreMemberAccess(
  api: Api,
  groupId: number,
  userId: number,
) {
  const chat = await api.getChat(groupId);
  const permissions =
    "permissions" in chat && chat.permissions
      ? chat.permissions
      : {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
          can_manage_topics: false,
        };
  await api.restrictChatMember(groupId, userId, permissions);
}

async function welcomeNewMembers(ctx: Context): Promise<boolean> {
  if (!ctx.chat) return false;
  let newMembers = ctx.message?.new_chat_members;

  if (!newMembers && ctx.chatMember) {
    const oldMember = ctx.chatMember.old_chat_member;
    const newMember = ctx.chatMember.new_chat_member;
    const wasPresent =
      oldMember.status === "creator" ||
      oldMember.status === "administrator" ||
      oldMember.status === "member" ||
      (oldMember.status === "restricted" && oldMember.is_member);
    const isPresent =
      newMember.status === "creator" ||
      newMember.status === "administrator" ||
      newMember.status === "member" ||
      (newMember.status === "restricted" && newMember.is_member);

    if (!wasPresent && isPresent) {
      newMembers = [newMember.user];
    }
  }

  if (!newMembers?.length) return false;
  const groupId = String(ctx.chat.id);
  const settings = await settingsFor(groupId);
  if (!settings) return true;

  if (ctx.message?.new_chat_members) {
    try {
      await ctx.deleteMessage();
    } catch (error) {
      console.error("Could not delete Telegram join service message", {
        groupId,
        messageId: ctx.message.message_id,
        error,
      });
    }
  }

  for (const member of newMembers) {
    if (member.id === ctx.me.id) continue;
    const userId = String(member.id);

    if (member.is_bot) {
      await logAction({ groupId, userId, action: "BOT_ACCOUNT_DETECTED" });
      continue;
    }

    const suspiciousName = suspiciousMemberName(member);
    if (
      suspiciousName &&
      (await kickSuspiciousMember(ctx, member, suspiciousName))
    ) {
      continue;
    }

    if (!settings.verificationEnabled) {
      if (settings.welcomeEnabled) {
        await sendRollingWelcome({
          api: ctx.api,
          groupId: ctx.chat.id,
          userId: member.id,
          firstName: member.first_name,
          template: settings.welcomeMessage,
        });
      }
      continue;
    }

    const left = 1 + Math.floor(Math.random() * 9);
    const right = 1 + Math.floor(Math.random() * 9);
    const answer = left + right;
    const verificationId = `${groupId}:${userId}`;
    const verificationToken = randomBytes(32).toString("base64url");

    await db
      .insert(memberVerifications)
      .values({
        id: verificationId,
        groupId,
        userId,
        firstName: member.first_name,
        status: "PENDING",
        expectedAnswer: answer,
        challengePrompt: `What is ${left} + ${right}?`,
        verificationToken,
        attemptCount: 0,
        expiresAt: new Date(Date.now() + verificationLifetimeMs),
      })
      .onConflictDoUpdate({
        target: memberVerifications.id,
        set: {
          status: "PENDING",
          firstName: member.first_name,
          expectedAnswer: answer,
          challengePrompt: `What is ${left} + ${right}?`,
          verificationToken,
          challengeAccessToken: null,
          attemptCount: 0,
          expiresAt: new Date(Date.now() + verificationLifetimeMs),
          verifiedAt: null,
          claimedAt: null,
        },
      });
    await logAction({
      groupId,
      userId,
      action: "VERIFICATION_STARTED",
    });

    try {
      await muteMember(ctx, member.id);
    } catch (error) {
      console.error("Could not mute pending member", error);
    }

    const verificationDeepLink = `https://t.me/${ctx.me.username}?start=verify_${verificationToken}`;
    const keyboard = new InlineKeyboard().url(
      "Verify human",
      verificationDeepLink,
    );
    const challenge = await ctx.reply(
      [
        `Verification required for <a href="tg://user?id=${member.id}">${escapeHtml(member.first_name)}</a>.`,
        "",
        "Open Telepons and complete the private challenge within 5 minutes.",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );
    await db
      .update(memberVerifications)
      .set({ challengeMessageId: String(challenge.message_id) })
      .where(eq(memberVerifications.id, verificationId));
  }
  return true;
}

export async function handleMemberVerificationStart(
  ctx: Context,
): Promise<boolean> {
  if (ctx.chat?.type !== "private" || !ctx.from || !ctx.message?.text) {
    return false;
  }

  const payload = ctx.message.text.match(/^\/start\s+verify_([A-Za-z0-9_-]{43})$/)?.[1];
  if (!payload) return false;

  const verification = await db.query.memberVerifications.findFirst({
    where: eq(memberVerifications.verificationToken, payload),
  });
  if (
    !verification ||
    verification.status !== "PENDING" ||
    verification.expiresAt.getTime() <= Date.now()
  ) {
    await ctx.reply(
      "This verification request is unavailable or expired. Rejoin the group to request a new verification.",
    );
    return true;
  }

  if (verification.userId !== String(ctx.from.id)) {
    await ctx.reply("This verification belongs to another member.");
    await logAction({
      groupId: verification.groupId,
      userId: String(ctx.from.id),
      action: "MESSAGE_BLOCKED",
      details: {
        reason: "VERIFICATION_IDENTITY_MISMATCH",
        expectedUserId: verification.userId,
      },
    });
    return true;
  }

  const challengeAccessToken =
    verification.challengeAccessToken ?? randomBytes(32).toString("base64url");
  if (!verification.challengeAccessToken) {
    await db
      .update(memberVerifications)
      .set({ challengeAccessToken, claimedAt: new Date() })
      .where(
        and(
          eq(memberVerifications.id, verification.id),
          eq(memberVerifications.status, "PENDING"),
        ),
      );
  }

  const challengeUrl = new URL(
    `/verify/${challengeAccessToken}`,
    env.APP_BASE_URL,
  ).toString();
  const keyboard = new InlineKeyboard();
  if (isPublicHttpsUrl(challengeUrl)) {
    keyboard.url("Open challenge", challengeUrl);
  } else {
    keyboard.copyText("Copy challenge link", challengeUrl);
  }

  let groupTitle = "your community group";
  try {
    const group = await ctx.api.getChat(Number(verification.groupId));
    if ("title" in group && group.title) groupTitle = group.title;
  } catch (error) {
    console.error("Could not load verification group", {
      groupId: verification.groupId,
      error,
    });
  }

  const remainingSeconds = Math.max(
    1,
    Math.ceil((verification.expiresAt.getTime() - Date.now()) / 1_000),
  );
  await ctx.reply(
    [
      "Human verification",
      "",
      `Group: ${groupTitle}`,
      `Time remaining: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`,
      "",
      "Complete the challenge to restore your access to the group.",
    ].join("\n"),
    { reply_markup: keyboard },
  );

  if (verification.challengeMessageId) {
    try {
      await ctx.api.editMessageText(
        Number(verification.groupId),
        Number(verification.challengeMessageId),
        `⏳ <a href="tg://user?id=${verification.userId}">${escapeHtml(verification.firstName)}</a> started verification privately.`,
        { parse_mode: "HTML" },
      );
    } catch (error) {
      console.error("Could not update group verification message", error);
    }
  }

  return true;
}

async function handleVerificationCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("human_verify:") || !ctx.chat || !ctx.from) return false;
  const [, expectedUserId, selectedAnswer] = data.split(":");

  if (String(ctx.from.id) !== expectedUserId) {
    await ctx.answerCallbackQuery({
      text: "This verification belongs to another member.",
      show_alert: true,
    });
    return true;
  }

  const verification = await db.query.memberVerifications.findFirst({
    where: and(
      eq(memberVerifications.groupId, String(ctx.chat.id)),
      eq(memberVerifications.userId, expectedUserId),
    ),
  });
  if (
    !verification ||
    verification.status !== "PENDING" ||
    verification.expiresAt.getTime() <= Date.now()
  ) {
    await ctx.answerCallbackQuery({
      text: "This verification has expired.",
      show_alert: true,
    });
    return true;
  }

  if (Number(selectedAnswer) !== verification.expectedAnswer) {
    await ctx.answerCallbackQuery({
      text: "Incorrect answer. Try again.",
      show_alert: true,
    });
    return true;
  }

  await restoreMemberAccess(ctx.api, ctx.chat.id, ctx.from.id);
  await db
    .update(memberVerifications)
    .set({ status: "VERIFIED", verifiedAt: new Date() })
    .where(eq(memberVerifications.id, verification.id));
  await logAction({
    groupId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    action: "VERIFICATION_PASSED",
  });
  const settings = await settingsFor(String(ctx.chat.id));
  await ctx.answerCallbackQuery({ text: "Verification passed." });
  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error("Could not delete completed verification prompt", error);
  }
  if (settings?.welcomeEnabled !== false) {
    await sendRollingWelcome({
      api: ctx.api,
      groupId: ctx.chat.id,
      userId: ctx.from.id,
      firstName: ctx.from.first_name,
      template: settings?.welcomeMessage,
    });
  }
  return true;
}

async function blockPendingMemberMessage(ctx: Context): Promise<boolean> {
  if (!ctx.message || !ctx.chat || !ctx.from) return false;
  const verification = await db.query.memberVerifications.findFirst({
    where: and(
      eq(memberVerifications.groupId, String(ctx.chat.id)),
      eq(memberVerifications.userId, String(ctx.from.id)),
      eq(memberVerifications.status, "PENDING"),
    ),
  });
  if (!verification) return false;

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.error("Could not delete pending-member message", error);
  }
  await logAction({
    groupId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    action: "MESSAGE_BLOCKED",
    details: { reason: "PENDING_VERIFICATION" },
  });
  return true;
}

async function enforceAntiFlood(ctx: Context): Promise<boolean> {
  if (!ctx.message || !ctx.chat || !ctx.from || ctx.chat.type === "private") {
    return false;
  }
  const settings = await settingsFor(String(ctx.chat.id));
  if (!settings?.antiFloodEnabled || (await isAdministrator(ctx))) return false;

  const key = `${ctx.chat.id}:${ctx.from.id}`;
  const now = Date.now();
  const threshold = now - settings.floodWindowSeconds * 1000;
  const recent = (floodWindows.get(key) ?? []).filter(
    (timestamp) => timestamp >= threshold,
  );
  recent.push(now);
  floodWindows.set(key, recent);
  if (recent.length <= settings.floodMaxMessages) return false;

  floodWindows.delete(key);
  try {
    await ctx.deleteMessage();
    await muteMember(ctx, ctx.from.id, settings.muteSeconds);
  } catch (error) {
    console.error("Could not enforce anti-flood mute", error);
  }
  await logAction({
    groupId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    action: "FLOOD_MUTED",
    details: {
      messageCount: recent.length,
      windowSeconds: settings.floodWindowSeconds,
      muteSeconds: settings.muteSeconds,
    },
  });
  await ctx.reply(
    `⚠️ <a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a> was muted for ${settings.muteSeconds} seconds due to flooding.`,
    { parse_mode: "HTML" },
  );
  return true;
}

export async function moderationMiddleware(
  ctx: Context,
  next: NextFunction,
): Promise<void> {
  if (ctx.message?.migrate_to_chat_id) {
    await next();
    return;
  }
  if (!ctx.chat || ctx.chat.type === "private") {
    await next();
    return;
  }
  if (await handleVerificationCallback(ctx)) return;
  if (await welcomeNewMembers(ctx)) return;
  if (await blockPendingMemberMessage(ctx)) return;
  if (await enforceAntiFlood(ctx)) return;
  await next();
}

export async function expirePendingVerifications(api: Api): Promise<number> {
  const expired = await db.query.memberVerifications.findMany({
    where: and(
      eq(memberVerifications.status, "PENDING"),
      lte(memberVerifications.expiresAt, new Date()),
    ),
  });

  for (const verification of expired) {
    await db
      .update(memberVerifications)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(memberVerifications.id, verification.id),
          eq(memberVerifications.status, "PENDING"),
        ),
      );
    await logAction({
      groupId: verification.groupId,
      userId: verification.userId,
      action: "VERIFICATION_EXPIRED",
    });

    if (verification.challengeMessageId) {
      try {
        await api.deleteMessage(
          Number(verification.groupId),
          Number(verification.challengeMessageId),
        );
      } catch (error) {
        console.error("Could not delete expired verification prompt", error);
      }
    }
  }

  return expired.length;
}

import { InlineKeyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import { downloadAndStoreTelegramLogo } from "@/assets/telegram-logo";
import { isCurrentGroupOwner, isGroupContext } from "@/bot/authorization";
import { renderWelcomeMessage } from "@/bot/moderation";
import { requireChannelSubscriptions } from "@/bot/subscription";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { groupModerationSettings, groupWelcomeDrafts } from "@/db/schema";

const draftLifetimeMs = 30 * 60 * 1_000;

function confirmationKeyboard(type: "message" | "image") {
  return new InlineKeyboard()
    .text(`Save ${type}`, `welcome:save_${type}`)
    .text(type === "image" ? "Replace image" : "Edit message", `welcome:replace_${type}`)
    .row()
    .text("Cancel", "welcome:cancel");
}

async function ensureSettings(groupId: string) {
  await db
    .insert(groupModerationSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: groupModerationSettings.groupId });
  return db.query.groupModerationSettings.findFirst({
    where: eq(groupModerationSettings.groupId, groupId),
  });
}

async function replaceDraft(input: {
  groupId: string;
  ownerUserId: string;
  mode: "MESSAGE" | "IMAGE";
}) {
  await db
    .insert(groupWelcomeDrafts)
    .values({
      groupId: input.groupId,
      ownerUserId: input.ownerUserId,
      mode: input.mode,
      expiresAt: new Date(Date.now() + draftLifetimeMs),
    })
    .onConflictDoUpdate({
      target: groupWelcomeDrafts.groupId,
      set: {
        ownerUserId: input.ownerUserId,
        mode: input.mode,
        message: null,
        imageTelegramFileId: null,
        imageStorageKey: null,
        imagePublicUrl: null,
        imagePinataFileId: null,
        imageCid: null,
        expiresAt: new Date(Date.now() + draftLifetimeMs),
        updatedAt: new Date(),
      },
    });
}

async function sendPreview(
  ctx: Context,
  input: { message?: string | null; imageTelegramFileId?: string | null; keyboard?: InlineKeyboard },
) {
  if (!ctx.from) return;
  const caption = renderWelcomeMessage(input.message, {
    id: ctx.from.id,
    firstName: ctx.from.first_name,
  });
  if (input.imageTelegramFileId) {
    await ctx.replyWithPhoto(input.imageTelegramFileId, {
      caption,
      parse_mode: "HTML",
      reply_markup: input.keyboard,
    });
    return;
  }
  await ctx.reply(caption, {
    parse_mode: "HTML",
    reply_markup: input.keyboard,
  });
}

export async function handleWelcomeCommand(ctx: Context): Promise<void> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can configure the welcome message.");
    return;
  }
  const groupId = String(ctx.chat.id);
  const input = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "";
  const settings = await ensureSettings(groupId);

  if (input === "message") {
    await replaceDraft({ groupId, ownerUserId: String(ctx.from.id), mode: "MESSAGE" });
    await ctx.reply([
      "Send the new welcome message now.",
      "",
      "Use {member} where the verified member should be mentioned.",
      "Maximum length: 900 characters.",
    ].join("\n"));
    return;
  }
  if (input === "image") {
    await replaceDraft({ groupId, ownerUserId: String(ctx.from.id), mode: "IMAGE" });
    await ctx.reply([
      "Send the new welcome image now.",
      "",
      "Accepted: PNG, JPEG, or WebP under 5 MB.",
      "Send it as a photo or image document.",
    ].join("\n"));
    return;
  }
  if (input === "image reset") {
    await db
      .update(groupModerationSettings)
      .set({
        welcomeImageTelegramFileId: null,
        welcomeImageStorageKey: null,
        welcomeImagePublicUrl: null,
        welcomeImagePinataFileId: null,
        welcomeImageCid: null,
        updatedAt: new Date(),
      })
      .where(eq(groupModerationSettings.groupId, groupId));
    await ctx.reply("The welcome image was removed. Future welcomes will be text-only.");
    return;
  }
  if (input === "preview") {
    await sendPreview(ctx, {
      message: settings?.welcomeMessage,
      imageTelegramFileId: settings?.welcomeImageTelegramFileId,
    });
    return;
  }
  if (input === "on" || input === "off") {
    await db
      .update(groupModerationSettings)
      .set({ welcomeEnabled: input === "on", updatedAt: new Date() })
      .where(eq(groupModerationSettings.groupId, groupId));
    await ctx.reply(`Welcome messages are now ${input === "on" ? "enabled" : "disabled"}.`);
    return;
  }
  if (input) {
    await ctx.reply("Use /welcome, /welcome message, /welcome image, /welcome image reset, /welcome preview, /welcome on, or /welcome off.");
    return;
  }

  await ctx.reply([
    "👋 Telepons welcome settings",
    "",
    `Status: ${settings?.welcomeEnabled ? "ON" : "OFF"}`,
    `Message: ${settings?.welcomeMessage ? "CONFIGURED" : "DEFAULT"}`,
    `Image: ${settings?.welcomeImageTelegramFileId ? "CONFIGURED" : "NONE"}`,
    "",
    "/welcome message",
    "/welcome image",
    "/welcome image reset",
    "/welcome preview",
    "/welcome on",
    "/welcome off",
  ].join("\n"));
}

export async function handleWelcomeText(ctx: Context): Promise<boolean> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from || !ctx.message?.text || ctx.message.text.startsWith("/")) return false;
  const groupId = String(ctx.chat.id);
  const draft = await db.query.groupWelcomeDrafts.findFirst({ where: eq(groupWelcomeDrafts.groupId, groupId) });
  if (!draft || draft.mode !== "MESSAGE" || draft.ownerUserId !== String(ctx.from.id)) return false;
  if (!(await isCurrentGroupOwner(ctx))) return false;
  if (!(await requireChannelSubscriptions(ctx))) return true;
  if (draft.expiresAt.getTime() <= Date.now()) {
    await db.delete(groupWelcomeDrafts).where(eq(groupWelcomeDrafts.groupId, groupId));
    await ctx.reply("The welcome editor expired. Run /welcome message to start again.");
    return true;
  }
  const message = ctx.message.text.trim();
  if (message.length < 3 || message.length > 900) {
    await ctx.reply("The welcome message must contain 3–900 characters.");
    return true;
  }
  await db.update(groupWelcomeDrafts).set({ message, expiresAt: new Date(Date.now() + draftLifetimeMs), updatedAt: new Date() }).where(eq(groupWelcomeDrafts.groupId, groupId));
  await sendPreview(ctx, { message, keyboard: confirmationKeyboard("message") });
  return true;
}

export async function handleWelcomeImage(ctx: Context, telegramFileId: string): Promise<boolean> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return false;
  const groupId = String(ctx.chat.id);
  const draft = await db.query.groupWelcomeDrafts.findFirst({ where: eq(groupWelcomeDrafts.groupId, groupId) });
  if (!draft || draft.mode !== "IMAGE" || draft.ownerUserId !== String(ctx.from.id)) return false;
  if (!(await isCurrentGroupOwner(ctx))) return false;
  if (!(await requireChannelSubscriptions(ctx))) return true;
  if (draft.expiresAt.getTime() <= Date.now()) {
    await db.delete(groupWelcomeDrafts).where(eq(groupWelcomeDrafts.groupId, groupId));
    await ctx.reply("The welcome-image editor expired. Run /welcome image to start again.");
    return true;
  }
  try {
    const telegramFile = await ctx.api.getFile(telegramFileId);
    if (!telegramFile.file_path) throw new Error("TELEGRAM_FILE_PATH_MISSING");
    const stored = await downloadAndStoreTelegramLogo({
      botToken: env.TELEGRAM_BOT_TOKEN!,
      telegramFilePath: telegramFile.file_path,
      storageNamespace: `welcome-${groupId}`,
      tokenSymbol: "WELCOME",
    });
    await db.update(groupWelcomeDrafts).set({
      imageTelegramFileId: telegramFileId,
      imageStorageKey: stored.storageKey,
      imagePublicUrl: stored.publicUrl,
      imagePinataFileId: stored.pinataFileId,
      imageCid: stored.cid,
      expiresAt: new Date(Date.now() + draftLifetimeMs),
      updatedAt: new Date(),
    }).where(eq(groupWelcomeDrafts.groupId, groupId));
    const settings = await ensureSettings(groupId);
    await sendPreview(ctx, { message: settings?.welcomeMessage, imageTelegramFileId: telegramFileId, keyboard: confirmationKeyboard("image") });
  } catch (error) {
    console.error("Could not save welcome image", { groupId, error });
    await ctx.reply("The welcome image could not be saved. Send a PNG, JPEG, or WebP image under 5 MB and confirm the Pinata configuration.");
  }
  return true;
}

export async function handleWelcomeCallback(ctx: Context, action: string): Promise<void> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.answerCallbackQuery({ text: "Only the group owner can use this control.", show_alert: true });
    return;
  }
  const groupId = String(ctx.chat.id);
  const draft = await db.query.groupWelcomeDrafts.findFirst({ where: eq(groupWelcomeDrafts.groupId, groupId) });
  if (!draft || draft.ownerUserId !== String(ctx.from.id) || draft.expiresAt.getTime() <= Date.now()) {
    await ctx.answerCallbackQuery({ text: "This welcome draft expired.", show_alert: true });
    return;
  }
  if (action === "cancel") {
    await db.delete(groupWelcomeDrafts).where(eq(groupWelcomeDrafts.groupId, groupId));
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.answerCallbackQuery({ text: "Welcome edit cancelled" });
    return;
  }
  if (action === "replace_message") {
    await db.update(groupWelcomeDrafts).set({ message: null, updatedAt: new Date() }).where(eq(groupWelcomeDrafts.groupId, groupId));
    await ctx.answerCallbackQuery({ text: "Send the replacement message" });
    await ctx.reply("Send the replacement welcome message now.");
    return;
  }
  if (action === "replace_image") {
    await db.update(groupWelcomeDrafts).set({ imageTelegramFileId: null, imageStorageKey: null, imagePublicUrl: null, imagePinataFileId: null, imageCid: null, updatedAt: new Date() }).where(eq(groupWelcomeDrafts.groupId, groupId));
    await ctx.answerCallbackQuery({ text: "Send the replacement image" });
    await ctx.reply("Send the replacement welcome image now.");
    return;
  }
  if (action === "save_message" && draft.mode === "MESSAGE" && draft.message) {
    await db.update(groupModerationSettings).set({ welcomeMessage: draft.message, welcomeEnabled: true, updatedAt: new Date() }).where(eq(groupModerationSettings.groupId, groupId));
  } else if (action === "save_image" && draft.mode === "IMAGE" && draft.imageTelegramFileId) {
    await db.update(groupModerationSettings).set({
      welcomeImageTelegramFileId: draft.imageTelegramFileId,
      welcomeImageStorageKey: draft.imageStorageKey,
      welcomeImagePublicUrl: draft.imagePublicUrl,
      welcomeImagePinataFileId: draft.imagePinataFileId,
      welcomeImageCid: draft.imageCid,
      welcomeEnabled: true,
      updatedAt: new Date(),
    }).where(eq(groupModerationSettings.groupId, groupId));
  } else {
    await ctx.answerCallbackQuery({ text: "The welcome draft is incomplete.", show_alert: true });
    return;
  }
  await db.delete(groupWelcomeDrafts).where(eq(groupWelcomeDrafts.groupId, groupId));
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  await ctx.answerCallbackQuery({ text: "Welcome settings saved" });
  await ctx.reply("Welcome settings saved. Use /welcome preview to review the active welcome.");
}

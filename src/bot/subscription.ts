import { InlineKeyboard, type Context } from "grammy";
import { env } from "@/config/env";

const membershipCache = new Map<
  string,
  { missingChannels: string[]; expiresAt: number }
>();
const cacheDurationMs = 60_000;

function requiredChannels(): string[] {
  return [
    ...new Set(
      env.TELEGRAM_REQUIRED_CHANNELS.split(",")
        .map((channel) => channel.trim())
        .filter(Boolean)
        .map((channel) =>
          channel.startsWith("@") ? channel : `@${channel}`,
        ),
    ),
  ];
}

function channelUrl(channel: string): string {
  return `https://t.me/${channel.replace(/^@/, "")}`;
}

function isSubscribed(
  member:
    | { status: "creator" | "administrator" | "member" }
    | { status: "restricted"; is_member: boolean }
    | { status: "left" | "kicked" },
): boolean {
  return (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member)
  );
}

async function missingSubscriptions(
  ctx: Context,
  forceRefresh = false,
): Promise<string[]> {
  if (!ctx.from) return requiredChannels();

  const userId = String(ctx.from.id);
  const cached = membershipCache.get(userId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.missingChannels;
  }

  const missing: string[] = [];
  for (const channel of requiredChannels()) {
    try {
      const member = await ctx.api.getChatMember(channel, ctx.from.id);
      if (!isSubscribed(member)) missing.push(channel);
    } catch (error) {
      console.error(`Could not verify subscription for ${channel}`, error);
      missing.push(channel);
    }
  }

  membershipCache.set(userId, {
    missingChannels: missing,
    expiresAt: Date.now() + cacheDurationMs,
  });
  return missing;
}

function subscriptionKeyboard(missingChannels: string[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const channel of missingChannels) {
    keyboard.url(`Join ${channel}`, channelUrl(channel)).row();
  }
  return keyboard.text("Check subscription", "check_subscriptions");
}

export async function requireChannelSubscriptions(
  ctx: Context,
  options?: { forceRefresh?: boolean },
): Promise<boolean> {
  const missing = await missingSubscriptions(
    ctx,
    options?.forceRefresh ?? false,
  );
  if (missing.length === 0) return true;

  const text = [
    "Subscribe to the required Telepons channels before using the bot:",
    "",
    ...missing.map((channel) => `• ${channel}`),
    "",
    "After joining, press Check subscription.",
  ].join("\n");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: "Join both required channels first.",
      show_alert: true,
    });
  }
  await ctx.reply(text, {
    reply_markup: subscriptionKeyboard(missing),
  });
  return false;
}

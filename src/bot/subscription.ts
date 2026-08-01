import { InlineKeyboard, type Context } from "grammy";
import { env } from "@/config/env";

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
): Promise<string[]> {
  if (!ctx.from) return requiredChannels();

  const missing: string[] = [];
  for (const channel of requiredChannels()) {
    try {
      const member = await ctx.api.getChatMember(channel, ctx.from.id);
      if (!isSubscribed(member)) {
        console.info("TELEGRAM_SUBSCRIPTION_REQUIRED", {
          userId: String(ctx.from.id),
          channel,
          status: member.status,
        });
        missing.push(channel);
      }
    } catch (error) {
      console.error(`Could not verify subscription for ${channel}`, error);
      missing.push(channel);
    }
  }

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
): Promise<boolean> {
  // Subscription is an authorization requirement, so it is checked directly
  // against Telegram on every protected action. Successful checks are never
  // cached because a user may leave a required channel at any time.
  const missing = await missingSubscriptions(ctx);
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

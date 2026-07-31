import type { Context } from "grammy";

export async function getGroupOwnerUserId(ctx: Context): Promise<string | null> {
  if (!ctx.chat || ctx.chat.type === "private") {
    return null;
  }

  const administrators = await ctx.api.getChatAdministrators(ctx.chat.id);
  const owner = administrators.find((member) => member.status === "creator");

  return owner ? String(owner.user.id) : null;
}

export async function isCurrentGroupOwner(ctx: Context): Promise<boolean> {
  if (!ctx.from) {
    return false;
  }

  const ownerUserId = await getGroupOwnerUserId(ctx);
  return ownerUserId === String(ctx.from.id);
}

export function isGroupContext(ctx: Context): boolean {
  return Boolean(ctx.chat && ctx.chat.type !== "private");
}

export async function getGroupTelegramUrl(
  ctx: Context,
): Promise<string | null> {
  if (!ctx.chat || ctx.chat.type === "private") {
    return null;
  }

  if ("username" in ctx.chat && ctx.chat.username) {
    return `https://t.me/${ctx.chat.username}`;
  }

  const chat = await ctx.api.getChat(ctx.chat.id);
  if ("username" in chat && chat.username) {
    return `https://t.me/${chat.username}`;
  }

  return null;
}

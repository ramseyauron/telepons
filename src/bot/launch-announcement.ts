import { InlineKeyboard, type Api } from "grammy";
import type { LaunchDraft } from "@/launch/schema";

export type LaunchAnnouncementStatus =
  | "WAITING_FOR_APPROVAL"
  | "LAUNCHED"
  | "EXPIRED"
  | "CANCELLED";

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export function launchAnnouncementCaption(input: {
  draft: LaunchDraft;
  status: LaunchAnnouncementStatus;
  tokenAddress?: string;
}): string {
  return [
    "🚀 UPCOMING TOKEN LAUNCH",
    "",
    `${input.draft.name} ($${input.draft.symbol})`,
    "",
    input.draft.description,
    "",
    `Developer buy: ${input.draft.developerBuyEth} ETH`,
    `Deployer: ${input.draft.deployerAddress}`,
    input.draft.telegram
      ? `Community: ${input.draft.telegram}`
      : null,
    "",
    input.status === "LAUNCHED"
      ? "Status: ✅ LAUNCHED"
      : input.status === "EXPIRED"
        ? "Status: ⌛ EXPIRED"
        : input.status === "CANCELLED"
          ? "Status: ❌ CANCELLED"
        : "Status: ⏳ WAITING FOR APPROVAL",
    input.tokenAddress ? `Token: ${input.tokenAddress}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function launchAnnouncementKeyboard(input: {
  draft: LaunchDraft;
  launchUrl: string;
  transactionUrl?: string;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (input.draft.telegram) {
    keyboard.url("Join community", input.draft.telegram);
  }
  if (input.transactionUrl) {
    keyboard.row().url("View transaction", input.transactionUrl);
  } else if (isPublicHttpsUrl(input.launchUrl)) {
    keyboard.row().url("Open launch terminal", input.launchUrl);
  }
  return keyboard;
}

export async function announceLaunchSession(input: {
  api: Api;
  channel: string;
  draft: LaunchDraft;
  launchUrl: string;
  telegramFileId: string;
}): Promise<number> {
  const message = await input.api.sendPhoto(
    input.channel,
    input.telegramFileId,
    {
      caption: launchAnnouncementCaption({
        draft: input.draft,
        status: "WAITING_FOR_APPROVAL",
      }),
      reply_markup: launchAnnouncementKeyboard(input),
    },
  );

  return message.message_id;
}

import { InlineKeyboard, type Api } from "grammy";
import { getAddress, isAddress } from "viem";
import { ponsV1 } from "@/config/pons";
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

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function launchAnnouncementCaption(input: {
  draft: LaunchDraft;
  status: LaunchAnnouncementStatus;
  groupTitle: string;
  tokenAddress?: string;
}): string {
  const deployerUrl = `${ponsV1.explorerUrl}/address/${input.draft.deployerAddress}`;
  const deployer = escapeTelegramHtml(input.draft.deployerAddress);
  const community = input.draft.telegram
    ? `<a href="${escapeTelegramHtml(input.draft.telegram)}">${escapeTelegramHtml(input.groupTitle)}</a>`
    : null;

  return [
    "🚀 UPCOMING TOKEN LAUNCH",
    "",
    `${escapeTelegramHtml(input.draft.name)} ($${escapeTelegramHtml(input.draft.symbol)})`,
    "",
    escapeTelegramHtml(input.draft.description),
    "",
    `Developer buy: ${escapeTelegramHtml(input.draft.developerBuyEth)} ETH`,
    `Deployer: <a href="${deployerUrl}">${deployer}</a>`,
    community ? `Community: ${community}` : null,
    "",
    input.status === "LAUNCHED"
      ? "Status: ✅ LAUNCHED"
      : input.status === "EXPIRED"
        ? "Status: ⌛ EXPIRED"
        : input.status === "CANCELLED"
          ? "Status: ❌ CANCELLED"
        : "Status: ⏳ WAITING FOR APPROVAL",
    input.tokenAddress
      ? `Token: ${escapeTelegramHtml(input.tokenAddress)}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function launchAnnouncementKeyboard(input: {
  draft: LaunchDraft;
  launchUrl: string;
  tokenAddress?: string;
  transactionUrl?: string;
}): InlineKeyboard {
  if (input.tokenAddress) {
    return launchTradingKeyboard(input.tokenAddress);
  }

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

export function launchTradingKeyboard(tokenAddress: string): InlineKeyboard {
  const storedTokenAddress = tokenAddress.trim();
  if (!isAddress(storedTokenAddress, { strict: false })) {
    throw new Error("INVALID_TRADING_TOKEN_ADDRESS");
  }

  const token = getAddress(storedTokenAddress.toLowerCase());
  return new InlineKeyboard()
    .url(
      "Trade on Axiom",
      `https://axiom.trade/t/${token}/@badday?chain=robinhood`,
    )
    .row()
    .url(
      "Trade Maestro",
      `https://t.me/maestro?start=${token}-addictaddict`,
    )
    .url(
      "Trade Sigma",
      `https://t.me/Sigma_buyBot?start=xbadday-${token}`,
    );
}

export async function announceLaunchSession(input: {
  api: Api;
  channel: string;
  draft: LaunchDraft;
  launchUrl: string;
  telegramFileId: string;
  groupTitle: string;
}): Promise<number> {
  const message = await input.api.sendPhoto(
    input.channel,
    input.telegramFileId,
    {
      caption: launchAnnouncementCaption({
        draft: input.draft,
        status: "WAITING_FOR_APPROVAL",
        groupTitle: input.groupTitle,
      }),
      parse_mode: "HTML",
      reply_markup: launchAnnouncementKeyboard(input),
    },
  );

  return message.message_id;
}

export async function announceSuccessfulLaunch(input: {
  api: Api;
  groupId: string;
  draft: LaunchDraft;
  telegramFileId?: string;
  tokenAddress: string;
  poolAddress: string;
  transactionHash: string;
}): Promise<void> {
  const tokenUrl = `${ponsV1.explorerUrl}/address/${input.tokenAddress}`;
  const poolUrl = `${ponsV1.explorerUrl}/address/${input.poolAddress}`;
  const deployerUrl = `${ponsV1.explorerUrl}/address/${input.draft.deployerAddress}`;
  const transactionUrl = `${ponsV1.explorerUrl}/tx/${input.transactionHash}`;
  const caption = [
    `✅ <b>${escapeTelegramHtml(input.draft.name)} ($${escapeTelegramHtml(input.draft.symbol)}) LAUNCHED</b>`,
    "",
    escapeTelegramHtml(input.draft.description),
    "",
    `Token: <a href="${tokenUrl}">${escapeTelegramHtml(input.tokenAddress)}</a>`,
    `Pool: <a href="${poolUrl}">${escapeTelegramHtml(input.poolAddress)}</a>`,
    `Deployer: <a href="${deployerUrl}">${escapeTelegramHtml(input.draft.deployerAddress)}</a>`,
    `Transaction: <a href="${transactionUrl}">${escapeTelegramHtml(input.transactionHash)}</a>`,
    `Developer buy: ${escapeTelegramHtml(input.draft.developerBuyEth)} ETH`,
    "",
    "BuyBot: 🟢 ACTIVE",
    "Volume tracking: 🟢 ACTIVE",
  ].join("\n");
  const replyMarkup = launchTradingKeyboard(input.tokenAddress);
  const options = {
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  } as const;

  if (input.telegramFileId) {
    await input.api.sendPhoto(Number(input.groupId), input.telegramFileId, options);
    return;
  }

  await input.api.sendMessage(Number(input.groupId), caption, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

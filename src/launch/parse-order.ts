import { launchDraftSchema, type LaunchDraft } from "@/launch/schema";

const fieldAliases: Record<string, keyof LaunchDraft> = {
  name: "name",
  symbol: "symbol",
  ticker: "symbol",
  description: "description",
  deployer: "deployerAddress",
  "deployer address": "deployerAddress",
  "developer buy": "developerBuyEth",
  "dev buy": "developerBuyEth",
  twitter: "twitter",
  x: "twitter",
  telegram: "telegram",
  website: "website",
};

function normalizeDeveloperBuy(value: string): string {
  return value.replace(/\s*eth\s*$/i, "").trim();
}

export function parseLaunchOrderCaption(
  caption: string,
  logoUrl: string,
  groupTelegramUrl: string,
): LaunchDraft {
  const extracted: Record<string, string> = {};

  for (const line of caption.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) continue;

    const rawKey = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    const field = fieldAliases[rawKey];

    if (field && value) {
      extracted[field] =
        field === "developerBuyEth" ? normalizeDeveloperBuy(value) : value;
    }
  }

  return launchDraftSchema.parse({
    ...extracted,
    logoUrl,
    // The token must point back to the group that created the launch order.
    // Any Telegram value supplied in the caption is intentionally overridden.
    telegram: groupTelegramUrl,
  });
}

export function formatLaunchOrderPreview(draft: LaunchDraft): string {
  const optionalLinks = [
    draft.twitter ? `X/Twitter: ${draft.twitter}` : null,
    draft.telegram ? `Telegram: ${draft.telegram}` : null,
    draft.website ? `Website: ${draft.website}` : null,
  ].filter(Boolean);

  return [
    "Please confirm this token launch order:",
    "",
    `Name: ${draft.name}`,
    `Symbol: ${draft.symbol}`,
    `Description: ${draft.description}`,
    `Deployer: ${draft.deployerAddress}`,
    `Developer buy: ${draft.developerBuyEth} ETH`,
    ...optionalLinks,
    "",
    "The launch session will only be created after confirmation.",
  ].join("\n");
}

import { getAddress } from "viem";
import { z } from "zod";
import { launchDraftSchema, type LaunchDraft } from "@/launch/schema";

export type LaunchConversationStep =
  | "NAME"
  | "SYMBOL"
  | "DESCRIPTION"
  | "DEPLOYER"
  | "DEVELOPER_BUY"
  | "TWITTER"
  | "WEBSITE"
  | "AWAITING_LOGO";

type PartialLaunchDetails = Partial<
  Pick<
    LaunchDraft,
    | "name"
    | "symbol"
    | "description"
    | "deployerAddress"
    | "developerBuyEth"
    | "twitter"
    | "website"
  >
>;

const stepOrder: LaunchConversationStep[] = [
  "NAME",
  "SYMBOL",
  "DESCRIPTION",
  "DEPLOYER",
  "DEVELOPER_BUY",
  "TWITTER",
  "WEBSITE",
  "AWAITING_LOGO",
];

export function launchConversationPrompt(
  step: LaunchConversationStep,
): string {
  const prompts: Record<LaunchConversationStep, string> = {
    NAME: "What is the token name? (maximum 32 characters)",
    SYMBOL: "What is the token symbol? (maximum 10 characters)",
    DESCRIPTION: "Write the token description. (maximum 256 characters)",
    DEPLOYER: "Send the EVM deployer wallet address.",
    DEVELOPER_BUY:
      "How much is the developer buy in ETH? Example: 0.2",
    TWITTER:
      "Send the token's X/Twitter URL or handle. Send `skip` if there is none.",
    WEBSITE:
      "Send the token website URL. Send `skip` if there is none.",
    AWAITING_LOGO:
      "Now send the token logo as an image or image document. No caption is required.",
  };
  return prompts[step];
}

export function applyLaunchConversationAnswer(input: {
  step: LaunchConversationStep;
  answer: string;
  currentDetailsJson: string;
}): {
  detailsJson: string;
  nextStep: LaunchConversationStep;
} {
  const details = JSON.parse(input.currentDetailsJson) as PartialLaunchDetails;
  const answer = input.answer.trim();
  const skipping = answer.toLowerCase() === "skip";

  switch (input.step) {
    case "NAME":
      details.name = z.string().trim().min(1).max(32).parse(answer);
      break;
    case "SYMBOL":
      details.symbol = z
        .string()
        .trim()
        .min(1)
        .max(10)
        .transform((value) => value.toUpperCase())
        .parse(answer);
      break;
    case "DESCRIPTION":
      details.description = z.string().trim().min(1).max(256).parse(answer);
      break;
    case "DEPLOYER":
      details.deployerAddress = getAddress(
        z.string().regex(/^0x[a-fA-F0-9]{40}$/).parse(answer),
      );
      break;
    case "DEVELOPER_BUY":
      details.developerBuyEth = z
        .string()
        .transform((value) => value.replace(/\s*eth\s*$/i, "").trim())
        .pipe(z.string().regex(/^\d+(\.\d{1,18})?$/))
        .parse(answer);
      break;
    case "TWITTER":
      if (!skipping) {
        details.twitter = answer.startsWith("@")
          ? `https://x.com/${answer.slice(1)}`
          : answer;
      }
      break;
    case "WEBSITE":
      if (!skipping) details.website = z.url().parse(answer);
      break;
    case "AWAITING_LOGO":
      throw new Error("LOGO_REQUIRED");
  }

  const currentIndex = stepOrder.indexOf(input.step);
  return {
    detailsJson: JSON.stringify(details),
    nextStep: stepOrder[currentIndex + 1] ?? "AWAITING_LOGO",
  };
}

export function completeConversationDraft(input: {
  detailsJson: string;
  groupTelegramUrl: string;
  logoUrl: string;
}): LaunchDraft {
  return launchDraftSchema.parse({
    ...(JSON.parse(input.detailsJson) as PartialLaunchDetails),
    telegram: input.groupTelegramUrl,
    logoUrl: input.logoUrl,
  });
}

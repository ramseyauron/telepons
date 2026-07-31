import OpenAI from "openai";
import { env } from "@/config/env";
import { launchDraftSchema, type LaunchDraft } from "@/launch/schema";

const toolName = "extract_token_details";

type ExtractedTokenDetails = {
  name: string;
  symbol: string;
  description: string;
  developerBuyEth: string;
  deployerAddress: string;
  twitter: string | null;
  website: string | null;
};

const tokenDetailsParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Token name, at most 32 characters.",
    },
    symbol: {
      type: "string",
      description:
        "Token ticker without a dollar sign, at most 10 characters.",
    },
    description: {
      type: "string",
      description: "Token description, at most 256 characters.",
    },
    developerBuyEth: {
      type: "string",
      description:
        "Developer buy amount expressed only as a decimal ETH string.",
    },
    deployerAddress: {
      type: "string",
      description: "The exact 20-byte EVM deployer address supplied by the owner.",
    },
    twitter: {
      type: ["string", "null"],
      description: "The supplied X/Twitter URL or handle, otherwise null.",
    },
    website: {
      type: ["string", "null"],
      description: "The supplied absolute website URL, otherwise null.",
    },
  },
  required: [
    "name",
    "symbol",
    "description",
    "developerBuyEth",
    "deployerAddress",
    "twitter",
    "website",
  ],
} as const;

function normalizeDeveloperBuy(value: string): string {
  return value.replace(/\s*eth\s*$/i, "").trim();
}

function normalizeTwitter(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim();
  if (normalized.startsWith("@")) {
    return `https://x.com/${normalized.slice(1)}`;
  }
  return normalized;
}

export async function extractLaunchDraftWithLlm(input: {
  ownerMessage: string;
  logoUrl: string;
  groupTelegramUrl: string;
}): Promise<LaunchDraft> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  let response;
  try {
    response = await client.responses.create({
      model: env.OPENAI_MODEL,
      reasoning: { effort: "low" },
      instructions: [
        "Extract token launch details from the group owner's message.",
        "You are not a general assistant and must not answer questions.",
        "Use only facts explicitly supplied in the message.",
        "Never invent, improve, translate, or infer token details.",
        "Do not extract a Telegram URL; the backend supplies the canonical group URL.",
        "Return exactly one extract_token_details function call.",
      ].join(" "),
      input: input.ownerMessage,
      tools: [
        {
          type: "function",
          name: toolName,
          description:
            "Return the complete structured token details for validation.",
          strict: true,
          parameters: tokenDetailsParameters,
        },
      ],
      tool_choice: { type: "function", name: toolName },
      parallel_tool_calls: false,
      store: false,
    });
  } catch (error) {
    throw new Error("LLM_REQUEST_FAILED", { cause: error });
  }

  const functionCall = response.output.find(
    (item) => item.type === "function_call" && item.name === toolName,
  );
  if (!functionCall || functionCall.type !== "function_call") {
    throw new Error("LLM_DID_NOT_RETURN_TOKEN_DETAILS");
  }

  const extracted = JSON.parse(
    functionCall.arguments,
  ) as ExtractedTokenDetails;

  return launchDraftSchema.parse({
    name: extracted.name,
    symbol: extracted.symbol,
    description: extracted.description,
    developerBuyEth: normalizeDeveloperBuy(extracted.developerBuyEth),
    deployerAddress: extracted.deployerAddress,
    twitter: normalizeTwitter(extracted.twitter),
    website: extracted.website ?? undefined,
    telegram: input.groupTelegramUrl,
    logoUrl: input.logoUrl,
  });
}

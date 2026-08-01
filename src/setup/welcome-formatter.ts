import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/config/env";

const toolName = "format_group_welcome";
const memberPlaceholder = "{member}";

const formattedWelcomeSchema = z.object({
  welcomeMessage: z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .refine(
      (message) => message.split(memberPlaceholder).length === 2,
      `The welcome message must contain ${memberPlaceholder} exactly once.`,
    ),
});

function fallbackWelcome(input: {
  groupTitle: string;
  groupDescription: string;
  ownerMessage: string;
}): string {
  return [
    `👋 Welcome, ${memberPlaceholder}!`,
    "",
    `Welcome to ${input.groupTitle}.`,
    "",
    input.ownerMessage,
    "",
    `About this community: ${input.groupDescription}`,
  ].join("\n");
}

export async function formatGroupWelcome(input: {
  groupTitle: string;
  groupDescription: string;
  ownerMessage: string;
}): Promise<string> {
  if (!env.OPENAI_API_KEY) return fallbackWelcome(input);

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    reasoning: { effort: "low" },
    instructions: [
      "Format a concise Telegram welcome message for a token community.",
      `Include the literal placeholder ${memberPlaceholder} exactly once so the backend can mention the new member.`,
      "Use plain text only, with short paragraphs and at most three relevant emoji.",
      "Do not use Markdown or HTML.",
      "Do not invent links, rules, promises, token facts, or calls to invest.",
      "Preserve the owner's meaning and use only the supplied group description and welcome-message draft.",
      "Return exactly one format_group_welcome function call.",
    ].join(" "),
    input: JSON.stringify(input),
    tools: [
      {
        type: "function",
        name: toolName,
        description: "Return the standardized Telegram welcome message.",
        strict: true,
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            welcomeMessage: {
              type: "string",
              description:
                "Plain-text welcome message containing {member} exactly once.",
            },
          },
          required: ["welcomeMessage"],
        },
      },
    ],
    tool_choice: { type: "function", name: toolName },
    parallel_tool_calls: false,
    store: false,
  });

  const functionCall = response.output.find(
    (item) => item.type === "function_call" && item.name === toolName,
  );
  if (!functionCall || functionCall.type !== "function_call") {
    throw new Error("LLM_DID_NOT_RETURN_WELCOME_MESSAGE");
  }

  return formattedWelcomeSchema.parse(
    JSON.parse(functionCall.arguments),
  ).welcomeMessage;
}

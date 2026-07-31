import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyStringToUndefined, z.url().optional());
const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("./data/telepons.db"),
  TELEGRAM_BOT_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(20).optional(),
  ),
  TELEGRAM_LAUNCH_CHANNEL: z
    .string()
    .min(2)
    .default("@teleponslaunchlist"),
  ROBINHOOD_RPC_URL: optionalUrl,
  NEXT_PUBLIC_REOWN_PROJECT_ID: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-sol"),
});

export const env = serverEnvSchema.parse({
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_LAUNCH_CHANNEL: process.env.TELEGRAM_LAUNCH_CHANNEL,
  ROBINHOOD_RPC_URL: process.env.ROBINHOOD_RPC_URL,
  NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
});

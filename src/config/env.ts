import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyStringToUndefined, z.url().optional());
const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const publicIpfsGateway = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Use a public HTTPS IPFS gateway without credentials, query parameters, or fragments.");

const pinataUploadUrl = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Use an HTTPS Pinata upload API URL without embedded credentials.");

const postgresUrl = z
  .string()
  .trim()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    {
      message:
        "Expected a Supabase PostgreSQL connection string starting with postgresql:// or postgres://. Replace the old SQLite path in .env.local.",
    },
  );

const serverEnvSchema = z.object({
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(2),
  TELEGRAM_BOT_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(20).optional(),
  ),
  TELEGRAM_LAUNCH_CHANNEL: z
    .string()
    .min(2)
    .default("@teleponslaunchlist"),
  TELEGRAM_REQUIRED_CHANNELS: z
    .string()
    .min(2)
    .default("@teleponslaunchlist,@TeleponsAnnouncement"),
  ROBINHOOD_RPC_URL: optionalUrl,
  NEXT_PUBLIC_REOWN_PROJECT_ID: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().min(1).default("gpt-5.6-sol"),
  TRENDING_ENABLED: z.preprocess(
    emptyStringToUndefined,
    booleanString.default(false),
  ),
  TRENDING_DATA_SOURCE: z.enum(["dummy", "onchain"]).default("dummy"),
  PINATA_JWT: optionalSecret,
  PINATA_UPLOAD_URL: pinataUploadUrl.default(
    "https://uploads.pinata.cloud/v3/files",
  ),
  PINATA_FETCH_GATEWAY: publicIpfsGateway.default(
    "https://gateway.pinata.cloud",
  ),
  PINATA_FALLBACK_FETCH_GATEWAY: z.preprocess(
    emptyStringToUndefined,
    publicIpfsGateway.optional(),
  ),
});

export const env = serverEnvSchema.parse({
  APP_BASE_URL: process.env.APP_BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_LAUNCH_CHANNEL: process.env.TELEGRAM_LAUNCH_CHANNEL,
  TELEGRAM_REQUIRED_CHANNELS: process.env.TELEGRAM_REQUIRED_CHANNELS,
  ROBINHOOD_RPC_URL: process.env.ROBINHOOD_RPC_URL,
  NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  TRENDING_ENABLED: process.env.TRENDING_ENABLED,
  TRENDING_DATA_SOURCE: process.env.TRENDING_DATA_SOURCE,
  PINATA_JWT: process.env.PINATA_JWT,
  PINATA_UPLOAD_URL: process.env.PINATA_UPLOAD_URL,
  PINATA_FETCH_GATEWAY: process.env.PINATA_FETCH_GATEWAY,
  PINATA_FALLBACK_FETCH_GATEWAY:
    process.env.PINATA_FALLBACK_FETCH_GATEWAY,
});

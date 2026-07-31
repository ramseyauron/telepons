import { getAddress } from "viem";
import { z } from "zod";

export const launchDraftSchema = z.object({
  name: z.string().trim().min(1).max(32),
  symbol: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  description: z.string().trim().min(1).max(256),
  developerBuyEth: z.string().regex(/^\d+(\.\d{1,18})?$/),
  deployerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .transform((value) => getAddress(value)),
  twitter: z.string().trim().optional(),
  telegram: z.string().trim().optional(),
  website: z.url().optional(),
  logoUrl: z.url().optional(),
});

export type LaunchDraft = z.infer<typeof launchDraftSchema>;

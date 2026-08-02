import { InlineKeyboard } from "grammy";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { formatEther, parseEther } from "viem";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  buybotSettings,
  launchSessions,
  swaps,
  trendingState,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

export const trendingPeriods = ["1h", "6h", "24h", "7d"] as const;
export type TrendingPeriod = (typeof trendingPeriods)[number];

type TrendingEntry = {
  name: string;
  symbol: string;
  tokenAddress: string;
  launchSessionId?: string;
  grossVolumeWei: bigint;
  buyVolumeWei: bigint;
  sellVolumeWei: bigint;
  tradeCount: number;
  uniqueTraders: number;
};

type EmptyReason =
  | "NO_TRACKED_TOKENS"
  | "NO_ACTIVITY"
  | "BELOW_REQUIREMENTS";

type TrendingResult = {
  entries: TrendingEntry[];
  emptyReason?: EmptyReason;
};

const periodHours: Record<TrendingPeriod, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
};

const periodLabels: Record<TrendingPeriod, string> = {
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "7d": "7 days",
};

const cache = new Map<
  string,
  { expiresAt: number; result: TrendingResult }
>();

export async function initializeTrending(): Promise<void> {
  if (!env.TRENDING_ENABLED || env.TRENDING_DATA_SOURCE !== "onchain") return;
  await db
    .insert(trendingState)
    .values({ id: "global", onchainActivatedAt: new Date() })
    .onConflictDoNothing({ target: trendingState.id });
}

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dummyTrending(period: TrendingPeriod): TrendingResult {
  const multiplier = { "1h": 1, "6h": 4, "24h": 11, "7d": 38 }[period];
  const fixtures = [
    ["Gigantix", "GIGA", "3.8921", 48, 29],
    ["Pons Bot", "PONSBOT", "3.2164", 41, 25],
    ["Robin Family", "ROBIN", "2.7458", 36, 22],
    ["Green Candle", "GREEN", "2.1837", 31, 18],
    ["Launch Cat", "LCAT", "1.7042", 27, 16],
    ["Chain Pilot", "PILOT", "1.2984", 22, 14],
    ["Telegram Frog", "TFROG", "0.9643", 18, 11],
    ["Pons Scout", "SCOUT", "0.7315", 14, 9],
    ["Robin Pixel", "PIXEL", "0.5289", 11, 7],
    ["Telepons DAO", "TELE", "0.3841", 8, 5],
  ] as const;

  return {
    entries: fixtures.map(([name, symbol, volume, trades, traders], index) => {
      const grossVolumeWei = parseEther(
        (Number(volume) * multiplier).toFixed(4),
      );
      const buyShare = BigInt(58 + (index % 4));
      const buyVolumeWei = (grossVolumeWei * buyShare) / 100n;
      return {
        name,
        symbol,
        tokenAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
        grossVolumeWei,
        buyVolumeWei,
        sellVolumeWei: grossVolumeWei - buyVolumeWei,
        tradeCount: trades * multiplier,
        uniqueTraders: traders * Math.max(1, Math.round(multiplier / 2)),
      };
    }),
  };
}

async function onchainTrending(period: TrendingPeriod): Promise<TrendingResult> {
  await initializeTrending();
  const state = await db.query.trendingState.findFirst({
    where: eq(trendingState.id, "global"),
  });
  if (!state) throw new Error("TRENDING_ONCHAIN_STATE_MISSING");

  const [sessions, settingsRows] = await Promise.all([
    db.query.launchSessions.findMany({
      where: eq(launchSessions.status, "ACTIVE"),
    }),
    db.select().from(buybotSettings),
  ]);
  const enabledByGroup = new Map(
    settingsRows.map((settings) => [settings.groupId, settings.enabled]),
  );
  const metadata = new Map<
    string,
    { name: string; symbol: string; launchSessionId: string }
  >();
  const trackedAddresses = new Set<string>();

  for (const session of sessions) {
    if (!session.tokenAddress || enabledByGroup.get(session.groupId) === false) {
      continue;
    }
    try {
      const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
      metadata.set(session.tokenAddress.toLowerCase(), {
        name: draft.name,
        symbol: draft.symbol,
        launchSessionId: session.id,
      });
      trackedAddresses.add(session.tokenAddress);
    } catch (error) {
      console.error("Trending skipped invalid active launch metadata", {
        sessionId: session.id,
        error,
      });
    }
  }

  const tokenAddresses = [...trackedAddresses];
  if (tokenAddresses.length === 0) {
    return { entries: [], emptyReason: "NO_TRACKED_TOKENS" };
  }

  const requestedCutoff = new Date(
    Date.now() - periodHours[period] * 60 * 60 * 1000,
  );
  const cutoff =
    state.onchainActivatedAt > requestedCutoff
      ? state.onchainActivatedAt
      : requestedCutoff;
  const aggregates = await db
    .select({
      tokenAddress: swaps.tokenAddress,
      grossVolumeWei: sql<string>`sum(cast(${swaps.pairAmountWei} as numeric))::text`,
      buyVolumeWei: sql<string>`sum(case when ${swaps.side} = 'BUY' then cast(${swaps.pairAmountWei} as numeric) else 0 end)::text`,
      sellVolumeWei: sql<string>`sum(case when ${swaps.side} = 'SELL' then cast(${swaps.pairAmountWei} as numeric) else 0 end)::text`,
      tradeCount: sql<number>`count(*)::int`,
      uniqueTraders: sql<number>`count(distinct lower(${swaps.traderAddress}))::int`,
    })
    .from(swaps)
    .where(
      and(
        gte(swaps.tradedAt, cutoff),
        inArray(swaps.tokenAddress, tokenAddresses),
      ),
    )
    .groupBy(swaps.tokenAddress);

  if (aggregates.length === 0) {
    return { entries: [], emptyReason: "NO_ACTIVITY" };
  }

  const entries = aggregates
    .filter((row) => row.tradeCount >= 5 && row.uniqueTraders >= 2)
    .map((row): TrendingEntry | null => {
      const token = metadata.get(row.tokenAddress.toLowerCase());
      if (!token) return null;
      return {
        ...token,
        tokenAddress: row.tokenAddress,
        grossVolumeWei: BigInt(row.grossVolumeWei),
        buyVolumeWei: BigInt(row.buyVolumeWei),
        sellVolumeWei: BigInt(row.sellVolumeWei),
        tradeCount: row.tradeCount,
        uniqueTraders: row.uniqueTraders,
      };
    })
    .filter((entry): entry is TrendingEntry => entry !== null)
    .sort((a, b) =>
      a.grossVolumeWei === b.grossVolumeWei
        ? 0
        : a.grossVolumeWei > b.grossVolumeWei
          ? -1
          : 1,
    )
    .slice(0, 10);

  return {
    entries,
    emptyReason: entries.length === 0 ? "BELOW_REQUIREMENTS" : undefined,
  };
}

async function getTrending(period: TrendingPeriod): Promise<TrendingResult> {
  const key = `${env.TRENDING_DATA_SOURCE}:${period}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result =
    env.TRENDING_DATA_SOURCE === "dummy"
      ? dummyTrending(period)
      : await onchainTrending(period);
  cache.set(key, { expiresAt: Date.now() + 30_000, result });
  return result;
}

function formatEth(value: bigint): string {
  return Number(formatEther(value)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function emptyMessage(reason: EmptyReason | undefined): string {
  if (reason === "NO_TRACKED_TOKENS") {
    return "No Telepons tokens are currently being tracked.";
  }
  if (reason === "NO_ACTIVITY") {
    return "Tokens are being monitored, but no trading activity has been recorded for this period.";
  }
  return "Trading activity exists, but no token has reached 5 trades from at least 2 unique traders yet.";
}

export function trendingKeyboard(period: TrendingPeriod): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const candidate of trendingPeriods) {
    const label = candidate === period ? `• ${candidate.toUpperCase()}` : candidate.toUpperCase();
    keyboard.text(label, `trending:${candidate}`);
  }
  return keyboard;
}

export async function renderTrending(period: TrendingPeriod): Promise<string> {
  if (!env.TRENDING_ENABLED) {
    return [
      "🔥 <b>TELEPONS TRENDING</b>",
      "",
      "Trending is currently disabled.",
    ].join("\n");
  }

  const result = await getTrending(period);
  const sourceLabel =
    env.TRENDING_DATA_SOURCE === "dummy"
      ? "🧪 DEMO DATA"
      : "⛓ LIVE ON-CHAIN DATA";
  const lines = [
    "🔥 <b>TELEPONS TRENDING</b>",
    "",
    sourceLabel,
    `Top tokens by gross trading volume · ${periodLabels[period]}`,
    "",
  ];

  if (result.entries.length === 0) {
    lines.push(emptyMessage(result.emptyReason));
  } else {
    result.entries.forEach((entry, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`;
      const title = `${escapeTelegramHtml(entry.name)} ($${escapeTelegramHtml(entry.symbol)})`;
      const linkedTitle = entry.launchSessionId
        ? `<a href="${new URL(`/launch/${entry.launchSessionId}`, env.APP_BASE_URL)}">${title}</a>`
        : title;
      lines.push(
        `${medal} <b>${linkedTitle}</b> — ${formatEth(entry.grossVolumeWei)} ETH`,
        `   ${entry.tradeCount.toLocaleString("en-US")} trades · ${entry.uniqueTraders.toLocaleString("en-US")} traders`,
      );
    });
  }

  lines.push(
    "",
    "Eligibility: 5 trades · 2 unique traders",
    "Updated just now",
  );
  return lines.join("\n");
}

export function isTrendingPeriod(value: string): value is TrendingPeriod {
  return trendingPeriods.includes(value as TrendingPeriod);
}

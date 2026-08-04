import type { Api } from "grammy";
import { and, desc, eq } from "drizzle-orm";
import {
  formatEther,
  formatUnits,
  getAddress,
  isAddressEqual,
} from "viem";
import { robinhoodChain } from "@/blockchain/chain";
import { robinhoodPublicClient as client } from "@/blockchain/public-client";
import { loggedRpcCall } from "@/blockchain/rpc-logging";
import {
  erc20ReadAbi,
  uniswapV3SwapEvent,
} from "@/blockchain/uniswap-v3-abi";
import { ponsV1 } from "@/config/pons";
import { db } from "@/db/client";
import {
  buybotAggregates,
  buybotSettings,
  holderIndexerCheckpoints,
  indexerCheckpoints,
  launchSessions,
  swaps,
  tokenAssets,
  tokenVolumeTotals,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";
import { launchTradingKeyboard } from "@/bot/launch-announcement";
import { indexTokenHolders } from "@/indexer/holders";
import {
  completeTokenHolderSync,
  isTokenHolderSyncDue,
  requestTokenHolderSyncIfStale,
  scheduleTokenHolderSync,
} from "@/indexer/holder-sync";
import {
  activeTokenSession,
  updateIntelligenceAfterSwap,
  type ActiveTokenSession,
} from "@/intelligence/token-intelligence";

const blockChunkSize = 500n;
const idleDisableAfterMs = 2 * 60 * 60 * 1_000;
const holderAfterSwapDebounceMs = 60_000;
const holderSafetyIntervalMs = 60 * 60 * 1_000;
const lastSwapPollAt = new Map<string, number>();
const holderLastSyncedAt = new Map<string, number>();
let indexing = false;
let flushingAggregates = false;

type BuybotTarget = {
  groupId: string;
  tokenAddress: string;
  poolAddress: string;
  symbol: string;
  startBlock: number;
  deployerAddress: string;
  session: ActiveTokenSession;
  lastActivityAt: Date;
  defaultImageTelegramFileId?: string;
};

type PollProfile = {
  swapIntervalMs: number;
};

function pollProfile(idleForMs: number): PollProfile {
  if (idleForMs < 5 * 60 * 1_000) {
    return { swapIntervalMs: 4_000 };
  }
  if (idleForMs < 15 * 60 * 1_000) {
    return { swapIntervalMs: 10_000 };
  }
  if (idleForMs < 60 * 60 * 1_000) {
    return { swapIntervalMs: 30_000 };
  }
  return { swapIntervalMs: 60_000 };
}

function tokenKey(address: string): string {
  return getAddress(address).toLowerCase();
}

async function holderSyncIsDue(
  target: BuybotTarget,
  now: number,
): Promise<boolean> {
  const key = tokenKey(target.tokenAddress);
  if (await isTokenHolderSyncDue(target.tokenAddress, new Date(now))) return true;

  let lastSyncedAt = holderLastSyncedAt.get(key);
  if (lastSyncedAt === undefined) {
    const checkpoint = await db.query.holderIndexerCheckpoints.findFirst({
      where: eq(holderIndexerCheckpoints.tokenAddress, target.tokenAddress),
    });
    lastSyncedAt = checkpoint?.updatedAt.getTime() ?? 0;
    holderLastSyncedAt.set(key, lastSyncedAt);
  }
  return now - lastSyncedAt >= holderSafetyIntervalMs;
}

async function markHolderSynced(
  tokenAddress: string,
  syncedAt: number,
  syncStartedAt: Date,
): Promise<void> {
  const key = tokenKey(tokenAddress);
  holderLastSyncedAt.set(key, syncedAt);
  await completeTokenHolderSync(tokenAddress, syncStartedAt);
}

export async function requestHolderSync(groupId: string): Promise<boolean> {
  const session = await activeTokenSession(groupId);
  if (!session) return false;
  const settings = await db.query.buybotSettings.findFirst({
    where: eq(buybotSettings.groupId, groupId),
  });
  if (settings?.enabled !== true) return false;
  return requestTokenHolderSyncIfStale(
    session.tokenAddress,
    "telegram_holders_command",
  );
}

type SwapRecord = typeof swaps.$inferInsert;

export async function rebuildVolumeTotalsFromSwaps(): Promise<void> {
  const recordedSwaps = await db.select().from(swaps);
  const totals = new Map<
    string,
    {
      poolAddress: string;
      buyVolumeWei: bigint;
      sellVolumeWei: bigint;
      buyCount: number;
      sellCount: number;
      firstTradeBlock: number;
      lastTradeBlock: number;
    }
  >();

  for (const swap of recordedSwaps) {
    const current = totals.get(swap.tokenAddress) ?? {
      poolAddress: swap.poolAddress,
      buyVolumeWei: 0n,
      sellVolumeWei: 0n,
      buyCount: 0,
      sellCount: 0,
      firstTradeBlock: swap.blockNumber,
      lastTradeBlock: swap.blockNumber,
    };
    const amount = BigInt(swap.pairAmountWei);

    if (swap.side === "BUY") {
      current.buyVolumeWei += amount;
      current.buyCount += 1;
    } else {
      current.sellVolumeWei += amount;
      current.sellCount += 1;
    }
    current.firstTradeBlock = Math.min(
      current.firstTradeBlock,
      swap.blockNumber,
    );
    current.lastTradeBlock = Math.max(
      current.lastTradeBlock,
      swap.blockNumber,
    );
    totals.set(swap.tokenAddress, current);
  }

  await db.transaction(async (tx) => {
    for (const [tokenAddress, total] of totals) {
      const grossVolumeWei = total.buyVolumeWei + total.sellVolumeWei;
      const netFlowWei = total.buyVolumeWei - total.sellVolumeWei;

      await tx
        .insert(tokenVolumeTotals)
        .values({
          tokenAddress,
          poolAddress: total.poolAddress,
          buyVolumeWei: total.buyVolumeWei.toString(),
          sellVolumeWei: total.sellVolumeWei.toString(),
          grossVolumeWei: grossVolumeWei.toString(),
          netFlowWei: netFlowWei.toString(),
          buyCount: total.buyCount,
          sellCount: total.sellCount,
          tradeCount: total.buyCount + total.sellCount,
          firstTradeBlock: total.firstTradeBlock,
          lastTradeBlock: total.lastTradeBlock,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tokenVolumeTotals.tokenAddress,
          set: {
            poolAddress: total.poolAddress,
            buyVolumeWei: total.buyVolumeWei.toString(),
            sellVolumeWei: total.sellVolumeWei.toString(),
            grossVolumeWei: grossVolumeWei.toString(),
            netFlowWei: netFlowWei.toString(),
            buyCount: total.buyCount,
            sellCount: total.sellCount,
            tradeCount: total.buyCount + total.sellCount,
            firstTradeBlock: total.firstTradeBlock,
            lastTradeBlock: total.lastTradeBlock,
            updatedAt: new Date(),
          },
        });
    }
  });
}

async function recordSwapAndVolume(swap: SwapRecord): Promise<{
  inserted: boolean;
  grossVolumeWei: bigint;
}> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(swaps)
      .values(swap)
      .onConflictDoNothing({ target: swaps.id })
      .returning({ id: swaps.id });

    const [current] = await tx
      .select()
      .from(tokenVolumeTotals)
      .where(eq(tokenVolumeTotals.tokenAddress, swap.tokenAddress))
      .limit(1);

    if (inserted.length === 0) {
      return {
        inserted: false,
        grossVolumeWei: BigInt(current?.grossVolumeWei ?? "0"),
      };
    }

    const amount = BigInt(swap.pairAmountWei);
    const buyVolumeWei =
      BigInt(current?.buyVolumeWei ?? "0") +
      (swap.side === "BUY" ? amount : 0n);
    const sellVolumeWei =
      BigInt(current?.sellVolumeWei ?? "0") +
      (swap.side === "SELL" ? amount : 0n);
    const grossVolumeWei = buyVolumeWei + sellVolumeWei;
    const netFlowWei = buyVolumeWei - sellVolumeWei;
    const buyCount = (current?.buyCount ?? 0) + (swap.side === "BUY" ? 1 : 0);
    const sellCount =
      (current?.sellCount ?? 0) + (swap.side === "SELL" ? 1 : 0);

    await tx
      .insert(tokenVolumeTotals)
      .values({
        tokenAddress: swap.tokenAddress,
        poolAddress: swap.poolAddress,
        buyVolumeWei: buyVolumeWei.toString(),
        sellVolumeWei: sellVolumeWei.toString(),
        grossVolumeWei: grossVolumeWei.toString(),
        netFlowWei: netFlowWei.toString(),
        buyCount,
        sellCount,
        tradeCount: buyCount + sellCount,
        firstTradeBlock: current?.firstTradeBlock ?? swap.blockNumber,
        lastTradeBlock: swap.blockNumber,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tokenVolumeTotals.tokenAddress,
        set: {
          poolAddress: swap.poolAddress,
          buyVolumeWei: buyVolumeWei.toString(),
          sellVolumeWei: sellVolumeWei.toString(),
          grossVolumeWei: grossVolumeWei.toString(),
          netFlowWei: netFlowWei.toString(),
          buyCount,
          sellCount,
          tradeCount: buyCount + sellCount,
          lastTradeBlock: swap.blockNumber,
          updatedAt: new Date(),
        },
      });

    return { inserted: true, grossVolumeWei };
  });
}

function tokenIsToken0(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() < ponsV1.weth.toLowerCase();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function groupBuybotSettings(groupId: string) {
  await db
    .insert(buybotSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: buybotSettings.groupId });

  return db.query.buybotSettings.findFirst({
    where: eq(buybotSettings.groupId, groupId),
  });
}

async function notifyBuy(input: {
  api: Api;
  groupId: string;
  tokenAddress: string;
  symbol: string;
  transactionHash: string;
  traderAddress: string;
  pairAmountWei: bigint;
  tokenAmountRaw: bigint;
  tokenDecimals: number;
  holdingBalance: bigint;
  totalSupply: bigint;
  volumeWei: bigint;
  imageTelegramFileId?: string;
  topicId?: number;
  labels: string[];
}) {
  const holdingBps =
    input.totalSupply > 0n
      ? (input.holdingBalance * 10_000n) / input.totalSupply
      : 0n;
  const holdingPercent = (Number(holdingBps) / 100).toFixed(2);
  const transactionUrl = `${ponsV1.explorerUrl}/tx/${input.transactionHash}`;
  const buyerUrl = `${ponsV1.explorerUrl}/address/${input.traderAddress}`;
  const symbol = escapeTelegramHtml(input.symbol);

  const content = [
      `🟢 <b>${symbol} BUY</b>`,
      "",
      `Spent: ${Number(formatEther(input.pairAmountWei)).toFixed(4)} ETH`,
      `Received: ${Number(
        formatUnits(input.tokenAmountRaw, input.tokenDecimals),
      ).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`,
      `Buyer: <a href="${buyerUrl}">${escapeTelegramHtml(shortAddress(input.traderAddress))}</a>`,
      `Holding: ${holdingPercent}%`,
      input.labels.length > 0 ? `Labels: ${input.labels.join(" · ")}` : null,
      `Volume since launch: ${Number(formatEther(input.volumeWei)).toFixed(4)} ETH`,
      "",
      `<a href="${transactionUrl}">View transaction ↗</a>`,
    ].filter((line): line is string => line !== null).join("\n");
  const options = {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(input.topicId ? { message_thread_id: input.topicId } : {}),
    } as const;

  if (input.imageTelegramFileId) {
    await input.api.sendPhoto(
      Number(input.groupId),
      input.imageTelegramFileId,
      { caption: content, ...options },
    );
    return;
  }

  await input.api.sendMessage(Number(input.groupId), content, options);
}

async function queueBuyAggregate(input: {
  groupId: string;
  tokenAddress: string;
  symbol: string;
  traderAddress: string;
  transactionHash: string;
  pairAmountWei: bigint;
}) {
  const id = `${input.groupId}:${input.tokenAddress.toLowerCase()}`;
  await db.transaction(async (tx) => {
    const current = await tx.query.buybotAggregates.findFirst({
      where: eq(buybotAggregates.id, id),
    });
    const traders = new Set<string>(
      current
        ? (JSON.parse(current.uniqueTradersJson) as string[])
        : [],
    );
    traders.add(input.traderAddress.toLowerCase());
    const total = BigInt(current?.totalVolumeWei ?? "0") + input.pairAmountWei;
    const largest = BigInt(current?.largestBuyWei ?? "0");
    const values = {
      id,
      groupId: input.groupId,
      tokenAddress: input.tokenAddress,
      symbol: input.symbol,
      totalVolumeWei: total.toString(),
      largestBuyWei:
        input.pairAmountWei > largest
          ? input.pairAmountWei.toString()
          : largest.toString(),
      buyCount: (current?.buyCount ?? 0) + 1,
      uniqueTradersJson: JSON.stringify([...traders]),
      lastTransactionHash: input.transactionHash,
      startedAt: current?.startedAt ?? new Date(),
      updatedAt: new Date(),
    };
    await tx
      .insert(buybotAggregates)
      .values(values)
      .onConflictDoUpdate({
        target: buybotAggregates.id,
        set: values,
      });
  });
}

export async function flushBuybotAggregates(api: Api): Promise<number> {
  if (flushingAggregates) return 0;
  flushingAggregates = true;
  try {
    const aggregates = await db.select().from(buybotAggregates);
    let sent = 0;
    for (const aggregate of aggregates) {
      const settings = await groupBuybotSettings(aggregate.groupId);
      const windowSeconds = settings?.aggregateWindowSeconds ?? 60;
      if (
        Date.now() - aggregate.startedAt.getTime() < windowSeconds * 1_000
      ) {
        continue;
      }

      try {
        const traders = JSON.parse(aggregate.uniqueTradersJson) as string[];
        const content = [
          `🔥 <b>${escapeTelegramHtml(aggregate.symbol)} BUY ACTIVITY</b>`,
          "",
          `${aggregate.buyCount} buys in ${windowSeconds} seconds`,
          `Total bought: ${Number(formatEther(BigInt(aggregate.totalVolumeWei))).toFixed(4)} ETH`,
          `Unique buyers: ${traders.length}`,
          `Largest buy: ${Number(formatEther(BigInt(aggregate.largestBuyWei))).toFixed(4)} ETH`,
          "",
          `<a href="${ponsV1.explorerUrl}/tx/${aggregate.lastTransactionHash}">View latest transaction ↗</a>`,
        ].join("\n");
        const options = {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: launchTradingKeyboard(aggregate.tokenAddress),
          ...(settings?.topicId ? { message_thread_id: settings.topicId } : {}),
        } as const;

        const session = await activeTokenSession(aggregate.groupId);
        const asset = session
          ? await db.query.tokenAssets.findFirst({
              where: eq(tokenAssets.launchSessionId, session.id),
            })
          : null;
        const image =
          settings?.customImageTelegramFileId ?? asset?.telegramFileId;
        if (image) {
          await api.sendPhoto(Number(aggregate.groupId), image, {
            caption: content,
            ...options,
          });
        } else {
          await api.sendMessage(Number(aggregate.groupId), content, options);
        }
        await db.delete(buybotAggregates).where(
          and(
            eq(buybotAggregates.id, aggregate.id),
            eq(buybotAggregates.updatedAt, aggregate.updatedAt),
          ),
        );
        sent += 1;
      } catch (error) {
        console.error("BUYBOT_AGGREGATE_SEND_FAILED", {
          groupId: aggregate.groupId,
          tokenAddress: aggregate.tokenAddress,
          error,
        });
      }
    }
    return sent;
  } finally {
    flushingAggregates = false;
  }
}

async function sessionTarget(
  session: typeof launchSessions.$inferSelect,
): Promise<BuybotTarget | null> {
  if (!session.tokenAddress || !session.poolAddress) return null;

  let launchBlock = session.launchBlock;
  if (launchBlock === null && session.transactionHash) {
    const receipt = await loggedRpcCall({
      operation: "eth_getTransactionReceipt",
      context: { transactionHash: session.transactionHash },
      call: () =>
        client.getTransactionReceipt({
          hash: session.transactionHash as `0x${string}`,
        }),
      isExpected: (value) => value.blockNumber >= 0n,
    });
    launchBlock = Number(receipt.blockNumber);
    await db
      .update(launchSessions)
      .set({ launchBlock })
      .where(eq(launchSessions.id, session.id));
  }
  if (launchBlock === null) return null;

  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  const tokenAsset = await db.query.tokenAssets.findFirst({
    where: eq(tokenAssets.launchSessionId, session.id),
  });
  const latestSwap = await db.query.swaps.findFirst({
    where: eq(swaps.tokenAddress, session.tokenAddress),
    orderBy: [desc(swaps.blockNumber)],
  });
  const settings = await db.query.buybotSettings.findFirst({
    where: eq(buybotSettings.groupId, session.groupId),
  });
  const launchOrEnabledAt =
    settings?.enabledAt ?? session.consumedAt ?? session.createdAt;
  const lastActivityAt = latestSwap
    ? (latestSwap.tradedAt ?? latestSwap.createdAt)
    : launchOrEnabledAt;
  return {
    groupId: session.groupId,
    tokenAddress: session.tokenAddress,
    poolAddress: session.poolAddress,
    symbol: draft.symbol,
    startBlock: launchBlock,
    deployerAddress: session.expectedDeployer,
    session: session as ActiveTokenSession,
    lastActivityAt:
      lastActivityAt > launchOrEnabledAt ? lastActivityAt : launchOrEnabledAt,
    defaultImageTelegramFileId: tokenAsset?.telegramFileId ?? undefined,
  };
}

async function disableIdleTarget(api: Api, target: BuybotTarget): Promise<void> {
  await db
    .update(buybotSettings)
    .set({ enabled: false })
    .where(eq(buybotSettings.groupId, target.groupId));

  try {
    await api.sendMessage(
      Number(target.groupId),
      [
        `⏸ <b>${escapeTelegramHtml(target.symbol)} BUYBOT PAUSED</b>`,
        "",
        "No swap activity was detected for 2 hours, so Telepons stopped on-chain monitoring to save RPC usage.",
        "",
        "The owner can run /buybot on to resume monitoring with a new 2-hour activity window.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    console.error("BUYBOT_IDLE_NOTIFICATION_FAILED", {
      groupId: target.groupId,
      tokenAddress: target.tokenAddress,
      error,
    });
  }
}

async function currentLastActivityAt(target: BuybotTarget): Promise<Date> {
  const [latestSwap, settings] = await Promise.all([
    db.query.swaps.findFirst({
      where: eq(swaps.tokenAddress, target.tokenAddress),
      orderBy: [desc(swaps.blockNumber)],
    }),
    db.query.buybotSettings.findFirst({
      where: eq(buybotSettings.groupId, target.groupId),
    }),
  ]);
  const enabledAt =
    settings?.enabledAt ??
    target.session.consumedAt ??
    target.session.createdAt;
  const swapAt = latestSwap
    ? (latestSwap.tradedAt ?? latestSwap.createdAt)
    : enabledAt;
  return swapAt > enabledAt ? swapAt : enabledAt;
}

async function indexPool(
  api: Api,
  targets: BuybotTarget[],
  chainHead: bigint,
): Promise<boolean> {
  const firstTarget = targets[0];
  if (!firstTarget) return false;
  const tokenAddress = getAddress(firstTarget.tokenAddress);
  const poolAddress = getAddress(firstTarget.poolAddress);
  const configuredTargets: Array<{
    target: BuybotTarget;
    settings: NonNullable<Awaited<ReturnType<typeof groupBuybotSettings>>>;
  }> = [];
  const blockTimestampCache = new Map<bigint, Date>();
  let latestSqrtPriceX96: bigint | undefined;
  let insertedAnySwap = false;
  for (const target of targets) {
    const settings = await groupBuybotSettings(target.groupId);
    if (settings?.enabled) configuredTargets.push({ target, settings });
  }
  if (configuredTargets.length === 0) return false;

  let checkpoint = await db.query.indexerCheckpoints.findFirst({
    where: eq(indexerCheckpoints.poolAddress, poolAddress),
  });
  if (!checkpoint) {
    await db.insert(indexerCheckpoints).values({
      poolAddress,
      tokenAddress,
      nextBlock: Math.min(...targets.map((target) => target.startBlock)),
    });
    checkpoint = await db.query.indexerCheckpoints.findFirst({
      where: eq(indexerCheckpoints.poolAddress, poolAddress),
    });
  }
  if (!checkpoint) return false;

  let fromBlock = BigInt(checkpoint.nextBlock);

  while (fromBlock <= chainHead) {
    const toBlock =
      fromBlock + blockChunkSize - 1n < chainHead
        ? fromBlock + blockChunkSize - 1n
        : chainHead;
    const logs = await loggedRpcCall({
      operation: "eth_getLogs",
      context: {
        poolAddress,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      },
      call: () =>
        client.getLogs({
          address: poolAddress,
          event: uniswapV3SwapEvent,
          fromBlock,
          toBlock,
        }),
      isExpected: Array.isArray,
    });

    for (const log of logs) {
      if (
        log.blockNumber === null ||
        log.logIndex === null ||
        log.transactionHash === null
      ) {
        continue;
      }

      const isToken0 = tokenIsToken0(tokenAddress);
      const { amount0, amount1 } = log.args;
      if (amount0 === undefined || amount1 === undefined) {
        continue;
      }
      const pairSigned = isToken0 ? amount1 : amount0;
      const tokenSigned = isToken0 ? amount0 : amount1;
      const side = pairSigned > 0n ? "BUY" : "SELL";
      const pairAmountWei = pairSigned < 0n ? -pairSigned : pairSigned;
      const tokenAmountRaw = tokenSigned < 0n ? -tokenSigned : tokenSigned;
      const transaction = await loggedRpcCall({
        operation: "eth_getTransactionByHash",
        context: { transactionHash: log.transactionHash, poolAddress },
        call: () => client.getTransaction({ hash: log.transactionHash }),
        isExpected: (value) => Boolean(value.from),
      });
      const traderAddress = getAddress(transaction.from);
      const eventId = `${robinhoodChain.id}:${log.transactionHash}:${log.logIndex}`;
      let tradedAt = blockTimestampCache.get(log.blockNumber);
      if (!tradedAt) {
        const block = await loggedRpcCall({
          operation: "eth_getBlockByNumber:swapTimestamp",
          context: { blockNumber: log.blockNumber.toString(), poolAddress },
          call: () => client.getBlock({ blockNumber: log.blockNumber! }),
          isExpected: (value) => value.timestamp > 0n,
        });
        tradedAt = new Date(Number(block.timestamp) * 1_000);
        blockTimestampCache.set(log.blockNumber, tradedAt);
      }

      const recordedVolume = await recordSwapAndVolume({
        id: eventId,
        tokenAddress,
        poolAddress,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: Number(log.blockNumber),
        traderAddress,
        side,
        pairAmountWei: pairAmountWei.toString(),
        tokenAmountRaw: tokenAmountRaw.toString(),
        tradedAt,
      });
      if (recordedVolume.inserted) {
        insertedAnySwap = true;
        latestSqrtPriceX96 = log.args.sqrtPriceX96;
      }

      if (!recordedVolume.inserted || side !== "BUY") {
        continue;
      }

      const notificationTargets = configuredTargets.filter(
        ({ settings }) => pairAmountWei >= BigInt(settings.minimumBuyWei),
      );
      if (notificationTargets.length === 0) continue;

      const [tokenDecimals, holdingBalance, totalSupply] = await loggedRpcCall({
        operation: "eth_call:buybotTokenSnapshot",
        context: { tokenAddress, traderAddress },
        call: () =>
          Promise.all([
            client.readContract({
              address: tokenAddress,
              abi: erc20ReadAbi,
              functionName: "decimals",
            }),
            client.readContract({
              address: tokenAddress,
              abi: erc20ReadAbi,
              functionName: "balanceOf",
              args: [traderAddress],
            }),
            client.readContract({
              address: tokenAddress,
              abi: erc20ReadAbi,
              functionName: "totalSupply",
            }),
          ]),
        isExpected: (value) => value.length === 3,
      });

      for (const { target, settings } of notificationTargets) {
        if (settings.notificationMode === "AGGREGATE") {
          await queueBuyAggregate({
            groupId: target.groupId,
            tokenAddress,
            symbol: target.symbol,
            traderAddress,
            transactionHash: log.transactionHash,
            pairAmountWei,
          });
          continue;
        }
        const labels = [
          isAddressEqual(traderAddress, getAddress(target.deployerAddress))
            ? "👤 Creator"
            : null,
          Number(log.blockNumber) <= target.startBlock + 20
            ? "🎯 Early buyer"
            : null,
          totalSupply > 0n && (holdingBalance * 10_000n) / totalSupply >= 100n
            ? "🐋 Whale"
            : null,
        ].filter((label): label is string => label !== null);
        await notifyBuy({
          api,
          groupId: target.groupId,
          tokenAddress,
          symbol: target.symbol,
          transactionHash: log.transactionHash,
          traderAddress,
          pairAmountWei,
          tokenAmountRaw,
          tokenDecimals,
          holdingBalance,
          totalSupply,
          volumeWei: recordedVolume.grossVolumeWei,
          imageTelegramFileId:
            settings.customImageTelegramFileId ??
            target.defaultImageTelegramFileId,
          topicId: settings.topicId ?? undefined,
          labels,
        });
      }
    }

    fromBlock = toBlock + 1n;
    await db
      .update(indexerCheckpoints)
      .set({
        nextBlock: Number(fromBlock),
        updatedAt: new Date(),
      })
      .where(eq(indexerCheckpoints.poolAddress, poolAddress));
  }

  if (insertedAnySwap && latestSqrtPriceX96 !== undefined) {
    await updateIntelligenceAfterSwap({
      api,
      sessions: configuredTargets.map(({ target }) => target.session),
      sqrtPriceX96: latestSqrtPriceX96,
    });
  }
  return insertedAnySwap;
}

export async function runBuybotIndexer(api: Api): Promise<void> {
  if (indexing) return;
  indexing = true;

  try {
    const [sessions, settingsRows] = await Promise.all([
      db.query.launchSessions.findMany({
        where: eq(launchSessions.status, "ACTIVE"),
      }),
      db.select().from(buybotSettings),
    ]);
    const enabledByGroup = new Map(
      settingsRows.map((settings) => [settings.groupId, settings.enabled]),
    );
    const groupHasEnabledBuybot = (groupId: string) =>
      enabledByGroup.get(groupId) === true;
    const enabledSessions = sessions.filter((session) =>
      groupHasEnabledBuybot(session.groupId),
    );
    // Database checks are intentionally completed before any RPC work. An idle
    // installation therefore consumes zero Robinhood Chain RPC requests.
    if (enabledSessions.length === 0) return;

    const targets: BuybotTarget[] = [];
    for (const session of enabledSessions) {
      try {
        const target = await sessionTarget(session);
        if (!target) continue;
        targets.push(target);
      } catch (error) {
        console.error(
          `BuyBot indexing failed for ${session.tokenAddress ?? session.id}`,
          error,
        );
      }
    }

    const targetsByPool = new Map<string, Map<string, BuybotTarget>>();
    for (const target of targets) {
      const poolKey = getAddress(target.poolAddress).toLowerCase();
      const groupTargets = targetsByPool.get(poolKey) ?? new Map();
      if (!groupTargets.has(target.groupId)) {
        groupTargets.set(target.groupId, target);
      }
      targetsByPool.set(poolKey, groupTargets);
    }
    if (targetsByPool.size === 0) return;

    const now = Date.now();
    const duePools = [...targetsByPool.entries()].filter(
      ([poolAddress, groupTargets]) => {
        const interval = Math.min(
          ...[...groupTargets.values()].map((target) =>
            pollProfile(now - target.lastActivityAt.getTime()).swapIntervalMs,
          ),
        );
        return now - (lastSwapPollAt.get(poolAddress) ?? 0) >= interval;
      },
    );
    const duePoolKeys = new Set(duePools.map(([poolAddress]) => poolAddress));
    const holderDuePoolKeys = new Set<string>();
    for (const [poolAddress, groupTargets] of targetsByPool) {
      const firstTarget = groupTargets.values().next().value as
        | BuybotTarget
        | undefined;
      if (firstTarget && (await holderSyncIsDue(firstTarget, now))) {
        holderDuePoolKeys.add(poolAddress);
      }
    }
    const poolsToProcess = [...targetsByPool.entries()].filter(
      ([poolAddress]) =>
        duePoolKeys.has(poolAddress) || holderDuePoolKeys.has(poolAddress),
    );
    // Avoid even the shared eth_blockNumber request when every active pool is
    // currently inside its adaptive backoff window and no holder trigger is due.
    if (poolsToProcess.length === 0) return;

    const chainHead = await loggedRpcCall({
      operation: "eth_blockNumber",
      call: () => client.getBlockNumber(),
      isExpected: (value) => value >= 0n,
    });
    for (const [poolAddress, groupTargets] of poolsToProcess) {
      try {
        const poolTargets = [...groupTargets.values()];
        const firstTarget = poolTargets[0];
        let holderSyncedThisCycle = false;
        if (firstTarget && holderDuePoolKeys.has(poolAddress)) {
          try {
            const holderSyncStartedAt = new Date();
            await indexTokenHolders({
              tokenAddress: firstTarget.tokenAddress,
              poolAddress: firstTarget.poolAddress,
              startBlock: firstTarget.startBlock,
              chainHead,
            });
            await markHolderSynced(
              firstTarget.tokenAddress,
              Date.now(),
              holderSyncStartedAt,
            );
            holderSyncedThisCycle = true;
          } catch (error) {
            console.error("HOLDER_INDEX_FAILED", {
              tokenAddress: firstTarget.tokenAddress,
              error,
            });
          }
        }
        if (!duePoolKeys.has(poolAddress)) continue;

        lastSwapPollAt.set(poolAddress, now);
        const insertedSwap = await indexPool(api, poolTargets, chainHead);
        if (insertedSwap && firstTarget) {
          await scheduleTokenHolderSync({
            tokenAddress: firstTarget.tokenAddress,
            notBefore: new Date(Date.now() + holderAfterSwapDebounceMs),
            reason: "swap_detected",
          });
        }

        // Perform the final catch-up read before auto-pausing. A swap mined just
        // before the two-hour boundary is therefore indexed and resets the
        // activity window instead of being missed by an early database check.
        const idleCandidates = poolTargets.filter(
          (target) =>
            now - target.lastActivityAt.getTime() >= idleDisableAfterMs,
        );
        if (
          idleCandidates.length > 0 &&
          firstTarget &&
          !holderSyncedThisCycle
        ) {
          try {
            const holderSyncStartedAt = new Date();
            await indexTokenHolders({
              tokenAddress: firstTarget.tokenAddress,
              poolAddress: firstTarget.poolAddress,
              startBlock: firstTarget.startBlock,
              chainHead,
            });
            await markHolderSynced(
              firstTarget.tokenAddress,
              Date.now(),
              holderSyncStartedAt,
            );
          } catch (error) {
            console.error("HOLDER_FINAL_SYNC_FAILED", {
              tokenAddress: firstTarget.tokenAddress,
              error,
            });
          }
        }
        for (const target of idleCandidates) {
          const lastActivityAt = await currentLastActivityAt(target);
          if (Date.now() - lastActivityAt.getTime() >= idleDisableAfterMs) {
            await disableIdleTarget(api, target);
          }
        }
      } catch (error) {
        console.error("BUYBOT_POOL_INDEX_FAILED", {
          poolAddress,
          targetCount: groupTargets.size,
          error,
        });
      }
    }
  } finally {
    indexing = false;
  }
}

import type { Api } from "grammy";
import { eq } from "drizzle-orm";
import {
  createPublicClient,
  formatEther,
  formatUnits,
  getAddress,
  isAddressEqual,
  zeroAddress,
} from "viem";
import { robinhoodChain } from "@/blockchain/chain";
import { rateLimitedHttp } from "@/blockchain/rate-limited-transport";
import { loggedRpcCall } from "@/blockchain/rpc-logging";
import {
  erc20ReadAbi,
  uniswapV3SwapEvent,
} from "@/blockchain/uniswap-v3-abi";
import { env } from "@/config/env";
import { ponsV1 } from "@/config/pons";
import { db } from "@/db/client";
import {
  buybotTestTargets,
  buybotSettings,
  indexerCheckpoints,
  launchSessions,
  swaps,
  tokenAssets,
  tokenVolumeTotals,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

const client = createPublicClient({
  chain: robinhoodChain,
  transport: rateLimitedHttp(
    env.ROBINHOOD_RPC_URL ?? ponsV1.publicRpcUrl,
    5,
  ),
});

const blockChunkSize = 500n;
let indexing = false;

type BuybotTarget = {
  groupId: string;
  tokenAddress: string;
  poolAddress: string;
  symbol: string;
  startBlock: number;
  defaultImageTelegramFileId?: string;
};

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
      `Volume since launch: ${Number(formatEther(input.volumeWei)).toFixed(4)} ETH`,
      "",
      `<a href="${transactionUrl}">View transaction ↗</a>`,
    ].join("\n");
  const options = {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
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
  return {
    groupId: session.groupId,
    tokenAddress: session.tokenAddress,
    poolAddress: session.poolAddress,
    symbol: draft.symbol,
    startBlock: launchBlock,
    defaultImageTelegramFileId: tokenAsset?.telegramFileId ?? undefined,
  };
}

async function indexPool(
  api: Api,
  targets: BuybotTarget[],
  chainHead: bigint,
) {
  const firstTarget = targets[0];
  if (!firstTarget) return;
  const tokenAddress = getAddress(firstTarget.tokenAddress);
  const poolAddress = getAddress(firstTarget.poolAddress);
  const configuredTargets: Array<{
    target: BuybotTarget;
    settings: NonNullable<Awaited<ReturnType<typeof groupBuybotSettings>>>;
  }> = [];
  for (const target of targets) {
    const settings = await groupBuybotSettings(target.groupId);
    if (settings?.enabled) configuredTargets.push({ target, settings });
  }
  if (configuredTargets.length === 0) return;

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
  if (!checkpoint) return;

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
      });

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
}

export async function runBuybotIndexer(api: Api): Promise<void> {
  if (indexing) return;
  indexing = true;

  try {
    const [sessions, testTargets, settingsRows] = await Promise.all([
      db.query.launchSessions.findMany({
        where: eq(launchSessions.status, "ACTIVE"),
      }),
      db.query.buybotTestTargets.findMany({
        where: eq(buybotTestTargets.enabled, true),
      }),
      db.select().from(buybotSettings),
    ]);
    const enabledByGroup = new Map(
      settingsRows.map((settings) => [settings.groupId, settings.enabled]),
    );
    const groupHasEnabledBuybot = (groupId: string) =>
      enabledByGroup.get(groupId) !== false;
    const enabledSessions = sessions.filter((session) =>
      groupHasEnabledBuybot(session.groupId),
    );
    const enabledTestTargets = testTargets.filter((target) =>
      groupHasEnabledBuybot(target.groupId),
    );

    // Database checks are intentionally completed before any RPC work. An idle
    // installation therefore consumes zero Robinhood Chain RPC requests.
    if (enabledSessions.length === 0 && enabledTestTargets.length === 0) return;

    const targets: BuybotTarget[] = [];
    for (const session of enabledSessions) {
      try {
        const target = await sessionTarget(session);
        if (target) targets.push(target);
      } catch (error) {
        console.error(
          `BuyBot indexing failed for ${session.tokenAddress ?? session.id}`,
          error,
        );
      }
    }

    for (const target of enabledTestTargets) {
      targets.push({
        groupId: target.groupId,
        tokenAddress: target.tokenAddress,
        poolAddress: target.poolAddress,
        symbol: target.symbol,
        startBlock: target.startBlock,
      });
    }

    const targetsByPool = new Map<string, Map<string, BuybotTarget>>();
    for (const target of targets) {
      const poolKey = getAddress(target.poolAddress).toLowerCase();
      const groupTargets = targetsByPool.get(poolKey) ?? new Map();
      // An active launch target takes precedence over an equivalent test target.
      if (!groupTargets.has(target.groupId)) {
        groupTargets.set(target.groupId, target);
      }
      targetsByPool.set(poolKey, groupTargets);
    }
    if (targetsByPool.size === 0) return;

    const chainHead = await loggedRpcCall({
      operation: "eth_blockNumber",
      call: () => client.getBlockNumber(),
      isExpected: (value) => value >= 0n,
    });
    for (const [poolAddress, groupTargets] of targetsByPool) {
      try {
        await indexPool(api, [...groupTargets.values()], chainHead);
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

export async function registerBuybotTestTarget(input: {
  groupId: string;
  tokenAddress: string;
}) {
  const tokenAddress = getAddress(input.tokenAddress);
  const [poolAddress, symbol, tokenDecimals, currentBlock] =
    await loggedRpcCall({
      operation: "registerBuybotTestTarget",
      context: { tokenAddress },
      call: () =>
        Promise.all([
          client.readContract({
            address: tokenAddress,
            abi: erc20ReadAbi,
            functionName: "liquidityPool",
          }),
          client.readContract({
            address: tokenAddress,
            abi: erc20ReadAbi,
            functionName: "symbol",
          }),
          client.readContract({
            address: tokenAddress,
            abi: erc20ReadAbi,
            functionName: "decimals",
          }),
          client.getBlockNumber(),
        ]),
      isExpected: (value) =>
        value.length === 4 && typeof value[3] === "bigint",
    });
  const canonicalPool = getAddress(poolAddress);
  if (isAddressEqual(canonicalPool, zeroAddress)) {
    throw new Error("TOKEN_HAS_NO_LIQUIDITY_POOL");
  }
  const id = `${input.groupId}:${tokenAddress}`;

  await db
    .insert(buybotTestTargets)
    .values({
      id,
      groupId: input.groupId,
      tokenAddress,
      poolAddress: canonicalPool,
      symbol,
      tokenDecimals,
      startBlock: Number(currentBlock),
      enabled: true,
    })
    .onConflictDoUpdate({
      target: buybotTestTargets.id,
      set: {
        poolAddress: canonicalPool,
        symbol,
        tokenDecimals,
        startBlock: Number(currentBlock),
        enabled: true,
      },
    });
  await db
    .insert(indexerCheckpoints)
    .values({
      poolAddress: canonicalPool,
      tokenAddress,
      nextBlock: Number(currentBlock),
    })
    .onConflictDoUpdate({
      target: indexerCheckpoints.poolAddress,
      set: {
        tokenAddress,
        nextBlock: Number(currentBlock),
        updatedAt: new Date(),
      },
    });

  return {
    tokenAddress,
    poolAddress: canonicalPool,
    symbol,
    startBlock: currentBlock,
  };
}

export async function disableBuybotTestTargets(
  groupId: string,
): Promise<number> {
  const disabled = await db
    .update(buybotTestTargets)
    .set({ enabled: false })
    .where(eq(buybotTestTargets.groupId, groupId))
    .returning({ id: buybotTestTargets.id });
  return disabled.length;
}

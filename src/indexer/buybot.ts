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
    20,
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

  db.transaction((tx) => {
    for (const [tokenAddress, total] of totals) {
      const grossVolumeWei = total.buyVolumeWei + total.sellVolumeWei;
      const netFlowWei = total.buyVolumeWei - total.sellVolumeWei;

      tx.insert(tokenVolumeTotals)
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
        })
        .run();
    }
  });
}

function recordSwapAndVolume(swap: SwapRecord): {
  inserted: boolean;
  grossVolumeWei: bigint;
} {
  return db.transaction((tx) => {
    const inserted = tx
      .insert(swaps)
      .values(swap)
      .onConflictDoNothing({ target: swaps.id })
      .returning({ id: swaps.id })
      .all();

    const current = tx
      .select()
      .from(tokenVolumeTotals)
      .where(eq(tokenVolumeTotals.tokenAddress, swap.tokenAddress))
      .get();

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

    tx.insert(tokenVolumeTotals)
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
      })
      .run();

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
  const symbol = escapeTelegramHtml(input.symbol);

  const content = [
      `🟢 <b>${symbol} BUY</b>`,
      "",
      `Spent: ${Number(formatEther(input.pairAmountWei)).toFixed(4)} ETH`,
      `Received: ${Number(
        formatUnits(input.tokenAmountRaw, input.tokenDecimals),
      ).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`,
      `Buyer: <code>${escapeTelegramHtml(shortAddress(input.traderAddress))}</code>`,
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
    const receipt = await client.getTransactionReceipt({
      hash: session.transactionHash as `0x${string}`,
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

async function indexTarget(api: Api, target: BuybotTarget) {
  const tokenAddress = getAddress(target.tokenAddress);
  const poolAddress = getAddress(target.poolAddress);
  const settings = await groupBuybotSettings(target.groupId);
  if (!settings?.enabled) return;

  let checkpoint = await db.query.indexerCheckpoints.findFirst({
    where: eq(indexerCheckpoints.poolAddress, poolAddress),
  });
  if (!checkpoint) {
    await db.insert(indexerCheckpoints).values({
      poolAddress,
      tokenAddress,
      nextBlock: target.startBlock,
    });
    checkpoint = await db.query.indexerCheckpoints.findFirst({
      where: eq(indexerCheckpoints.poolAddress, poolAddress),
    });
  }
  if (!checkpoint) return;

  const chainHead = await client.getBlockNumber();
  let fromBlock = BigInt(checkpoint.nextBlock);

  while (fromBlock <= chainHead) {
    const toBlock =
      fromBlock + blockChunkSize - 1n < chainHead
        ? fromBlock + blockChunkSize - 1n
        : chainHead;
    const logs = await client.getLogs({
      address: poolAddress,
      event: uniswapV3SwapEvent,
      fromBlock,
      toBlock,
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
      const transaction = await client.getTransaction({
        hash: log.transactionHash,
      });
      const traderAddress = getAddress(transaction.from);
      const eventId = `${robinhoodChain.id}:${log.transactionHash}:${log.logIndex}`;

      const recordedVolume = recordSwapAndVolume({
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

      if (
        !recordedVolume.inserted ||
        side !== "BUY" ||
        pairAmountWei < BigInt(settings.minimumBuyWei)
      ) {
        continue;
      }

      const [tokenDecimals, holdingBalance, totalSupply] = await Promise.all([
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
        ]);

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
    const sessions = await db.query.launchSessions.findMany({
      where: eq(launchSessions.status, "ACTIVE"),
    });
    for (const session of sessions) {
      try {
        const target = await sessionTarget(session);
        if (target) await indexTarget(api, target);
      } catch (error) {
        console.error(
          `BuyBot indexing failed for ${session.tokenAddress ?? session.id}`,
          error,
        );
      }
    }

    const testTargets = await db.query.buybotTestTargets.findMany({
      where: eq(buybotTestTargets.enabled, true),
    });
    for (const target of testTargets) {
      try {
        await indexTarget(api, {
          groupId: target.groupId,
          tokenAddress: target.tokenAddress,
          poolAddress: target.poolAddress,
          symbol: target.symbol,
          startBlock: target.startBlock,
        });
      } catch (error) {
        console.error(
          `BuyBot test indexing failed for ${target.tokenAddress}`,
          error,
        );
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
  const [poolAddress, symbol, tokenDecimals, currentBlock] = await Promise.all([
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
  ]);
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

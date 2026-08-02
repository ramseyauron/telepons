import { eq } from "drizzle-orm";
import { getAddress, zeroAddress } from "viem";
import { robinhoodChain } from "@/blockchain/chain";
import { robinhoodPublicClient } from "@/blockchain/public-client";
import { loggedRpcCall } from "@/blockchain/rpc-logging";
import { erc20TransferEvent } from "@/blockchain/uniswap-v3-abi";
import { ponsV1 } from "@/config/pons";
import { db } from "@/db/client";
import {
  holderBalances,
  holderIndexerCheckpoints,
  tokenHolderStats,
  tokenSnapshots,
  tokenTransfers,
} from "@/db/schema";

const chunkSize = 500n;

async function applyBalanceDelta(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tokenAddress: string,
  walletAddress: string,
  delta: bigint,
) {
  if (walletAddress.toLowerCase() === zeroAddress) return;
  const id = `${tokenAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;
  const current = await tx.query.holderBalances.findFirst({
    where: eq(holderBalances.id, id),
  });
  const next = BigInt(current?.balanceRaw ?? "0") + delta;
  if (next < 0n) {
    throw new Error(`NEGATIVE_HOLDER_BALANCE:${id}`);
  }
  await tx
    .insert(holderBalances)
    .values({
      id,
      tokenAddress,
      walletAddress,
      balanceRaw: next.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: holderBalances.id,
      set: { balanceRaw: next.toString(), updatedAt: new Date() },
    });
}

async function rebuildHolderStats(input: {
  tokenAddress: string;
  poolAddress: string;
  totalSupplyRaw: bigint;
}) {
  const balances = await db.query.holderBalances.findMany({
    where: eq(holderBalances.tokenAddress, input.tokenAddress),
  });
  const excluded = new Set(
    [
      zeroAddress,
      input.poolAddress,
      ponsV1.factory,
      ponsV1.locker,
      ponsV1.swapRouter,
      ponsV1.positionManager,
    ].map((address) => address.toLowerCase()),
  );
  const adjusted = balances
    .filter(
      (balance) =>
        BigInt(balance.balanceRaw) > 0n &&
        !excluded.has(balance.walletAddress.toLowerCase()),
    )
    .sort((a, b) => {
      const left = BigInt(a.balanceRaw);
      const right = BigInt(b.balanceRaw);
      return left === right ? 0 : left > right ? -1 : 1;
    });
  const top10 = adjusted
    .slice(0, 10)
    .reduce((total, balance) => total + BigInt(balance.balanceRaw), 0n);
  const largest = adjusted[0];
  const bps = (value: bigint) =>
    input.totalSupplyRaw > 0n
      ? Number((value * 10_000n) / input.totalSupplyRaw)
      : 0;
  const values = {
    tokenAddress: input.tokenAddress,
    adjustedHolderCount: adjusted.length,
    top10Bps: bps(top10),
    largestHolderAddress: largest?.walletAddress ?? null,
    largestHolderBps: largest ? bps(BigInt(largest.balanceRaw)) : 0,
    updatedAt: new Date(),
  };
  await db
    .insert(tokenHolderStats)
    .values(values)
    .onConflictDoUpdate({
      target: tokenHolderStats.tokenAddress,
      set: values,
    });
}

export async function indexTokenHolders(input: {
  tokenAddress: string;
  poolAddress: string;
  startBlock: number;
  chainHead: bigint;
}): Promise<void> {
  const tokenAddress = getAddress(input.tokenAddress);
  await db
    .insert(holderIndexerCheckpoints)
    .values({ tokenAddress, nextBlock: input.startBlock })
    .onConflictDoNothing({ target: holderIndexerCheckpoints.tokenAddress });
  const checkpoint = await db.query.holderIndexerCheckpoints.findFirst({
    where: eq(holderIndexerCheckpoints.tokenAddress, tokenAddress),
  });
  if (!checkpoint) return;

  let fromBlock = BigInt(checkpoint.nextBlock);
  let changed = false;
  while (fromBlock <= input.chainHead) {
    const toBlock =
      fromBlock + chunkSize - 1n < input.chainHead
        ? fromBlock + chunkSize - 1n
        : input.chainHead;
    const logs = await loggedRpcCall({
      operation: "eth_getLogs:tokenTransfers",
      context: {
        tokenAddress,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      },
      call: () =>
        robinhoodPublicClient.getLogs({
          address: tokenAddress,
          event: erc20TransferEvent,
          fromBlock,
          toBlock,
        }),
      isExpected: Array.isArray,
    });

    for (const log of logs) {
      const fromAddress = log.args.from;
      const toAddress = log.args.to;
      const value = log.args.value;
      if (
        log.blockNumber === null ||
        log.logIndex === null ||
        log.transactionHash === null ||
        !fromAddress ||
        !toAddress ||
        value === undefined
      ) {
        continue;
      }
      const id = `${robinhoodChain.id}:${log.transactionHash}:${log.logIndex}`;
      const inserted = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(tokenTransfers)
          .values({
            id,
            tokenAddress,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex,
            blockNumber: Number(log.blockNumber),
            fromAddress,
            toAddress,
            valueRaw: value.toString(),
          })
          .onConflictDoNothing({ target: tokenTransfers.id })
          .returning({ id: tokenTransfers.id });
        if (rows.length === 0) return false;
        await applyBalanceDelta(
          tx,
          tokenAddress,
          getAddress(fromAddress),
          -value,
        );
        await applyBalanceDelta(
          tx,
          tokenAddress,
          getAddress(toAddress),
          value,
        );
        return true;
      });
      changed ||= inserted;
    }

    fromBlock = toBlock + 1n;
    await db
      .update(holderIndexerCheckpoints)
      .set({ nextBlock: Number(fromBlock), updatedAt: new Date() })
      .where(eq(holderIndexerCheckpoints.tokenAddress, tokenAddress));
  }

  const existingStats = await db.query.tokenHolderStats.findFirst({
    where: eq(tokenHolderStats.tokenAddress, tokenAddress),
  });
  if (changed || !existingStats) {
    const snapshot = await db.query.tokenSnapshots.findFirst({
      where: eq(tokenSnapshots.tokenAddress, tokenAddress),
    });
    if (snapshot) {
      await rebuildHolderStats({
        tokenAddress,
        poolAddress: getAddress(input.poolAddress),
        totalSupplyRaw: BigInt(snapshot.totalSupplyRaw),
      });
    }
  }
}

import type { Api } from "grammy";
import { and, eq } from "drizzle-orm";
import { formatEther, getAddress, isAddressEqual, zeroAddress } from "viem";
import { ponsV1FactoryAbi, ponsV1LockerAbi } from "@/blockchain/pons-v1-abi";
import { robinhoodPublicClient } from "@/blockchain/public-client";
import { loggedRpcCall } from "@/blockchain/rpc-logging";
import { uniswapV3PoolReadAbi } from "@/blockchain/uniswap-v3-abi";
import {
  launchTradingKeyboard,
  tokenReportKeyboard,
} from "@/bot/launch-announcement";
import { env } from "@/config/env";
import { ponsV1 } from "@/config/pons";
import { db } from "@/db/client";
import {
  groupTokenIntelligence,
  launchSessions,
  tokenSnapshots,
  tokenHolderStats,
  tokenVolumeTotals,
} from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

const Q192 = 2n ** 192n;
const ONE_ETHER = 10n ** 18n;
const graduationMilestones = [25, 50, 75, 90, 100] as const;
const holderMilestones = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];
const volumeMilestonesEth = [1, 5, 10, 25, 50, 100, 250, 500, 1_000];

export type ActiveTokenSession = typeof launchSessions.$inferSelect & {
  tokenAddress: string;
  poolAddress: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function priceWethX18(sqrtPriceX96: bigint, isToken0: boolean): bigint {
  const squared = sqrtPriceX96 * sqrtPriceX96;
  if (squared === 0n) return 0n;
  return isToken0
    ? (squared * ONE_ETHER) / Q192
    : (Q192 * ONE_ETHER) / squared;
}

function currentMilestone(graduationBps: number): number {
  const percentage = graduationBps / 100;
  return [...graduationMilestones]
    .reverse()
    .find((milestone) => percentage >= milestone) ?? 0;
}

function highestReachedMilestone(value: bigint, milestones: bigint[]): bigint {
  return [...milestones]
    .reverse()
    .find((candidate) => value >= candidate) ?? 0n;
}

function tokenReportUrl(tokenAddress: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/token/${getAddress(tokenAddress)}`;
}

export async function activeTokenSession(
  groupId: string,
): Promise<ActiveTokenSession | null> {
  const session = await db.query.launchSessions.findFirst({
    where: and(
      eq(launchSessions.groupId, groupId),
      eq(launchSessions.status, "ACTIVE"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  if (!session || !session.tokenAddress || !session.poolAddress) {
    return null;
  }
  return session as ActiveTokenSession;
}

export async function refreshTokenSnapshot(input: {
  session: ActiveTokenSession;
  sqrtPriceX96?: bigint;
}) {
  const tokenAddress = getAddress(input.session.tokenAddress);
  const poolAddress = getAddress(input.session.poolAddress);
  const existing = await db.query.tokenSnapshots.findFirst({
    where: eq(tokenSnapshots.tokenAddress, tokenAddress),
  });

  const graduation = await loggedRpcCall({
    operation: "eth_call:graduationStatus",
    context: { tokenAddress, groupId: input.session.groupId },
    call: () =>
      robinhoodPublicClient.readContract({
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "graduationStatus",
        args: [tokenAddress],
      }),
    isExpected: (value) => value[1] > 0n,
  });

  let totalSupplyRaw = existing ? BigInt(existing.totalSupplyRaw) : 0n;
  let isToken0 = tokenAddress.toLowerCase() < ponsV1.weth.toLowerCase();
  if (!existing) {
    const launched = await loggedRpcCall({
      operation: "eth_call:getLaunchedToken",
      context: { tokenAddress, groupId: input.session.groupId },
      call: () =>
        robinhoodPublicClient.readContract({
          address: ponsV1.factory,
          abi: ponsV1FactoryAbi,
          functionName: "getLaunchedToken",
          args: [tokenAddress],
        }),
      isExpected: (value) => value.exists && value.supply > 0n,
    });
    totalSupplyRaw = launched.supply;
    isToken0 = launched.isToken0;
  }

  let sqrtPriceX96 = input.sqrtPriceX96;
  if (sqrtPriceX96 === undefined) {
    const slot0 = await loggedRpcCall({
      operation: "eth_call:slot0",
      context: { tokenAddress, poolAddress },
      call: () =>
        robinhoodPublicClient.readContract({
          address: poolAddress,
          abi: uniswapV3PoolReadAbi,
          functionName: "slot0",
        }),
      isExpected: (value) => value[0] > 0n,
    });
    sqrtPriceX96 = slot0[0];
  }

  const price = priceWethX18(sqrtPriceX96, isToken0);
  const marketCapWethWei = (price * totalSupplyRaw) / ONE_ETHER;
  const [pairedPrincipal, threshold, graduated] = graduation;
  const graduationBps =
    threshold > 0n
      ? Number(
          ((pairedPrincipal * 10_000n) / threshold) > 10_000n
            ? 10_000n
            : (pairedPrincipal * 10_000n) / threshold,
        )
      : 0;

  const values = {
    tokenAddress,
    poolAddress,
    sqrtPriceX96: sqrtPriceX96.toString(),
    priceWethX18: price.toString(),
    marketCapWethWei: marketCapWethWei.toString(),
    pairedPrincipalWei: pairedPrincipal.toString(),
    graduationThresholdWei: threshold.toString(),
    graduationBps,
    graduated,
    totalSupplyRaw: totalSupplyRaw.toString(),
    updatedAt: new Date(),
  };
  await db
    .insert(tokenSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: tokenSnapshots.tokenAddress,
      set: values,
    });
  return values;
}

function formatPrice(value: bigint): string {
  const numeric = Number(formatEther(value));
  if (numeric === 0) return "0";
  return numeric < 0.000001
    ? numeric.toExponential(4)
    : numeric.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

async function renderStatsFromSnapshot(session: ActiveTokenSession): Promise<string> {
  const [snapshot, volume, holders] = await Promise.all([
    db.query.tokenSnapshots.findFirst({
      where: eq(tokenSnapshots.tokenAddress, session.tokenAddress),
    }),
    db.query.tokenVolumeTotals.findFirst({
      where: eq(tokenVolumeTotals.tokenAddress, session.tokenAddress),
    }),
    db.query.tokenHolderStats.findFirst({
      where: eq(tokenHolderStats.tokenAddress, session.tokenAddress),
    }),
  ]);
  if (!snapshot) throw new Error("TOKEN_SNAPSHOT_NOT_AVAILABLE");
  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  const tokenUrl = `${ponsV1.explorerUrl}/address/${session.tokenAddress}`;
  const progress = (snapshot.graduationBps / 100).toFixed(2);

  return [
    `📡 <b>${escapeHtml(draft.symbol)} LIVE TERMINAL</b>`,
    "",
    `Price: ${formatPrice(BigInt(snapshot.priceWethX18))} WETH`,
    `Market cap: ${Number(formatEther(BigInt(snapshot.marketCapWethWei))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`,
    `Volume since launch: ${Number(formatEther(BigInt(volume?.grossVolumeWei ?? "0"))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`,
    `Net flow: ${Number(formatEther(BigInt(volume?.netFlowWei ?? "0"))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`,
    `Trades: ${(volume?.tradeCount ?? 0).toLocaleString("en-US")}`,
    `Holders: ${holders ? holders.adjustedHolderCount.toLocaleString("en-US") : "INDEXING"}`,
    `Top 10 concentration: ${holders ? `${(holders.top10Bps / 100).toFixed(2)}%` : "INDEXING"}`,
    "",
    `Graduation: ${snapshot.graduated ? "✅ GRADUATED" : `${progress}%`}`,
    `Paired principal: ${Number(formatEther(BigInt(snapshot.pairedPrincipalWei))).toFixed(4)} ETH`,
    `Threshold: ${Number(formatEther(BigInt(snapshot.graduationThresholdWei))).toFixed(4)} ETH`,
    "",
    `Contract: <a href="${tokenUrl}">${escapeHtml(shortAddress(session.tokenAddress))}</a>`,
    `Updated: ${snapshot.updatedAt.toISOString()}`,
    "",
    "<i>Graduation is a liquidity threshold, not a quality or safety rating.</i>",
  ].join("\n");
}

export async function renderHolderIntelligence(groupId: string): Promise<string> {
  const session = await activeTokenSession(groupId);
  if (!session) throw new Error("ACTIVE_TOKEN_NOT_FOUND");
  const stats = await db.query.tokenHolderStats.findFirst({
    where: eq(tokenHolderStats.tokenAddress, session.tokenAddress),
  });
  if (!stats) {
    return "👥 Holder balances are still being indexed. Try /holders again shortly.";
  }
  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  const largest = stats.largestHolderAddress;
  return [
    `👥 <b>${escapeHtml(draft.symbol)} HOLDERS</b>`,
    "",
    `Adjusted holders: ${stats.adjustedHolderCount.toLocaleString("en-US")}`,
    `Top 10 concentration: ${(stats.top10Bps / 100).toFixed(2)}%`,
    largest
      ? `Largest community wallet: <a href="${ponsV1.explorerUrl}/address/${largest}">${escapeHtml(shortAddress(largest))}</a> — ${(stats.largestHolderBps / 100).toFixed(2)}%`
      : "Largest community wallet: unavailable",
    "",
    "Pool, zero, factory, locker, router, and position-manager addresses are excluded.",
  ].join("\n");
}

export async function renderLiveStats(groupId: string): Promise<{
  text: string;
  tokenAddress: string;
}> {
  const session = await activeTokenSession(groupId);
  if (!session) throw new Error("ACTIVE_TOKEN_NOT_FOUND");
  await refreshTokenSnapshot({ session });
  return {
    text: await renderStatsFromSnapshot(session),
    tokenAddress: session.tokenAddress,
  };
}

export async function ensureLiveDashboard(api: Api, groupId: string) {
  const stats = await renderLiveStats(groupId);
  await db
    .insert(groupTokenIntelligence)
    .values({ groupId })
    .onConflictDoNothing({ target: groupTokenIntelligence.groupId });
  const settings = await db.query.groupTokenIntelligence.findFirst({
    where: eq(groupTokenIntelligence.groupId, groupId),
  });

  if (settings?.dashboardMessageId) {
    await api.editMessageText(
      Number(groupId),
      Number(settings.dashboardMessageId),
      stats.text,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: launchTradingKeyboard(stats.tokenAddress),
      },
    );
    await db
      .update(groupTokenIntelligence)
      .set({
        dashboardEnabled: true,
        dashboardUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(groupTokenIntelligence.groupId, groupId));
    return Number(settings.dashboardMessageId);
  }

  const message = await api.sendMessage(Number(groupId), stats.text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: launchTradingKeyboard(stats.tokenAddress),
  });
  await db
    .update(groupTokenIntelligence)
    .set({
      dashboardEnabled: true,
      dashboardMessageId: String(message.message_id),
      dashboardUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(groupTokenIntelligence.groupId, groupId));
  try {
    await api.pinChatMessage(Number(groupId), message.message_id, {
      disable_notification: true,
    });
  } catch (error) {
    console.error("Could not pin live dashboard", { groupId, error });
  }
  return message.message_id;
}

export async function updateIntelligenceAfterSwap(input: {
  api: Api;
  sessions: ActiveTokenSession[];
  sqrtPriceX96: bigint;
}): Promise<void> {
  const first = input.sessions[0];
  if (!first) return;
  const snapshot = await refreshTokenSnapshot({
    session: first,
    sqrtPriceX96: input.sqrtPriceX96,
  });
  const milestone = currentMilestone(snapshot.graduationBps);
  const volume = await db.query.tokenVolumeTotals.findFirst({
    where: eq(tokenVolumeTotals.tokenAddress, first.tokenAddress),
  });
  const holders = await db.query.tokenHolderStats.findFirst({
    where: eq(tokenHolderStats.tokenAddress, first.tokenAddress),
  });

  for (const session of input.sessions) {
    await db
      .insert(groupTokenIntelligence)
      .values({ groupId: session.groupId })
      .onConflictDoNothing({ target: groupTokenIntelligence.groupId });
    const settings = await db.query.groupTokenIntelligence.findFirst({
      where: eq(groupTokenIntelligence.groupId, session.groupId),
    });
    if (!settings) continue;

    if (settings.milestonesEnabled) {
      const holderMilestone = Number(
        highestReachedMilestone(
          BigInt(holders?.adjustedHolderCount ?? 0),
          holderMilestones.map(BigInt),
        ),
      );
      const volumeMilestone = highestReachedMilestone(
        BigInt(volume?.grossVolumeWei ?? "0"),
        volumeMilestonesEth.map((value) => BigInt(value) * ONE_ETHER),
      );
      const holderReached = holderMilestone > settings.lastHolderMilestone;
      const volumeReached =
        volumeMilestone > BigInt(settings.lastVolumeMilestoneWei);

      if (holderReached || volumeReached) {
        const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
        const lines = [
          `🎉 <b>${escapeHtml(draft.symbol)} COMMUNITY MILESTONE</b>`,
          "",
          holderReached
            ? `Holders reached ${holderMilestone.toLocaleString("en-US")}.`
            : null,
          volumeReached
            ? `Volume reached ${Number(formatEther(volumeMilestone)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH.`
            : null,
          "",
          `Current holders: ${(holders?.adjustedHolderCount ?? 0).toLocaleString("en-US")}`,
          `Volume since launch: ${Number(formatEther(BigInt(volume?.grossVolumeWei ?? "0"))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`,
          `Graduation: ${(snapshot.graduationBps / 100).toFixed(2)}%`,
        ].filter((line): line is string => line !== null);
        await input.api.sendMessage(Number(session.groupId), lines.join("\n"), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: tokenReportKeyboard(
            session.tokenAddress,
            tokenReportUrl(session.tokenAddress),
          ),
        });
        await db
          .update(groupTokenIntelligence)
          .set({
            lastHolderMilestone: holderReached
              ? holderMilestone
              : settings.lastHolderMilestone,
            lastVolumeMilestoneWei: volumeReached
              ? volumeMilestone.toString()
              : settings.lastVolumeMilestoneWei,
            updatedAt: new Date(),
          })
          .where(eq(groupTokenIntelligence.groupId, session.groupId));
      }
    }

    if (
      settings.volumeAlertThresholdWei &&
      !settings.volumeAlertTriggeredAt &&
      BigInt(volume?.grossVolumeWei ?? "0") >=
        BigInt(settings.volumeAlertThresholdWei)
    ) {
      const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
      await input.api.sendMessage(
        Number(session.groupId),
        [
          `🔔 <b>${escapeHtml(draft.symbol)} VOLUME ALERT</b>`,
          "",
          `Volume crossed ${Number(formatEther(BigInt(settings.volumeAlertThresholdWei))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH.`,
          `Current volume: ${Number(formatEther(BigInt(volume?.grossVolumeWei ?? "0"))).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: launchTradingKeyboard(session.tokenAddress),
        },
      );
      await db
        .update(groupTokenIntelligence)
        .set({ volumeAlertTriggeredAt: new Date(), updatedAt: new Date() })
        .where(eq(groupTokenIntelligence.groupId, session.groupId));
    }

    if (
      settings.graduationAlertsEnabled &&
      milestone > settings.lastGraduationMilestone
    ) {
      const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
      await input.api.sendMessage(
        Number(session.groupId),
        [
          `🎓 <b>${escapeHtml(draft.symbol)} GRADUATION UPDATE</b>`,
          "",
          snapshot.graduated
            ? "Status: ✅ GRADUATED"
            : `Progress reached ${milestone}%`,
          `Paired principal: ${Number(formatEther(BigInt(snapshot.pairedPrincipalWei))).toFixed(4)} ETH`,
          `Threshold: ${Number(formatEther(BigInt(snapshot.graduationThresholdWei))).toFixed(4)} ETH`,
          "",
          "<i>Graduation is a liquidity threshold, not a quality rating.</i>",
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: launchTradingKeyboard(session.tokenAddress),
        },
      );
      await db
        .update(groupTokenIntelligence)
        .set({ lastGraduationMilestone: milestone, updatedAt: new Date() })
        .where(eq(groupTokenIntelligence.groupId, session.groupId));
    }

    const dashboardStale =
      !settings.dashboardUpdatedAt ||
      Date.now() - settings.dashboardUpdatedAt.getTime() >= 60_000;
    if (
      settings.dashboardEnabled &&
      settings.dashboardMessageId &&
      dashboardStale
    ) {
      try {
        await input.api.editMessageText(
          Number(session.groupId),
          Number(settings.dashboardMessageId),
          await renderStatsFromSnapshot(session),
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: launchTradingKeyboard(session.tokenAddress),
          },
        );
        await db
          .update(groupTokenIntelligence)
          .set({ dashboardUpdatedAt: new Date(), updatedAt: new Date() })
          .where(eq(groupTokenIntelligence.groupId, session.groupId));
      } catch (error) {
        console.error("Could not refresh live dashboard", {
          groupId: session.groupId,
          error,
        });
      }
    }
  }
}

export async function renderCreatorFeeConfiguration(groupId: string) {
  const session = await activeTokenSession(groupId);
  if (!session) throw new Error("ACTIVE_TOKEN_NOT_FOUND");
  const tokenAddress = getAddress(session.tokenAddress);
  const locker = await loggedRpcCall({
    operation: "eth_call:factoryLocker",
    context: { tokenAddress },
    call: () =>
      robinhoodPublicClient.readContract({
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "locker",
      }),
  });
  const [protocolShare, redirect] = await loggedRpcCall({
    operation: "eth_call:creatorFeeConfiguration",
    context: { tokenAddress, locker },
    call: () =>
      Promise.all([
        robinhoodPublicClient.readContract({
          address: locker,
          abi: ponsV1LockerAbi,
          functionName: "tokenProtocolFeeShares",
          args: [tokenAddress],
        }),
        robinhoodPublicClient.readContract({
          address: locker,
          abi: ponsV1LockerAbi,
          functionName: "feeRedirects",
          args: [tokenAddress],
        }),
      ]),
  });
  const payout = isAddressEqual(redirect, zeroAddress)
    ? getAddress(session.expectedDeployer)
    : redirect;
  const creatorShare = 100 - Number(protocolShare);
  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  return [
    `💰 <b>${escapeHtml(draft.symbol)} CREATOR FEE CONFIGURATION</b>`,
    "",
    `Creator share: ${creatorShare}%`,
    `Protocol share: ${Number(protocolShare)}%`,
    `Payout wallet: <a href="${ponsV1.explorerUrl}/address/${payout}">${escapeHtml(shortAddress(payout))}</a>`,
    "",
    "Claimable amounts are intentionally not estimated because the public integration surface does not expose a verified claimable getter.",
    "Open pons to review and claim creator rewards with the payout wallet.",
  ].join("\n");
}

export function contractGuardMessage(input: {
  officialToken: string;
  suppliedAddress: string;
}): string {
  const official = getAddress(input.officialToken);
  const supplied = getAddress(input.suppliedAddress);
  if (isAddressEqual(official, supplied)) {
    return [
      "✅ <b>OFFICIAL TOKEN CONTRACT</b>",
      "",
      `<a href="${ponsV1.explorerUrl}/address/${official}">${official}</a>`,
      "",
      "This address matches the token connected to this community.",
    ].join("\n");
  }
  return [
    "⚠️ <b>UNRECOGNIZED CONTRACT</b>",
    "",
    "The supplied address does not match this community's official token contract.",
    "",
    `Official: <a href="${ponsV1.explorerUrl}/address/${official}">${official}</a>`,
  ].join("\n");
}

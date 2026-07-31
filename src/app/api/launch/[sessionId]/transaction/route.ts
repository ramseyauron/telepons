import { Api } from "grammy";
import { and, eq } from "drizzle-orm";
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  parseEther,
  parseEventLogs,
} from "viem";
import { z } from "zod";
import {
  announceSuccessfulLaunch,
  launchAnnouncementCaption,
  launchAnnouncementKeyboard,
} from "@/bot/launch-announcement";
import { expireLaunchSessions } from "@/bot/session-expiration";
import { robinhoodChain } from "@/blockchain/chain";
import { ponsV1FactoryAbi } from "@/blockchain/pons-v1-abi";
import { rateLimitedHttp } from "@/blockchain/rate-limited-transport";
import { loggedRpcCall } from "@/blockchain/rpc-logging";
import { env } from "@/config/env";
import { ponsV1 } from "@/config/pons";
import { db } from "@/db/client";
import {
  buybotSettings,
  launchOrders,
  launchSessions,
  telegramGroups,
} from "@/db/schema";
import { runBuybotIndexer } from "@/indexer/buybot";
import { launchDraftSchema } from "@/launch/schema";

const requestSchema = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: rateLimitedHttp(
    env.ROBINHOOD_RPC_URL ?? ponsV1.publicRpcUrl,
    5,
  ),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const body = requestSchema.safeParse(await request.json());
  if (!body.success) {
    return Response.json({ error: "INVALID_TRANSACTION_HASH" }, { status: 400 });
  }

  const session = await db.query.launchSessions.findFirst({
    where: eq(launchSessions.id, sessionId),
  });
  if (
    session?.status === "READY" &&
    session.expiresAt.getTime() <= new Date().getTime()
  ) {
    if (env.TELEGRAM_BOT_TOKEN) {
      await expireLaunchSessions(new Api(env.TELEGRAM_BOT_TOKEN));
    }
    return Response.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  if (!session || !["READY", "TX_SUBMITTED"].includes(session.status)) {
    return Response.json({ error: "SESSION_NOT_READY" }, { status: 409 });
  }

  const transactionHash = body.data.transactionHash as `0x${string}`;

  try {
    const [transaction, receipt] = await loggedRpcCall({
      operation: "launchTransactionConfirmation",
      context: { sessionId, transactionHash },
      call: () =>
        Promise.all([
          publicClient.getTransaction({ hash: transactionHash }),
          publicClient.waitForTransactionReceipt({
            hash: transactionHash,
            confirmations: 1,
            timeout: 120_000,
          }),
        ]),
      isExpected: ([tx, txReceipt]) =>
        Boolean(tx.from && txReceipt.blockNumber >= 0n),
    });

    if (
      receipt.status !== "success" ||
      !transaction.to ||
      !isAddressEqual(transaction.from, getAddress(session.expectedDeployer)) ||
      !isAddressEqual(transaction.to, ponsV1.factory)
    ) {
      return Response.json(
        { error: "TRANSACTION_DOES_NOT_MATCH_SESSION" },
        { status: 422 },
      );
    }

    const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
    const decodedCall = decodeFunctionData({
      abi: ponsV1FactoryAbi,
      data: transaction.input,
    });
    if (decodedCall.functionName !== "launchToken") {
      return Response.json(
        { error: "TRANSACTION_CALLDATA_MISMATCH" },
        { status: 422 },
      );
    }

    const [tokenParams] = decodedCall.args;
    const launchFeeAtBlock = await loggedRpcCall({
      operation: "eth_call:launchFee",
      context: {
        sessionId,
        blockNumber: receipt.blockNumber.toString(),
      },
      call: () =>
        publicClient.readContract({
          address: ponsV1.factory,
          abi: ponsV1FactoryAbi,
          functionName: "launchFee",
          blockNumber: receipt.blockNumber,
        }),
      isExpected: (value) => value >= 0n,
    });
    const expectedValue =
      launchFeeAtBlock + parseEther(draft.developerBuyEth);
    const metadataMatches =
      tokenParams.name === draft.name &&
      tokenParams.symbol === draft.symbol &&
      tokenParams.logo === (draft.logoUrl ?? "") &&
      tokenParams.description === draft.description &&
      tokenParams.socials.twitter === (draft.twitter ?? "") &&
      tokenParams.socials.telegram === (draft.telegram ?? "") &&
      tokenParams.socials.website === (draft.website ?? "") &&
      isAddressEqual(
        tokenParams.feeWallet,
        getAddress(session.expectedDeployer),
      ) &&
      transaction.value === expectedValue;

    if (!metadataMatches) {
      return Response.json(
        { error: "TRANSACTION_METADATA_MISMATCH" },
        { status: 422 },
      );
    }

    const launchEvents = parseEventLogs({
      abi: ponsV1FactoryAbi,
      eventName: "TokenLaunched",
      logs: receipt.logs,
      strict: true,
    });
    const launchEvent = launchEvents.find((event) =>
      isAddressEqual(
        event.args.deployer,
        getAddress(session.expectedDeployer),
      ),
    );

    if (!launchEvent) {
      return Response.json(
        { error: "TOKEN_LAUNCHED_EVENT_NOT_FOUND" },
        { status: 422 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(launchSessions)
        .set({
          status: "ACTIVE",
          transactionHash,
          tokenAddress: launchEvent.args.token,
          poolAddress: launchEvent.args.pool,
          launchBlock: Number(receipt.blockNumber),
          consumedAt: new Date(),
        })
        .where(eq(launchSessions.id, session.id));
      await tx
        .update(telegramGroups)
        .set({ lifecycle: "ACTIVE" })
        .where(eq(telegramGroups.id, session.groupId));
      await tx
        .insert(buybotSettings)
        .values({ groupId: session.groupId, enabled: true })
        .onConflictDoUpdate({
          target: buybotSettings.groupId,
          set: { enabled: true },
        });
    });

    const order = await db.query.launchOrders.findFirst({
      where: and(
        eq(launchOrders.launchSessionId, session.id),
        eq(launchOrders.status, "CONFIRMED"),
      ),
    });
    const group = await db.query.telegramGroups.findFirst({
      where: eq(telegramGroups.id, session.groupId),
    });

    const api = env.TELEGRAM_BOT_TOKEN
      ? new Api(env.TELEGRAM_BOT_TOKEN)
      : null;

    if (
      order?.announcementMessageId &&
      api &&
      env.TELEGRAM_LAUNCH_CHANNEL
    ) {
      try {
        await api.editMessageCaption(
          env.TELEGRAM_LAUNCH_CHANNEL,
          Number(order.announcementMessageId),
          {
            caption: launchAnnouncementCaption({
              draft,
              status: "LAUNCHED",
              groupTitle: group?.title ?? "Community",
              tokenAddress: launchEvent.args.token,
            }),
            parse_mode: "HTML",
            reply_markup: launchAnnouncementKeyboard({
              draft,
              launchUrl: new URL(
                `/launch/${session.id}`,
                env.APP_BASE_URL,
              ).toString(),
              transactionUrl: `${ponsV1.explorerUrl}/tx/${transactionHash}`,
            }),
          },
        );
      } catch (error) {
        const announcementError =
          error instanceof Error ? error.message : "CHANNEL_EDIT_FAILED";
        console.error("Could not update launch announcement", error);
        await db
          .update(launchOrders)
          .set({ announcementError })
          .where(eq(launchOrders.id, order.id));
      }
    }

    if (api) {
      try {
        await announceSuccessfulLaunch({
          api,
          groupId: session.groupId,
          draft,
          telegramFileId: order?.telegramFileId,
          tokenAddress: launchEvent.args.token,
          poolAddress: launchEvent.args.pool,
          transactionHash,
        });
      } catch (error) {
        console.error("Could not announce successful launch to group", error);
      }

      try {
        await runBuybotIndexer(api);
      } catch (error) {
        console.error("Could not run immediate BuyBot activation cycle", error);
      }
    }

    return Response.json({
      status: "ACTIVE",
      tokenAddress: launchEvent.args.token,
      poolAddress: launchEvent.args.pool,
      transactionHash,
    });
  } catch (error) {
    console.error("Launch transaction verification failed", error);
    return Response.json(
      { error: "TRANSACTION_CONFIRMATION_PENDING" },
      { status: 202 },
    );
  }
}

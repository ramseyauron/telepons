import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { formatEther, parseEther } from "viem";
import { ZodError } from "zod";
import { downloadAndStoreTelegramLogo } from "@/assets/telegram-logo";
import {
  announceLaunchSession,
  isPublicHttpsUrl,
  launchAnnouncementCaption,
  launchTradingKeyboard,
} from "@/bot/launch-announcement";
import {
  backfillConfiguredGroupInstallations,
  getBotGroupCounts,
  recordBotMembershipChange,
  recordGroupChatMigration,
} from "@/bot/group-installations";
import { expireLaunchSessions } from "@/bot/session-expiration";
import {
  expirePendingVerifications,
  handleMemberVerificationStart,
  moderationMiddleware,
} from "@/bot/moderation";
import { requireChannelSubscriptions } from "@/bot/subscription";
import { handleGroupSetupConversation } from "@/bot/setup-conversation";
import {
  flushBuybotAggregates,
  rebuildVolumeTotalsFromSwaps,
  runBuybotIndexer,
} from "@/indexer/buybot";
import { env } from "@/config/env";
import { db } from "@/db/client";
import {
  launchOrders,
  launchConversations,
  launchSessions,
  telegramGroups,
  tokenAssets,
  buybotSettings,
  groupTokenIntelligence,
  groupModerationSettings,
  groupSetupConversations,
} from "@/db/schema";
import {
  getGroupTelegramUrl,
  getGroupOwnerUserId,
  isCurrentGroupOwner,
  isGroupContext,
} from "@/bot/authorization";
import {
  formatLaunchOrderPreview,
  parseLaunchOrderCaption,
} from "@/launch/parse-order";
import { extractLaunchDraftWithLlm } from "@/launch/llm-extractor";
import {
  canUseTokenDraftLlm,
  looksLikeTokenDetails,
} from "@/launch/llm-policy";
import { launchDraftSchema } from "@/launch/schema";
import {
  applyLaunchConversationAnswer,
  completeConversationDraft,
  launchConversationPrompt,
} from "@/launch/conversation";
import {
  activeTokenSession,
  contractGuardMessage,
  ensureLiveDashboard,
  renderCreatorFeeConfiguration,
  renderHolderIntelligence,
  renderLiveStats,
} from "@/intelligence/token-intelligence";
import {
  initializeTrending,
  isTrendingPeriod,
  renderTrending,
  trendingKeyboard,
} from "@/trending";

if (!env.TELEGRAM_BOT_TOKEN) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN is not configured. Copy .env.example to .env.local and use a newly rotated token.",
  );
}

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
bot.use(moderationMiddleware);

function launchSessionKeyboard(launchUrl: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (isPublicHttpsUrl(launchUrl)) {
    keyboard.url("Open launch terminal", launchUrl).row();
  }
  return keyboard.copyText("Copy session link", launchUrl);
}

bot.command("start", async (ctx) => {
  if (await handleMemberVerificationStart(ctx)) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  await ctx.reply(
    "Telepons is active. Add the bot as a group administrator, then run /setup.",
  );
});

bot.on("message:migrate_to_chat_id", async (ctx) => {
  await recordGroupChatMigration(ctx);
  const counts = await getBotGroupCounts();
  console.log(
    `Telepons group installations: ${counts.active} active, ${counts.total} total`,
  );
  await initializeTrending();
});

bot.on("my_chat_member", async (ctx) => {
  await recordBotMembershipChange(ctx);
  const counts = await getBotGroupCounts();
  console.log(
    `Telepons group installations: ${counts.active} active, ${counts.total} total`,
  );
});

// Explicit registration makes grammY request chat_member updates from
// Telegram. The moderation middleware processes the update before this
// terminal handler is reached.
bot.on("chat_member", async () => undefined);

bot.command("setup", async (ctx) => {
  if (!isGroupContext(ctx)) {
    await ctx.reply("Run /setup inside your token community group.");
    return;
  }
  if (!(await requireChannelSubscriptions(ctx))) return;

  const ownerUserId = await getGroupOwnerUserId(ctx);
  if (!ownerUserId || !ctx.from || ownerUserId !== String(ctx.from.id)) {
    await ctx.reply("Only the group owner can configure Telepons.");
    return;
  }

  const botMember = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
  const canManageMembers =
    botMember.status === "creator" ||
    (botMember.status === "administrator" && botMember.can_restrict_members);

  if (!canManageMembers) {
    await ctx.reply(
      [
        "Telepons needs additional administrator permissions before setup can continue.",
        "",
        "Enable the Restrict Members permission for Telepons, then run /setup again.",
      ].join("\n"),
    );
    return;
  }

  try {
    await ctx.api.setChatPermissions(
      ctx.chat.id,
      {
        can_send_messages: true,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false,
      },
      { use_independent_chat_permissions: true },
    );
  } catch (error) {
    console.error("Could not configure group member permissions", {
      groupId: String(ctx.chat.id),
      error,
    });
    await ctx.reply(
      [
        "Telepons could not configure the group permissions.",
        "",
        "Confirm that the bot is an administrator with Restrict Members enabled, then run /setup again.",
      ].join("\n"),
    );
    return;
  }

  await db
    .insert(telegramGroups)
    .values({
      id: String(ctx.chat.id),
      title:
        "title" in ctx.chat
          ? (ctx.chat.title ?? "Telegram group")
          : "Telegram group",
      ownerUserId,
      lifecycle: "UNCONFIGURED",
    })
    .onConflictDoUpdate({
      target: telegramGroups.id,
      set: {
        title:
          "title" in ctx.chat
            ? (ctx.chat.title ?? "Telegram group")
            : "Telegram group",
        ownerUserId,
      },
    });

  await db
    .insert(groupSetupConversations)
    .values({
      groupId: String(ctx.chat.id),
      ownerUserId,
      step: "GROUP_DESCRIPTION",
      groupDescription: null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1_000),
    })
    .onConflictDoUpdate({
      target: groupSetupConversations.groupId,
      set: {
        ownerUserId,
        step: "GROUP_DESCRIPTION",
        groupDescription: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1_000),
        updatedAt: new Date(),
      },
    });

  await ctx.reply(
    [
      "Group permissions configured.",
      "",
      "Default member permissions: text messages only.",
      "",
      "Now describe this group in 10–1,000 characters.",
      "Mention its purpose and the kind of community you want to build.",
    ].join("\n"),
  );
});

bot.command("launch", async (ctx) => {
  if (!isGroupContext(ctx)) {
    await ctx.reply("Run /launch inside the configured community group.");
    return;
  }
  if (!(await requireChannelSubscriptions(ctx))) return;

  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can start a token launch.");
    return;
  }

  const publicGroupTelegramUrl = await getGroupTelegramUrl(ctx);
  if (!publicGroupTelegramUrl) {
    await ctx.reply(
      [
        "The community group must be public before launching a token.",
        "",
        "Set a public username for this group in Telegram settings, then run /launch again.",
        "Private invite links are not accepted.",
      ].join("\n"),
    );
    return;
  }

  if (!ctx.from) {
    return;
  }

  const groupId = String(ctx.chat.id);
  const group = await db.query.telegramGroups.findFirst({
    where: eq(telegramGroups.id, groupId),
  });

  if (!group) {
    await ctx.reply("Run /setup before starting a launch.");
    return;
  }

  if (group.lifecycle === "ACTIVE") {
    await ctx.reply(
      "This group has already launched its token. The token-detail assistant is disabled.",
    );
    return;
  }

  if (group.activeLaunchSessionId) {
    const existingSession = await db.query.launchSessions.findFirst({
      where: eq(launchSessions.id, group.activeLaunchSessionId),
    });

    if (
      existingSession?.status === "READY" &&
      existingSession.expiresAt.getTime() > Date.now()
    ) {
      const existingDraft = launchDraftSchema.parse(
        JSON.parse(existingSession.draftJson),
      );
      const remainingSeconds = Math.max(
        1,
        Math.ceil(
          (existingSession.expiresAt.getTime() - Date.now()) / 1_000,
        ),
      );
      const keyboard = new InlineKeyboard()
        .text(
          "Continue existing session",
          `continue_session:${existingSession.id}`,
        )
        .row()
        .text(
          "Change token details",
          `edit_session:${existingSession.id}`,
        );

      await ctx.reply(
        [
          "An active launch session already exists.",
          "",
          `Token: ${existingDraft.name} ($${existingDraft.symbol})`,
          `Time remaining: ${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`,
          "",
          "Continue with this session or replace its token details and logo.",
        ].join("\n"),
        { reply_markup: keyboard },
      );
      return;
    }

    if (existingSession?.status === "READY") {
      await expireLaunchSessions(ctx.api);
      await db
        .update(launchSessions)
        .set({ status: "EXPIRED" })
        .where(eq(launchSessions.id, existingSession.id));
      await db
        .update(launchOrders)
        .set({ status: "EXPIRED" })
        .where(eq(launchOrders.launchSessionId, existingSession.id));
    }

    await db
      .update(telegramGroups)
      .set({ activeLaunchSessionId: null })
      .where(eq(telegramGroups.id, groupId));
  }

  await db
    .update(telegramGroups)
    .set({
      lifecycle: "DRAFTING",
      activeLaunchSessionId: null,
    })
    .where(eq(telegramGroups.id, groupId));

  const suppliedDetails = ctx.match.trim();
  const conversationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

  if (suppliedDetails) {
    try {
      const groupTelegramUrl = publicGroupTelegramUrl;

      const extractedDraft = env.OPENAI_API_KEY
        ? await extractLaunchDraftWithLlm({
            ownerMessage: suppliedDetails,
            logoUrl: "https://placeholder.invalid/logo",
            groupTelegramUrl,
          })
        : parseLaunchOrderCaption(
            suppliedDetails,
            "https://placeholder.invalid/logo",
            groupTelegramUrl,
          );

      await db
        .insert(launchConversations)
        .values({
          groupId,
          ownerUserId: String(ctx.from.id),
          step: "AWAITING_LOGO",
          detailsJson: JSON.stringify(extractedDraft),
          expiresAt: conversationExpiresAt,
        })
        .onConflictDoUpdate({
          target: launchConversations.groupId,
          set: {
            ownerUserId: String(ctx.from.id),
            step: "AWAITING_LOGO",
            detailsJson: JSON.stringify(extractedDraft),
            expiresAt: conversationExpiresAt,
            updatedAt: new Date(),
          },
        });

      await ctx.reply(
        [
          "Token details processed.",
          "",
          `Name: ${extractedDraft.name}`,
          `Symbol: ${extractedDraft.symbol}`,
          `Deployer: ${extractedDraft.deployerAddress}`,
          `Developer buy: ${extractedDraft.developerBuyEth} ETH`,
          "",
          launchConversationPrompt("AWAITING_LOGO"),
        ].join("\n"),
      );
    } catch (error) {
      console.error("Could not process /launch details", error);
      await ctx.reply(
        "The supplied token details are incomplete or invalid. Send `/launch` without details to use the guided setup.",
      );
    }
    return;
  }

  await db
    .insert(launchConversations)
    .values({
      groupId,
      ownerUserId: String(ctx.from.id),
      step: "NAME",
      detailsJson: "{}",
      expiresAt: conversationExpiresAt,
    })
    .onConflictDoUpdate({
      target: launchConversations.groupId,
      set: {
        ownerUserId: String(ctx.from.id),
        step: "NAME",
        detailsJson: "{}",
        expiresAt: conversationExpiresAt,
        updatedAt: new Date(),
      },
    });

  await ctx.reply(
    [
      "Guided token setup started.",
      "",
      launchConversationPrompt("NAME"),
    ].join("\n"),
  );
});

bot.command("buybot", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) {
    return;
  }
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can configure BuyBot.");
    return;
  }

  const groupId = String(ctx.chat.id);
  await db
    .insert(buybotSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: buybotSettings.groupId });

  const input = ctx.match.trim().toLowerCase();
  if (input === "topic current") {
    const topicId = ctx.message?.message_thread_id;
    if (!topicId) {
      await ctx.reply(
        "Run /buybot topic current inside the forum topic that should receive buy notifications.",
      );
      return;
    }
    await db
      .update(buybotSettings)
      .set({ topicId })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply("BuyBot notifications will be sent to this topic.");
    return;
  }

  if (input === "topic reset") {
    await db
      .update(buybotSettings)
      .set({ topicId: null })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply("BuyBot topic routing was reset to the main group chat.");
    return;
  }

  if (input === "mode realtime" || input === "mode aggregate") {
    const notificationMode = input.endsWith("aggregate")
      ? "AGGREGATE"
      : "REALTIME";
    await db
      .update(buybotSettings)
      .set({ notificationMode })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply(
      notificationMode === "AGGREGATE"
        ? "BuyBot will combine qualifying buys into activity summaries."
        : "BuyBot will publish each qualifying buy in real time.",
    );
    return;
  }

  if (input.startsWith("window ")) {
    const seconds = Number(input.slice("window ".length));
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 300) {
      await ctx.reply("The aggregation window must be between 30 and 300 seconds.");
      return;
    }
    await db
      .update(buybotSettings)
      .set({ aggregateWindowSeconds: seconds })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply(`BuyBot aggregation window updated to ${seconds} seconds.`);
    return;
  }
  if (input === "image") {
    await db
      .update(buybotSettings)
      .set({ awaitingCustomImage: true })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply(
      "Send the new BuyBot image now. Upload it as a photo or PNG/JPEG/WebP document.",
    );
    return;
  }

  if (input === "image reset") {
    await db
      .update(buybotSettings)
      .set({
        customImageTelegramFileId: null,
        customImageStorageKey: null,
        customImagePublicUrl: null,
        customImagePinataFileId: null,
        customImageCid: null,
        awaitingCustomImage: false,
      })
      .where(eq(buybotSettings.groupId, groupId));
    await ctx.reply(
      "The custom BuyBot image was removed. BuyBot will use the token logo.",
    );
    return;
  }

  if (input === "on" || input === "off") {
    await db
      .update(buybotSettings)
      .set({ enabled: input === "on" })
      .where(eq(buybotSettings.groupId, groupId));
  } else if (input) {
    try {
      const minimumBuyWei = parseEther(input);
      if (minimumBuyWei < 0n) throw new Error("NEGATIVE_THRESHOLD");
      await db
        .update(buybotSettings)
        .set({ minimumBuyWei: minimumBuyWei.toString() })
        .where(eq(buybotSettings.groupId, groupId));
    } catch {
      await ctx.reply(
        "Use /buybot, /buybot on, /buybot off, or /buybot 0.05 to set the minimum displayed buy in ETH.",
      );
      return;
    }
  }

  const settings = await db.query.buybotSettings.findFirst({
    where: eq(buybotSettings.groupId, groupId),
  });
  if (!settings) return;

  await ctx.reply(
    [
      "BuyBot settings",
      "",
      `Status: ${settings.enabled ? "ACTIVE" : "PAUSED"}`,
      `Minimum displayed buy: ${formatEther(BigInt(settings.minimumBuyWei))} ETH`,
      `Image: ${settings.customImageTelegramFileId ? "CUSTOM" : "TOKEN LOGO"}`,
      `Mode: ${settings.notificationMode}`,
      `Aggregation window: ${settings.aggregateWindowSeconds} seconds`,
      "",
      "Commands:",
      "/buybot on",
      "/buybot off",
      "/buybot 0.05",
      "/buybot image",
      "/buybot image reset",
      "/buybot topic current",
      "/buybot topic reset",
      "/buybot mode realtime",
      "/buybot mode aggregate",
      "/buybot window 60",
      `Topic routing: ${settings.topicId ? `TOPIC ${settings.topicId}` : "MAIN CHAT"}`,
    ].join("\n"),
  );
});

bot.command("stats", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  try {
    const stats = await renderLiveStats(String(ctx.chat.id));
    await ctx.reply(stats.text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: launchTradingKeyboard(stats.tokenAddress),
    });
  } catch (error) {
    console.error("Could not render token stats", error);
    await ctx.reply("Live token stats are not available for this group yet.");
  }
});

bot.command("graduation", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  try {
    const stats = await renderLiveStats(String(ctx.chat.id));
    await ctx.reply(stats.text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: launchTradingKeyboard(stats.tokenAddress),
    });
  } catch (error) {
    console.error("Could not render graduation status", error);
    await ctx.reply("Graduation data is not available for this group yet.");
  }
});

bot.command("holders", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  try {
    await ctx.reply(await renderHolderIntelligence(String(ctx.chat.id)), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error("Could not render holder intelligence", error);
    await ctx.reply("Holder intelligence is not available for this group yet.");
  }
});

bot.command("dashboard", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can configure the live dashboard.");
    return;
  }
  const groupId = String(ctx.chat.id);
  const input = ctx.match.trim().toLowerCase();
  await db
    .insert(groupTokenIntelligence)
    .values({ groupId })
    .onConflictDoNothing({ target: groupTokenIntelligence.groupId });

  if (input === "off") {
    await db
      .update(groupTokenIntelligence)
      .set({ dashboardEnabled: false, updatedAt: new Date() })
      .where(eq(groupTokenIntelligence.groupId, groupId));
    await ctx.reply("Automatic live-dashboard updates are paused.");
    return;
  }
  if (input && input !== "on" && input !== "refresh") {
    await ctx.reply("Use /dashboard, /dashboard on, /dashboard off, or /dashboard refresh.");
    return;
  }

  try {
    await db
      .update(groupTokenIntelligence)
      .set({ dashboardEnabled: true, updatedAt: new Date() })
      .where(eq(groupTokenIntelligence.groupId, groupId));
    await ensureLiveDashboard(ctx.api, groupId);
    await ctx.reply("The pinned live dashboard is active.");
  } catch (error) {
    console.error("Could not configure live dashboard", error);
    await ctx.reply(
      "The dashboard could not be created. Confirm that a token is active and Telepons can pin messages.",
    );
  }
});

bot.command("alerts", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can configure group alerts.");
    return;
  }
  const groupId = String(ctx.chat.id);
  await db
    .insert(groupTokenIntelligence)
    .values({ groupId })
    .onConflictDoNothing({ target: groupTokenIntelligence.groupId });
  const input = ctx.match.trim().toLowerCase();

  if (input === "graduation on" || input === "graduation off") {
    await db
      .update(groupTokenIntelligence)
      .set({
        graduationAlertsEnabled: input.endsWith("on"),
        updatedAt: new Date(),
      })
      .where(eq(groupTokenIntelligence.groupId, groupId));
  } else if (input === "volume off") {
    await db
      .update(groupTokenIntelligence)
      .set({
        volumeAlertThresholdWei: null,
        volumeAlertTriggeredAt: null,
        updatedAt: new Date(),
      })
      .where(eq(groupTokenIntelligence.groupId, groupId));
  } else if (input.startsWith("volume ")) {
    try {
      const threshold = parseEther(input.slice("volume ".length));
      if (threshold <= 0n) throw new Error("INVALID_VOLUME_ALERT");
      await db
        .update(groupTokenIntelligence)
        .set({
          volumeAlertThresholdWei: threshold.toString(),
          volumeAlertTriggeredAt: null,
          updatedAt: new Date(),
        })
        .where(eq(groupTokenIntelligence.groupId, groupId));
    } catch {
      await ctx.reply("Use /alerts volume 10 with a positive ETH amount.");
      return;
    }
  } else if (input) {
    await ctx.reply(
      "Use /alerts, /alerts graduation on, /alerts graduation off, /alerts volume 10, or /alerts volume off.",
    );
    return;
  }

  const settings = await db.query.groupTokenIntelligence.findFirst({
    where: eq(groupTokenIntelligence.groupId, groupId),
  });
  if (!settings) return;
  await ctx.reply(
    [
      "Telepons group alerts",
      "",
      `Graduation milestones: ${settings.graduationAlertsEnabled ? "ON" : "OFF"}`,
      `Volume target: ${settings.volumeAlertThresholdWei ? `${formatEther(BigInt(settings.volumeAlertThresholdWei))} ETH${settings.volumeAlertTriggeredAt ? " (TRIGGERED)" : ""}` : "OFF"}`,
      "",
      "/alerts graduation on",
      "/alerts graduation off",
      "/alerts volume 10",
      "/alerts volume off",
    ].join("\n"),
  );
});

bot.command("contract", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  const session = await activeTokenSession(String(ctx.chat.id));
  if (!session) {
    await ctx.reply("No active Telepons token is connected to this group.");
    return;
  }
  await ctx.reply(
    contractGuardMessage({
      officialToken: session.tokenAddress,
      suppliedAddress: session.tokenAddress,
    }),
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
  );
});

bot.command("fees", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  try {
    await ctx.reply(
      await renderCreatorFeeConfiguration(String(ctx.chat.id)),
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      },
    );
  } catch (error) {
    console.error("Could not read creator fee configuration", error);
    await ctx.reply("Creator fee configuration is currently unavailable.");
  }
});

bot.command("trending", async (ctx) => {
  if (!(await requireChannelSubscriptions(ctx))) return;
  const requestedPeriod = ctx.match.trim().toLowerCase();
  const period = isTrendingPeriod(requestedPeriod) ? requestedPeriod : "24h";
  await ctx.reply(await renderTrending(period), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: env.TRENDING_ENABLED
      ? trendingKeyboard(period)
      : undefined,
  });
});

bot.command("moderation", async (ctx) => {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return;
  if (!(await requireChannelSubscriptions(ctx))) return;
  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can configure moderation.");
    return;
  }

  const groupId = String(ctx.chat.id);
  await db
    .insert(groupModerationSettings)
    .values({ groupId })
    .onConflictDoNothing({ target: groupModerationSettings.groupId });

  const input = ctx.match.trim().toLowerCase();
  if (input === "on" || input === "off") {
    const enabled = input === "on";
    await db
      .update(groupModerationSettings)
      .set({
        welcomeEnabled: enabled,
        verificationEnabled: enabled,
        antiFloodEnabled: enabled,
        updatedAt: new Date(),
      })
      .where(eq(groupModerationSettings.groupId, groupId));
  } else if (input) {
    await ctx.reply("Use /moderation, /moderation on, or /moderation off.");
    return;
  }

  const settings = await db.query.groupModerationSettings.findFirst({
    where: eq(groupModerationSettings.groupId, groupId),
  });
  if (!settings) return;

  await ctx.reply(
    [
      "Telepons moderation",
      "",
      `Welcome messages: ${settings.welcomeEnabled ? "ON" : "OFF"}`,
      `Human verification: ${settings.verificationEnabled ? "ON" : "OFF"}`,
      `Anti-flood: ${settings.antiFloodEnabled ? "ON" : "OFF"}`,
      `Flood threshold: ${settings.floodMaxMessages} messages / ${settings.floodWindowSeconds} seconds`,
      `Flood mute: ${settings.muteSeconds} seconds`,
      "",
      "/moderation on",
      "/moderation off",
    ].join("\n"),
  );
});

async function handleBuybotCustomImage(
  ctx: Context,
  telegramFileId: string,
): Promise<boolean> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) return false;

  const groupId = String(ctx.chat.id);
  const settings = await db.query.buybotSettings.findFirst({
    where: eq(buybotSettings.groupId, groupId),
  });
  if (!settings?.awaitingCustomImage) return false;

  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.reply("Only the group owner can replace the BuyBot image.");
    return true;
  }
  if (!(await requireChannelSubscriptions(ctx))) return true;

  try {
    const activeSession = await db.query.launchSessions.findFirst({
      where: and(
        eq(launchSessions.groupId, groupId),
        eq(launchSessions.status, "ACTIVE"),
      ),
    });
    const tokenSymbol = activeSession
      ? launchDraftSchema.parse(JSON.parse(activeSession.draftJson)).symbol
      : "TELEPONS";

    const telegramFile = await ctx.api.getFile(telegramFileId);
    if (!telegramFile.file_path) {
      throw new Error("TELEGRAM_FILE_PATH_MISSING");
    }
    const storedImage = await downloadAndStoreTelegramLogo({
      botToken: env.TELEGRAM_BOT_TOKEN!,
      telegramFilePath: telegramFile.file_path,
      storageNamespace: `buybot-${groupId}`,
      tokenSymbol,
    });

    await db
      .update(buybotSettings)
      .set({
        customImageTelegramFileId: telegramFileId,
        customImageStorageKey: storedImage.storageKey,
        customImagePublicUrl: storedImage.publicUrl,
        customImagePinataFileId: storedImage.pinataFileId,
        customImageCid: storedImage.cid,
        awaitingCustomImage: false,
      })
      .where(eq(buybotSettings.groupId, groupId));

    await ctx.replyWithPhoto(telegramFileId, {
      caption:
        "BuyBot image updated. Future buy notifications will use this image.",
    });
  } catch (error) {
    console.error("Could not update BuyBot image", error);
    if (
      error instanceof Error &&
      error.message === "PINATA_JWT_NOT_CONFIGURED"
    ) {
      await ctx.reply(
        "Pinata storage is not configured. Add PINATA_JWT to the bot environment and restart it.",
      );
      return true;
    }
    await ctx.reply(
      "The BuyBot image could not be saved. Send a PNG, JPEG, or WebP image under 5 MB.",
    );
  }

  return true;
}

bot.on("message:text", async (ctx) => {
  if (!isGroupContext(ctx) || ctx.message.text.startsWith("/")) {
    return;
  }

  const contractIntent = /\b(?:ca|contract|token address)\b/i.test(
    ctx.message.text,
  );
  const suppliedAddress = ctx.message.text.match(
    /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/,
  )?.[0];
  if (contractIntent && suppliedAddress) {
    const session = await activeTokenSession(String(ctx.chat.id));
    if (session) {
      await ctx.reply(
        contractGuardMessage({
          officialToken: session.tokenAddress,
          suppliedAddress,
        }),
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        },
      );
      return;
    }
  }

  if (await handleGroupSetupConversation(ctx)) return;

  const groupId = String(ctx.chat.id);
  const group = await db.query.telegramGroups.findFirst({
    where: eq(telegramGroups.id, groupId),
  });

  if (
    !group ||
    group.lifecycle !== "DRAFTING" ||
    group.ownerUserId !== String(ctx.from.id) ||
    !(await isCurrentGroupOwner(ctx))
  ) {
    return;
  }
  if (!(await requireChannelSubscriptions(ctx))) return;

  const conversation = await db.query.launchConversations.findFirst({
    where: eq(launchConversations.groupId, groupId),
  });
  if (
    !conversation ||
    conversation.ownerUserId !== String(ctx.from.id) ||
    conversation.expiresAt.getTime() <= Date.now()
  ) {
    await ctx.reply("Run /launch to start a new token setup.");
    return;
  }

  if (conversation.step === "AWAITING_LOGO") {
    await ctx.reply(launchConversationPrompt("AWAITING_LOGO"));
    return;
  }

  try {
    const next = applyLaunchConversationAnswer({
      step: conversation.step,
      answer: ctx.message.text,
      currentDetailsJson: conversation.detailsJson,
    });
    await db
      .update(launchConversations)
      .set({
        step: next.nextStep,
        detailsJson: next.detailsJson,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(launchConversations.groupId, groupId));
    await ctx.reply(launchConversationPrompt(next.nextStep));
  } catch {
    await ctx.reply(
      [
        "That value is invalid.",
        "",
        launchConversationPrompt(conversation.step),
      ].join("\n"),
    );
  }
});

async function handleLaunchOrder(
  ctx: Context,
  telegramFileId: string,
  caption: string | undefined,
): Promise<void> {
  if (!isGroupContext(ctx) || !ctx.chat || !ctx.from) {
    return;
  }

  const groupId = String(ctx.chat.id);
  const group = await db.query.telegramGroups.findFirst({
    where: eq(telegramGroups.id, groupId),
  });

  if (
    !group ||
    group.lifecycle !== "DRAFTING" ||
    group.ownerUserId !== String(ctx.from.id) ||
    !(await isCurrentGroupOwner(ctx))
  ) {
    return;
  }
  if (!(await requireChannelSubscriptions(ctx))) return;

  const conversation = await db.query.launchConversations.findFirst({
    where: eq(launchConversations.groupId, groupId),
  });
  const hasCompletedConversation =
    conversation?.ownerUserId === String(ctx.from.id) &&
    conversation.step === "AWAITING_LOGO" &&
    conversation.expiresAt.getTime() > Date.now();
  const suppliedCaption = caption?.trim() ?? "";

  if (!hasCompletedConversation && !suppliedCaption) {
    await ctx.reply(
      "Run /launch first, or include the complete token details in the image caption.",
    );
    return;
  }

  if (env.OPENAI_API_KEY && !hasCompletedConversation) {
    const llmAccess = canUseTokenDraftLlm({
      senderUserId: String(ctx.from.id),
      ownerUserId: group.ownerUserId,
      lifecycle: group.lifecycle,
      hasActiveDraft: group.lifecycle === "DRAFTING",
    });
    if (!llmAccess.allowed || !looksLikeTokenDetails(suppliedCaption)) {
      await ctx.reply(
        "The token assistant only accepts launch details from the group owner during an active /launch flow.",
      );
      return;
    }
  }

  try {
    const groupTelegramUrl = await getGroupTelegramUrl(ctx);
    if (!groupTelegramUrl) {
      await ctx.reply(
        "This group is private. Set a public Telegram username for the group, then try again.",
      );
      return;
    }

    // Parse and validate before uploading so Pinata metadata can use the token
    // symbol and invalid orders never create orphaned IPFS files.
    const draftTemplate = hasCompletedConversation
      ? completeConversationDraft({
          detailsJson: conversation.detailsJson,
          logoUrl: "https://placeholder.invalid/logo",
          groupTelegramUrl,
        })
      : env.OPENAI_API_KEY
        ? await extractLaunchDraftWithLlm({
            ownerMessage: suppliedCaption,
            logoUrl: "https://placeholder.invalid/logo",
            groupTelegramUrl,
          })
        : parseLaunchOrderCaption(
            suppliedCaption,
            "https://placeholder.invalid/logo",
            groupTelegramUrl,
          );

    const orderId = `order_${randomBytes(18).toString("base64url")}`;
    const telegramFile = await ctx.api.getFile(telegramFileId);
    if (!telegramFile.file_path) {
      await ctx.reply("Telegram did not provide a downloadable file path.");
      return;
    }

    const storedLogo = await downloadAndStoreTelegramLogo({
      botToken: env.TELEGRAM_BOT_TOKEN!,
      telegramFilePath: telegramFile.file_path,
      storageNamespace: orderId,
      tokenSymbol: draftTemplate.symbol,
    });
    const draft = launchDraftSchema.parse({
      ...draftTemplate,
      logoUrl: storedLogo.publicUrl,
    });

    await db.insert(launchOrders).values({
      id: orderId,
      groupId,
      ownerUserId: String(ctx.from.id),
      detailsJson: JSON.stringify(draft),
      expectedDeployer: draft.deployerAddress,
      telegramFileId,
      logoStorageKey: storedLogo.storageKey,
      logoPublicUrl: storedLogo.publicUrl,
      logoMimeType: storedLogo.mimeType,
      logoPinataFileId: storedLogo.pinataFileId,
      logoCid: storedLogo.cid,
      status: "AWAITING_CONFIRMATION",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    await db
      .delete(launchConversations)
      .where(eq(launchConversations.groupId, groupId));

    const keyboard = new InlineKeyboard()
      .text("Confirm launch order", `confirm_launch:${orderId}`)
      .row()
      .text("Cancel", `cancel_launch:${orderId}`);

    await ctx.reply(formatLaunchOrderPreview(draft), {
      reply_markup: keyboard,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UNKNOWN_LOGO_UPLOAD_ERROR";

    if (message === "LOGO_TOO_LARGE") {
      await ctx.reply("The logo is too large. Please upload an image under 5 MB.");
      return;
    }

    if (message === "UNSUPPORTED_LOGO_FORMAT") {
      await ctx.reply("Please upload the logo as a PNG, JPEG, or WebP image.");
      return;
    }

    if (message === "PINATA_JWT_NOT_CONFIGURED") {
      await ctx.reply(
        "Pinata storage is not configured. Add PINATA_JWT to the bot environment and restart it.",
      );
      return;
    }

    if (message.startsWith("PINATA_UPLOAD_FAILED_")) {
      await ctx.reply(
        "The image could not be uploaded to Pinata. Check the JWT permissions and try again.",
      );
      return;
    }

    if (
      message === "LLM_REQUEST_FAILED" ||
      message === "LLM_DID_NOT_RETURN_TOKEN_DETAILS"
    ) {
      await ctx.reply(
        "The token-detail assistant is temporarily unavailable. Please try the same launch order again.",
      );
      return;
    }

    if (error instanceof ZodError) {
      const missingOrInvalid = error.issues
        .map((issue) => issue.path.join("."))
        .filter(Boolean)
        .join(", ");
      await ctx.reply(
        `The launch order is incomplete or invalid. Check these fields: ${missingOrInvalid}. Send the logo and complete details together again.`,
      );
      return;
    }

    console.error("Logo upload failed", error);
    await ctx.reply("The launch order could not be saved. Please try again.");
  }
}

bot.on("message:photo", async (ctx) => {
  const largestPhoto = ctx.message.photo.at(-1);
  if (largestPhoto) {
    if (await handleBuybotCustomImage(ctx, largestPhoto.file_id)) return;
    await handleLaunchOrder(ctx, largestPhoto.file_id, ctx.message.caption);
  }
});

bot.on("message:document", async (ctx) => {
  const document = ctx.message.document;
  if (!document.mime_type?.startsWith("image/")) {
    return;
  }

  if (await handleBuybotCustomImage(ctx, document.file_id)) return;
  await handleLaunchOrder(ctx, document.file_id, ctx.message.caption);
});

bot.on("callback_query:data", async (ctx) => {
  const [action, orderId] = ctx.callbackQuery.data.split(":");
  if (action === "check_subscriptions") {
    if (await requireChannelSubscriptions(ctx)) {
      await ctx.answerCallbackQuery({
        text: "Subscription verified.",
      });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(
        "Subscription verified. You can now use Telepons commands.",
      );
    }
    return;
  }

  if (!(await requireChannelSubscriptions(ctx))) return;

  if (action === "trending" && orderId && isTrendingPeriod(orderId)) {
    await ctx.answerCallbackQuery({ text: `${orderId.toUpperCase()} leaderboard` });
    await ctx.editMessageText(await renderTrending(orderId), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: env.TRENDING_ENABLED
        ? trendingKeyboard(orderId)
        : undefined,
    });
    return;
  }

  if (
    (action === "continue_session" || action === "edit_session") &&
    orderId
  ) {
    const session = await db.query.launchSessions.findFirst({
      where: eq(launchSessions.id, orderId),
    });
    if (
      !session ||
      session.status !== "READY" ||
      session.expiresAt.getTime() <= Date.now() ||
      session.createdByUserId !== String(ctx.from.id) ||
      !(await isCurrentGroupOwner(ctx))
    ) {
      await ctx.answerCallbackQuery({
        text: "This launch session is no longer available.",
        show_alert: true,
      });
      return;
    }

    if (action === "continue_session") {
      const launchUrl = new URL(
        `/launch/${session.id}`,
        env.APP_BASE_URL,
      ).toString();
      await ctx.answerCallbackQuery({ text: "Opening existing session." });
      await ctx.reply(
        [
          "Continue with the existing launch session:",
          "",
          `Expires at ${session.expiresAt.toISOString()}`,
        ].join("\n"),
        { reply_markup: launchSessionKeyboard(launchUrl) },
      );
      return;
    }

    await db
      .update(launchSessions)
      .set({ status: "CANCELLED" })
      .where(eq(launchSessions.id, session.id));
    await db
      .update(telegramGroups)
      .set({ lifecycle: "DRAFTING", activeLaunchSessionId: null })
      .where(eq(telegramGroups.id, session.groupId));

    const previousOrder = await db.query.launchOrders.findFirst({
      where: eq(launchOrders.launchSessionId, session.id),
    });
    if (previousOrder) {
      await db
        .update(launchOrders)
        .set({ status: "CANCELLED" })
        .where(eq(launchOrders.id, previousOrder.id));

      if (previousOrder.announcementMessageId) {
        const previousDraft = launchDraftSchema.parse(
          JSON.parse(session.draftJson),
        );
        const previousGroup = await db.query.telegramGroups.findFirst({
          where: eq(telegramGroups.id, session.groupId),
        });
        const keyboard = previousDraft.telegram
          ? new InlineKeyboard().url(
              "Join community",
              previousDraft.telegram,
            )
          : undefined;
        try {
          await ctx.api.editMessageCaption(
            env.TELEGRAM_LAUNCH_CHANNEL,
            Number(previousOrder.announcementMessageId),
            {
              caption: launchAnnouncementCaption({
                draft: previousDraft,
                status: "CANCELLED",
                groupTitle: previousGroup?.title ?? "Community",
              }),
              parse_mode: "HTML",
              reply_markup: keyboard,
            },
          );
        } catch (error) {
          console.error("Could not cancel channel announcement", error);
        }
      }
    }

    await ctx.answerCallbackQuery({ text: "Previous session cancelled." });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.reply(
      [
        "The previous session and its token details were discarded.",
        "",
        "Send a new logo image with the complete token details in its caption.",
      ].join("\n"),
    );
    return;
  }

  if (
    (action !== "confirm_launch" && action !== "cancel_launch") ||
    !orderId
  ) {
    return;
  }

  const order = await db.query.launchOrders.findFirst({
    where: eq(launchOrders.id, orderId),
  });

  if (
    !order ||
    order.status !== "AWAITING_CONFIRMATION" ||
    order.ownerUserId !== String(ctx.from.id) ||
    Date.now() >= order.expiresAt.getTime()
  ) {
    await ctx.answerCallbackQuery({
      text: "This launch order is unavailable or expired.",
      show_alert: true,
    });
    return;
  }

  if (!(await isCurrentGroupOwner(ctx))) {
    await ctx.answerCallbackQuery({
      text: "Only the current group owner can confirm this launch.",
      show_alert: true,
    });
    return;
  }
  if (action === "cancel_launch") {
    await db
      .update(launchOrders)
      .set({ status: "CANCELLED" })
      .where(eq(launchOrders.id, order.id));
    await db
      .update(telegramGroups)
      .set({ lifecycle: "UNCONFIGURED", activeLaunchSessionId: null })
      .where(eq(telegramGroups.id, order.groupId));
    await ctx.answerCallbackQuery({ text: "Launch order cancelled." });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.reply("Launch order cancelled. Run /launch to start again.");
    return;
  }

  if (!(await getGroupTelegramUrl(ctx))) {
    await ctx.answerCallbackQuery({
      text: "The group must be public before a launch session can be created.",
      show_alert: true,
    });
    return;
  }

  const sessionId = `launch_${randomBytes(24).toString("base64url")}`;
  const draftHash = `0x${createHash("sha256")
    .update(order.detailsJson)
    .digest("hex")}`;

  await db.insert(launchSessions).values({
    id: sessionId,
    groupId: order.groupId,
    createdByUserId: order.ownerUserId,
    expectedDeployer: order.expectedDeployer,
    draftJson: order.detailsJson,
    draftHash,
    status: "READY",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  await db.insert(tokenAssets).values({
    id: `asset_${randomBytes(18).toString("base64url")}`,
    launchSessionId: sessionId,
    telegramFileId: order.telegramFileId,
    storageKey: order.logoStorageKey,
    publicUrl: order.logoPublicUrl,
    mimeType: order.logoMimeType,
    pinataFileId: order.logoPinataFileId,
    cid: order.logoCid,
  });

  await db
    .update(launchOrders)
    .set({ status: "CONFIRMED", launchSessionId: sessionId })
    .where(eq(launchOrders.id, order.id));
  await db
    .update(telegramGroups)
    .set({ lifecycle: "READY", activeLaunchSessionId: sessionId })
    .where(eq(telegramGroups.id, order.groupId));

  const launchUrl = new URL(`/launch/${sessionId}`, env.APP_BASE_URL).toString();
  await ctx.answerCallbackQuery({ text: "Launch session created." });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });

  let announcementResult =
    "The upcoming launch was announced in the launch-list channel.";
  try {
    const draft = launchDraftSchema.parse(JSON.parse(order.detailsJson));
    const announcementGroup = await db.query.telegramGroups.findFirst({
      where: eq(telegramGroups.id, order.groupId),
    });
    const announcementMessageId = await announceLaunchSession({
      api: ctx.api,
      channel: env.TELEGRAM_LAUNCH_CHANNEL,
      draft,
      launchUrl,
      telegramFileId: order.telegramFileId,
      groupTitle: announcementGroup?.title ?? "Community",
    });
    await db
      .update(launchOrders)
      .set({ announcementMessageId: String(announcementMessageId) })
      .where(eq(launchOrders.id, order.id));
  } catch (error) {
    const announcementError =
      error instanceof Error ? error.message : "UNKNOWN_ANNOUNCEMENT_ERROR";
    console.error("Launch announcement failed", error);
    await db
      .update(launchOrders)
      .set({ announcementError })
      .where(eq(launchOrders.id, order.id));
    announcementResult =
      "The launch session was created, but the channel announcement failed. Check the bot's channel permissions.";
  }

  await ctx.reply(
    [
      "Launch order confirmed.",
      "",
      "The launch session is ready for deployer-wallet verification and execution.",
      "",
      "This session expires in 10 minutes.",
      "",
      announcementResult,
    ].join("\n"),
    { reply_markup: launchSessionKeyboard(launchUrl) },
  );
});

bot.catch((error) => {
  console.error("Telegram bot error", error.error);
});

async function main(): Promise<void> {
  console.log("Starting Telepons Telegram bot");
  console.log(
    `Telepons Trending: ${env.TRENDING_ENABLED ? env.TRENDING_DATA_SOURCE.toUpperCase() : "DISABLED"}`,
  );
  await backfillConfiguredGroupInstallations();
  const groupCounts = await getBotGroupCounts();
  console.log(
    `Telepons group installations: ${groupCounts.active} active, ${groupCounts.total} total`,
  );
  await rebuildVolumeTotalsFromSwaps();
  await expirePendingVerifications(bot.api);
  const verificationTimer = setInterval(() => {
    void expirePendingVerifications(bot.api).catch((error) => {
      console.error("Member-verification expiration sweep failed", error);
    });
  }, 30_000);
  verificationTimer.unref();
  await expireLaunchSessions(bot.api);
  const expirationTimer = setInterval(() => {
    void expireLaunchSessions(bot.api).catch((error) => {
      console.error("Launch-session expiration sweep failed", error);
    });
  }, 30_000);
  expirationTimer.unref();
  await runBuybotIndexer(bot.api);
  const buybotTimer = setInterval(() => {
    void runBuybotIndexer(bot.api).catch((error) => {
      console.error("BuyBot indexer cycle failed", error);
    });
  }, 4_000);
  buybotTimer.unref();
  const buybotAggregateTimer = setInterval(() => {
    void flushBuybotAggregates(bot.api).catch((error) => {
      console.error("BuyBot aggregate flush failed", error);
    });
  }, 10_000);
  buybotAggregateTimer.unref();
  await bot.start();
}

main().catch((error: unknown) => {
  console.error("Failed to start Telepons Telegram bot", error);
  process.exitCode = 1;
});

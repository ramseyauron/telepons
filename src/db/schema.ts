import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const telegramGroups = pgTable("telegram_groups", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  lifecycle: text("lifecycle", {
    enum: ["UNCONFIGURED", "DRAFTING", "READY", "ACTIVE"],
  })
    .notNull()
    .default("UNCONFIGURED"),
  activeLaunchSessionId: text("active_launch_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const telegramBotInstallations = pgTable(
  "telegram_bot_installations",
  {
    groupId: text("group_id").primaryKey(),
    title: text("title").notNull(),
    chatType: text("chat_type", {
      enum: ["group", "supergroup"],
    }).notNull(),
    active: boolean("active").notNull().default(true),
    addedAt: timestamp("added_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const groupModerationSettings = pgTable(
  "group_moderation_settings",
  {
    groupId: text("group_id").primaryKey(),
    groupDescription: text("group_description"),
    welcomeMessage: text("welcome_message"),
    welcomeImageTelegramFileId: text("welcome_image_telegram_file_id"),
    welcomeImageStorageKey: text("welcome_image_storage_key"),
    welcomeImagePublicUrl: text("welcome_image_public_url"),
    welcomeImagePinataFileId: text("welcome_image_pinata_file_id"),
    welcomeImageCid: text("welcome_image_cid"),
    lastWelcomeMessageId: text("last_welcome_message_id"),
    welcomeEnabled: boolean("welcome_enabled")
      .notNull()
      .default(true),
    verificationEnabled: boolean("verification_enabled")
      .notNull()
      .default(true),
    antiFloodEnabled: boolean("anti_flood_enabled")
      .notNull()
      .default(true),
    floodMaxMessages: integer("flood_max_messages").notNull().default(5),
    floodWindowSeconds: integer("flood_window_seconds").notNull().default(10),
    muteSeconds: integer("mute_seconds").notNull().default(60),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const groupWelcomeDrafts = pgTable("group_welcome_drafts", {
  groupId: text("group_id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  mode: text("mode", { enum: ["MESSAGE", "IMAGE"] }).notNull(),
  message: text("message"),
  imageTelegramFileId: text("image_telegram_file_id"),
  imageStorageKey: text("image_storage_key"),
  imagePublicUrl: text("image_public_url"),
  imagePinataFileId: text("image_pinata_file_id"),
  imageCid: text("image_cid"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const groupSetupConversations = pgTable(
  "group_setup_conversations",
  {
    groupId: text("group_id")
      .primaryKey()
      .references(() => telegramGroups.id),
    ownerUserId: text("owner_user_id").notNull(),
    step: text("step", {
      enum: ["GROUP_DESCRIPTION", "WELCOME_MESSAGE"],
    }).notNull(),
    groupDescription: text("group_description"),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const memberVerifications = pgTable("member_verifications", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  firstName: text("first_name").notNull().default("Member"),
  status: text("status", {
    enum: ["PENDING", "VERIFIED", "EXPIRED"],
  }).notNull(),
  expectedAnswer: integer("expected_answer").notNull(),
  challengePrompt: text("challenge_prompt").notNull().default(""),
  verificationToken: text("verification_token").notNull().default(""),
  challengeAccessToken: text("challenge_access_token"),
  attemptCount: integer("attempt_count").notNull().default(0),
  challengeMessageId: text("challenge_message_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const moderationActions = pgTable("moderation_actions", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userId: text("user_id").notNull(),
  action: text("action", {
    enum: [
      "BOT_ACCOUNT_DETECTED",
      "VERIFICATION_STARTED",
      "VERIFICATION_PASSED",
      "VERIFICATION_EXPIRED",
      "MESSAGE_BLOCKED",
      "FLOOD_MUTED",
      "SUSPICIOUS_NAME_KICKED",
    ],
  }).notNull(),
  detailsJson: text("details_json"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const communityHealthSnapshots = pgTable(
  "community_health_snapshots",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    memberCount: integer("member_count").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("community_health_snapshots_group_captured_idx").on(
      table.groupId,
      table.capturedAt,
    ),
  ],
);

export const launchSessions = pgTable("launch_sessions", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => telegramGroups.id),
  createdByUserId: text("created_by_user_id").notNull(),
  expectedDeployer: text("expected_deployer").notNull(),
  draftJson: text("draft_json").notNull(),
  draftHash: text("draft_hash").notNull(),
  status: text("status", {
    enum: [
      "DRAFTING",
      "READY",
      "LINK_CREATED",
      "WALLET_MATCHED",
      "SIMULATED",
      "TX_SUBMITTED",
      "CONFIRMING",
      "ACTIVE",
      "EXPIRED",
      "CANCELLED",
      "FAILED",
    ],
  }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  transactionHash: text("transaction_hash"),
  tokenAddress: text("token_address"),
  poolAddress: text("pool_address"),
  launchBlock: integer("launch_block"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const indexerCheckpoints = pgTable("indexer_checkpoints", {
  poolAddress: text("pool_address").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  nextBlock: integer("next_block").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const holderIndexerCheckpoints = pgTable("holder_indexer_checkpoints", {
  tokenAddress: text("token_address").primaryKey(),
  nextBlock: integer("next_block").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tokenTransfers = pgTable(
  "token_transfers",
  {
    id: text("id").primaryKey(),
    tokenAddress: text("token_address").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    valueRaw: text("value_raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("token_transfers_token_block_idx").on(table.tokenAddress, table.blockNumber)],
);

export const holderBalances = pgTable(
  "holder_balances",
  {
    id: text("id").primaryKey(),
    tokenAddress: text("token_address").notNull(),
    walletAddress: text("wallet_address").notNull(),
    balanceRaw: text("balance_raw").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("holder_balances_token_idx").on(table.tokenAddress)],
);

export const tokenHolderStats = pgTable("token_holder_stats", {
  tokenAddress: text("token_address").primaryKey(),
  adjustedHolderCount: integer("adjusted_holder_count").notNull().default(0),
  top10Bps: integer("top_10_bps").notNull().default(0),
  largestHolderAddress: text("largest_holder_address"),
  largestHolderBps: integer("largest_holder_bps").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const holderSyncRequests = pgTable("holder_sync_requests", {
  tokenAddress: text("token_address").primaryKey(),
  notBefore: timestamp("not_before", { withTimezone: true, mode: "date" })
    .notNull(),
  reason: text("reason").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const swaps = pgTable(
  "swaps",
  {
    id: text("id").primaryKey(),
    tokenAddress: text("token_address").notNull(),
    poolAddress: text("pool_address").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    traderAddress: text("trader_address").notNull(),
    side: text("side", { enum: ["BUY", "SELL"] }).notNull(),
    pairAmountWei: text("pair_amount_wei").notNull(),
    tokenAmountRaw: text("token_amount_raw").notNull(),
    tradedAt: timestamp("traded_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("swaps_token_traded_at_idx").on(
      table.tokenAddress,
      table.tradedAt,
    ),
  ],
);

export const tokenVolumeTotals = pgTable("token_volume_totals", {
  tokenAddress: text("token_address").primaryKey(),
  poolAddress: text("pool_address").notNull(),
  buyVolumeWei: text("buy_volume_wei").notNull().default("0"),
  sellVolumeWei: text("sell_volume_wei").notNull().default("0"),
  grossVolumeWei: text("gross_volume_wei").notNull().default("0"),
  netFlowWei: text("net_flow_wei").notNull().default("0"),
  buyCount: integer("buy_count").notNull().default(0),
  sellCount: integer("sell_count").notNull().default(0),
  tradeCount: integer("trade_count").notNull().default(0),
  firstTradeBlock: integer("first_trade_block"),
  lastTradeBlock: integer("last_trade_block"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tokenSnapshots = pgTable("token_snapshots", {
  tokenAddress: text("token_address").primaryKey(),
  poolAddress: text("pool_address").notNull(),
  sqrtPriceX96: text("sqrt_price_x96").notNull(),
  priceWethX18: text("price_weth_x18").notNull(),
  marketCapWethWei: text("market_cap_weth_wei").notNull(),
  pairedPrincipalWei: text("paired_principal_wei").notNull(),
  graduationThresholdWei: text("graduation_threshold_wei").notNull(),
  graduationBps: integer("graduation_bps").notNull(),
  graduated: boolean("graduated").notNull(),
  totalSupplyRaw: text("total_supply_raw").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const groupTokenIntelligence = pgTable(
  "group_token_intelligence",
  {
    groupId: text("group_id").primaryKey(),
    dashboardEnabled: boolean("dashboard_enabled").notNull().default(true),
    dashboardMessageId: text("dashboard_message_id"),
    dashboardUpdatedAt: timestamp("dashboard_updated_at", {
      withTimezone: true,
      mode: "date",
    }),
    graduationAlertsEnabled: boolean("graduation_alerts_enabled")
      .notNull()
      .default(true),
    milestonesEnabled: boolean("milestones_enabled").notNull().default(true),
    lastHolderMilestone: integer("last_holder_milestone")
      .notNull()
      .default(0),
    lastVolumeMilestoneWei: text("last_volume_milestone_wei")
      .notNull()
      .default("0"),
    lastGraduationMilestone: integer("last_graduation_milestone")
      .notNull()
      .default(0),
    volumeAlertThresholdWei: text("volume_alert_threshold_wei"),
    volumeAlertTriggeredAt: timestamp("volume_alert_triggered_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const trendingState = pgTable("trending_state", {
  id: text("id").primaryKey(),
  onchainActivatedAt: timestamp("onchain_activated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});

export const buybotSettings = pgTable("buybot_settings", {
  groupId: text("group_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  minimumBuyWei: text("minimum_buy_wei")
    .notNull()
    .default("10000000000000000"),
  customImageTelegramFileId: text("custom_image_telegram_file_id"),
  customImageStorageKey: text("custom_image_storage_key"),
  customImagePublicUrl: text("custom_image_public_url"),
  customImagePinataFileId: text("custom_image_pinata_file_id"),
  customImageCid: text("custom_image_cid"),
  awaitingCustomImage: boolean("awaiting_custom_image")
    .notNull()
    .default(false),
  topicId: integer("topic_id"),
  notificationMode: text("notification_mode", {
    enum: ["REALTIME", "AGGREGATE"],
  })
    .notNull()
    .default("REALTIME"),
  aggregateWindowSeconds: integer("aggregate_window_seconds")
    .notNull()
    .default(60),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const buybotAggregates = pgTable("buybot_aggregates", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  tokenAddress: text("token_address").notNull(),
  symbol: text("symbol").notNull(),
  totalVolumeWei: text("total_volume_wei").notNull(),
  largestBuyWei: text("largest_buy_wei").notNull(),
  buyCount: integer("buy_count").notNull(),
  uniqueTradersJson: text("unique_traders_json").notNull().default("[]"),
  lastTransactionHash: text("last_transaction_hash").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const buybotTestTargets = pgTable("buybot_test_targets", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  tokenAddress: text("token_address").notNull(),
  poolAddress: text("pool_address").notNull(),
  symbol: text("symbol").notNull(),
  tokenDecimals: integer("token_decimals").notNull(),
  startBlock: integer("start_block").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const launchOrders = pgTable("launch_orders", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => telegramGroups.id),
  ownerUserId: text("owner_user_id").notNull(),
  detailsJson: text("details_json").notNull(),
  expectedDeployer: text("expected_deployer").notNull(),
  telegramFileId: text("telegram_file_id").notNull(),
  logoStorageKey: text("logo_storage_key").notNull(),
  logoPublicUrl: text("logo_public_url").notNull(),
  logoMimeType: text("logo_mime_type").notNull(),
  logoPinataFileId: text("logo_pinata_file_id"),
  logoCid: text("logo_cid"),
  launchSessionId: text("launch_session_id"),
  announcementMessageId: text("announcement_message_id"),
  announcementError: text("announcement_error"),
  status: text("status", {
    enum: ["AWAITING_CONFIRMATION", "CONFIRMED", "CANCELLED", "EXPIRED"],
  }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const launchConversations = pgTable("launch_conversations", {
  groupId: text("group_id")
    .primaryKey()
    .references(() => telegramGroups.id),
  ownerUserId: text("owner_user_id").notNull(),
  step: text("step", {
    enum: [
      "NAME",
      "SYMBOL",
      "DESCRIPTION",
      "DEPLOYER",
      "DEVELOPER_BUY",
      "TWITTER",
      "WEBSITE",
      "AWAITING_LOGO",
    ],
  }).notNull(),
  detailsJson: text("details_json").notNull().default("{}"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tokenAssets = pgTable("token_assets", {
  id: text("id").primaryKey(),
  launchSessionId: text("launch_session_id")
    .notNull()
    .references(() => launchSessions.id),
  telegramFileId: text("telegram_file_id"),
  storageKey: text("storage_key").notNull(),
  publicUrl: text("public_url").notNull(),
  mimeType: text("mime_type").notNull(),
  pinataFileId: text("pinata_file_id"),
  cid: text("cid"),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

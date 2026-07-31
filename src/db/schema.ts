import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const telegramGroups = sqliteTable("telegram_groups", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  lifecycle: text("lifecycle", {
    enum: ["UNCONFIGURED", "DRAFTING", "READY", "ACTIVE"],
  })
    .notNull()
    .default("UNCONFIGURED"),
  activeLaunchSessionId: text("active_launch_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const telegramBotInstallations = sqliteTable(
  "telegram_bot_installations",
  {
    groupId: text("group_id").primaryKey(),
    title: text("title").notNull(),
    chatType: text("chat_type", {
      enum: ["group", "supergroup"],
    }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    removedAt: integer("removed_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const launchSessions = sqliteTable("launch_sessions", {
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
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  transactionHash: text("transaction_hash"),
  tokenAddress: text("token_address"),
  poolAddress: text("pool_address"),
  launchBlock: integer("launch_block"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const indexerCheckpoints = sqliteTable("indexer_checkpoints", {
  poolAddress: text("pool_address").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  nextBlock: integer("next_block").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const swaps = sqliteTable("swaps", {
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tokenVolumeTotals = sqliteTable("token_volume_totals", {
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
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const buybotSettings = sqliteTable("buybot_settings", {
  groupId: text("group_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  minimumBuyWei: text("minimum_buy_wei")
    .notNull()
    .default("10000000000000000"),
  customImageTelegramFileId: text("custom_image_telegram_file_id"),
  customImageStorageKey: text("custom_image_storage_key"),
  customImagePublicUrl: text("custom_image_public_url"),
  awaitingCustomImage: integer("awaiting_custom_image", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const buybotTestTargets = sqliteTable("buybot_test_targets", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  tokenAddress: text("token_address").notNull(),
  poolAddress: text("pool_address").notNull(),
  symbol: text("symbol").notNull(),
  tokenDecimals: integer("token_decimals").notNull(),
  startBlock: integer("start_block").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const launchOrders = sqliteTable("launch_orders", {
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
  launchSessionId: text("launch_session_id"),
  announcementMessageId: text("announcement_message_id"),
  announcementError: text("announcement_error"),
  status: text("status", {
    enum: ["AWAITING_CONFIRMATION", "CONFIRMED", "CANCELLED", "EXPIRED"],
  }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const launchConversations = sqliteTable("launch_conversations", {
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
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tokenAssets = sqliteTable("token_assets", {
  id: text("id").primaryKey(),
  launchSessionId: text("launch_session_id")
    .notNull()
    .references(() => launchSessions.id),
  telegramFileId: text("telegram_file_id"),
  storageKey: text("storage_key").notNull(),
  publicUrl: text("public_url").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

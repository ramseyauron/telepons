CREATE TABLE "buybot_aggregates" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"token_address" text NOT NULL,
	"symbol" text NOT NULL,
	"total_volume_wei" text NOT NULL,
	"largest_buy_wei" text NOT NULL,
	"buy_count" integer NOT NULL,
	"unique_traders_json" text DEFAULT '[]' NOT NULL,
	"last_transaction_hash" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_token_intelligence" (
	"group_id" text PRIMARY KEY NOT NULL,
	"dashboard_enabled" boolean DEFAULT true NOT NULL,
	"dashboard_message_id" text,
	"dashboard_updated_at" timestamp with time zone,
	"graduation_alerts_enabled" boolean DEFAULT true NOT NULL,
	"last_graduation_milestone" integer DEFAULT 0 NOT NULL,
	"volume_alert_threshold_wei" text,
	"volume_alert_triggered_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holder_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"wallet_address" text NOT NULL,
	"balance_raw" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holder_indexer_checkpoints" (
	"token_address" text PRIMARY KEY NOT NULL,
	"next_block" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_holder_stats" (
	"token_address" text PRIMARY KEY NOT NULL,
	"adjusted_holder_count" integer DEFAULT 0 NOT NULL,
	"top_10_bps" integer DEFAULT 0 NOT NULL,
	"largest_holder_address" text,
	"largest_holder_bps" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_snapshots" (
	"token_address" text PRIMARY KEY NOT NULL,
	"pool_address" text NOT NULL,
	"sqrt_price_x96" text NOT NULL,
	"price_weth_x18" text NOT NULL,
	"market_cap_weth_wei" text NOT NULL,
	"paired_principal_wei" text NOT NULL,
	"graduation_threshold_wei" text NOT NULL,
	"graduation_bps" integer NOT NULL,
	"graduated" boolean NOT NULL,
	"total_supply_raw" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" integer NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"value_raw" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buybot_settings" ADD COLUMN "topic_id" integer;--> statement-breakpoint
ALTER TABLE "buybot_settings" ADD COLUMN "notification_mode" text DEFAULT 'REALTIME' NOT NULL;--> statement-breakpoint
ALTER TABLE "buybot_settings" ADD COLUMN "aggregate_window_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
CREATE INDEX "holder_balances_token_idx" ON "holder_balances" USING btree ("token_address");--> statement-breakpoint
CREATE INDEX "token_transfers_token_block_idx" ON "token_transfers" USING btree ("token_address","block_number");
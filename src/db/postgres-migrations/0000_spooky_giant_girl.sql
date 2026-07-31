CREATE TABLE "buybot_settings" (
	"group_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"minimum_buy_wei" text DEFAULT '10000000000000000' NOT NULL,
	"custom_image_telegram_file_id" text,
	"custom_image_storage_key" text,
	"custom_image_public_url" text,
	"custom_image_pinata_file_id" text,
	"custom_image_cid" text,
	"awaiting_custom_image" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buybot_test_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"token_address" text NOT NULL,
	"pool_address" text NOT NULL,
	"symbol" text NOT NULL,
	"token_decimals" integer NOT NULL,
	"start_block" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_moderation_settings" (
	"group_id" text PRIMARY KEY NOT NULL,
	"welcome_enabled" boolean DEFAULT true NOT NULL,
	"verification_enabled" boolean DEFAULT true NOT NULL,
	"anti_flood_enabled" boolean DEFAULT true NOT NULL,
	"flood_max_messages" integer DEFAULT 5 NOT NULL,
	"flood_window_seconds" integer DEFAULT 10 NOT NULL,
	"mute_seconds" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"pool_address" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"next_block" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_conversations" (
	"group_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"step" text NOT NULL,
	"details_json" text DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"details_json" text NOT NULL,
	"expected_deployer" text NOT NULL,
	"telegram_file_id" text NOT NULL,
	"logo_storage_key" text NOT NULL,
	"logo_public_url" text NOT NULL,
	"logo_mime_type" text NOT NULL,
	"logo_pinata_file_id" text,
	"logo_cid" text,
	"launch_session_id" text,
	"announcement_message_id" text,
	"announcement_error" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expected_deployer" text NOT NULL,
	"draft_json" text NOT NULL,
	"draft_hash" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"transaction_hash" text,
	"token_address" text,
	"pool_address" text,
	"launch_block" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text DEFAULT 'Member' NOT NULL,
	"status" text NOT NULL,
	"expected_answer" integer NOT NULL,
	"challenge_prompt" text DEFAULT '' NOT NULL,
	"verification_token" text DEFAULT '' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"challenge_message_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"details_json" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"pool_address" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" integer NOT NULL,
	"trader_address" text NOT NULL,
	"side" text NOT NULL,
	"pair_amount_wei" text NOT NULL,
	"token_amount_raw" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_bot_installations" (
	"group_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"chat_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"lifecycle" text DEFAULT 'UNCONFIGURED' NOT NULL,
	"active_launch_session_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"launch_session_id" text NOT NULL,
	"telegram_file_id" text,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"mime_type" text NOT NULL,
	"pinata_file_id" text,
	"cid" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_volume_totals" (
	"token_address" text PRIMARY KEY NOT NULL,
	"pool_address" text NOT NULL,
	"buy_volume_wei" text DEFAULT '0' NOT NULL,
	"sell_volume_wei" text DEFAULT '0' NOT NULL,
	"gross_volume_wei" text DEFAULT '0' NOT NULL,
	"net_flow_wei" text DEFAULT '0' NOT NULL,
	"buy_count" integer DEFAULT 0 NOT NULL,
	"sell_count" integer DEFAULT 0 NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"first_trade_block" integer,
	"last_trade_block" integer,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_conversations" ADD CONSTRAINT "launch_conversations_group_id_telegram_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_orders" ADD CONSTRAINT "launch_orders_group_id_telegram_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_sessions" ADD CONSTRAINT "launch_sessions_group_id_telegram_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_assets" ADD CONSTRAINT "token_assets_launch_session_id_launch_sessions_id_fk" FOREIGN KEY ("launch_session_id") REFERENCES "public"."launch_sessions"("id") ON DELETE no action ON UPDATE no action;
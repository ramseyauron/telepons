CREATE TABLE `buybot_settings` (
	`group_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`minimum_buy_wei` text DEFAULT '10000000000000000' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `indexer_checkpoints` (
	`pool_address` text PRIMARY KEY NOT NULL,
	`token_address` text NOT NULL,
	`next_block` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`token_address` text NOT NULL,
	`pool_address` text NOT NULL,
	`transaction_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`block_number` integer NOT NULL,
	`trader_address` text NOT NULL,
	`side` text NOT NULL,
	`pair_amount_wei` text NOT NULL,
	`token_amount_raw` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `launch_sessions` ADD `launch_block` integer;
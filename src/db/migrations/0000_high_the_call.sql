CREATE TABLE `launch_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expected_deployer` text NOT NULL,
	`draft_json` text NOT NULL,
	`draft_hash` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`transaction_hash` text,
	`token_address` text,
	`pool_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `telegram_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `telegram_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`launch_session_id` text NOT NULL,
	`telegram_file_id` text,
	`storage_key` text NOT NULL,
	`public_url` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`launch_session_id`) REFERENCES `launch_sessions`(`id`) ON UPDATE no action ON DELETE no action
);

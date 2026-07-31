CREATE TABLE `buybot_test_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`token_address` text NOT NULL,
	`pool_address` text NOT NULL,
	`symbol` text NOT NULL,
	`token_decimals` integer NOT NULL,
	`start_block` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);

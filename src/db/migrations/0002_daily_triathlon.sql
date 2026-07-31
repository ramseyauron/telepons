CREATE TABLE `launch_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`details_json` text NOT NULL,
	`expected_deployer` text NOT NULL,
	`telegram_file_id` text NOT NULL,
	`logo_storage_key` text NOT NULL,
	`logo_public_url` text NOT NULL,
	`logo_mime_type` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `telegram_groups`(`id`) ON UPDATE no action ON DELETE no action
);

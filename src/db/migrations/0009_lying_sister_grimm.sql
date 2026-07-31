CREATE TABLE `launch_conversations` (
	`group_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`step` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `telegram_groups`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `telegram_bot_installations` (
	`group_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`chat_type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`added_at` integer NOT NULL,
	`removed_at` integer,
	`updated_at` integer NOT NULL
);

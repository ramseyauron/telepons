ALTER TABLE `telegram_groups` ADD `owner_user_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_groups` ADD `lifecycle` text DEFAULT 'UNCONFIGURED' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_groups` ADD `active_launch_session_id` text;
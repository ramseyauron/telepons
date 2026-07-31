ALTER TABLE `buybot_settings` ADD `custom_image_telegram_file_id` text;--> statement-breakpoint
ALTER TABLE `buybot_settings` ADD `custom_image_storage_key` text;--> statement-breakpoint
ALTER TABLE `buybot_settings` ADD `custom_image_public_url` text;--> statement-breakpoint
ALTER TABLE `buybot_settings` ADD `awaiting_custom_image` integer DEFAULT false NOT NULL;
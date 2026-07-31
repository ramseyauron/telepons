ALTER TABLE `buybot_settings` ADD `custom_image_pinata_file_id` text;--> statement-breakpoint
ALTER TABLE `buybot_settings` ADD `custom_image_cid` text;--> statement-breakpoint
ALTER TABLE `launch_orders` ADD `logo_pinata_file_id` text;--> statement-breakpoint
ALTER TABLE `launch_orders` ADD `logo_cid` text;--> statement-breakpoint
ALTER TABLE `token_assets` ADD `pinata_file_id` text;--> statement-breakpoint
ALTER TABLE `token_assets` ADD `cid` text;
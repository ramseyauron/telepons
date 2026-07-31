ALTER TABLE `member_verifications` ADD `first_name` text DEFAULT 'Member' NOT NULL;--> statement-breakpoint
ALTER TABLE `member_verifications` ADD `challenge_prompt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `member_verifications` ADD `verification_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `member_verifications` ADD `attempt_count` integer DEFAULT 0 NOT NULL;
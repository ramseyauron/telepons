CREATE TABLE `group_moderation_settings` (
	`group_id` text PRIMARY KEY NOT NULL,
	`welcome_enabled` integer DEFAULT true NOT NULL,
	`verification_enabled` integer DEFAULT true NOT NULL,
	`anti_flood_enabled` integer DEFAULT true NOT NULL,
	`flood_max_messages` integer DEFAULT 5 NOT NULL,
	`flood_window_seconds` integer DEFAULT 10 NOT NULL,
	`mute_seconds` integer DEFAULT 60 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`expected_answer` integer NOT NULL,
	`challenge_message_id` text,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL
);

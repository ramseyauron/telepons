CREATE TABLE "group_welcome_drafts" (
	"group_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"mode" text NOT NULL,
	"message" text,
	"image_telegram_file_id" text,
	"image_storage_key" text,
	"image_public_url" text,
	"image_pinata_file_id" text,
	"image_cid" text,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_image_telegram_file_id" text;--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_image_storage_key" text;--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_image_public_url" text;--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_image_pinata_file_id" text;--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_image_cid" text;
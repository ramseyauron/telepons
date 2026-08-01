CREATE TABLE "group_setup_conversations" (
	"group_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"step" text NOT NULL,
	"group_description" text,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "group_description" text;--> statement-breakpoint
ALTER TABLE "group_moderation_settings" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "group_setup_conversations" ADD CONSTRAINT "group_setup_conversations_group_id_telegram_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."telegram_groups"("id") ON DELETE no action ON UPDATE no action;
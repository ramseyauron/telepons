ALTER TABLE "group_token_intelligence" ADD COLUMN "milestones_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "group_token_intelligence" ADD COLUMN "last_holder_milestone" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_token_intelligence" ADD COLUMN "last_volume_milestone_wei" text DEFAULT '0' NOT NULL;
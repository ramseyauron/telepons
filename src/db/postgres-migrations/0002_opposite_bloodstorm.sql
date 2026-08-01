ALTER TABLE "member_verifications" ADD COLUMN "challenge_access_token" text;--> statement-breakpoint
ALTER TABLE "member_verifications" ADD COLUMN "claimed_at" timestamp with time zone;
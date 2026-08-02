CREATE TABLE "community_health_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"member_count" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "community_health_snapshots_group_captured_idx" ON "community_health_snapshots" USING btree ("group_id","captured_at");
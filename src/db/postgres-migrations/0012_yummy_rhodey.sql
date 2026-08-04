CREATE TABLE "holder_sync_requests" (
	"token_address" text PRIMARY KEY NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL
);

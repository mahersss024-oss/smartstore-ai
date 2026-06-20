CREATE TABLE "public_endpoint_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"rate_limit_key" text NOT NULL,
	"scope" varchar(100) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_endpoint_rate_limits_key_unique" ON "public_endpoint_rate_limits" USING btree ("rate_limit_key");
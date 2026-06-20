CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" integer NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"actor_type" varchar(50) NOT NULL,
	"actor_id" text,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

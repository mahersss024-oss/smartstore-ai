CREATE TABLE "ai_action_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"conversation_id" integer,
	"order_id" integer,
	"required_permission" varchar(100),
	"allowed" boolean NOT NULL,
	"policy_version" varchar(50) NOT NULL,
	"ai_confidence" numeric(5, 2),
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

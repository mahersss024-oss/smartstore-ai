CREATE TABLE "platform_admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" varchar(100) NOT NULL,
	"organization_id" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

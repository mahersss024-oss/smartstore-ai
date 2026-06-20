CREATE TABLE "channel_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"channel" varchar(50) NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"connection_status" varchar(50) DEFAULT 'not_connected' NOT NULL,
	"ai_mode" varchar(50) DEFAULT 'assist' NOT NULL,
	"config" jsonb,
	"last_synced_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_type" varchar(50) NOT NULL,
	"direction" varchar(50) NOT NULL,
	"body" text NOT NULL,
	"ai_intent" varchar(100),
	"ai_confidence" numeric(5, 2),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" integer,
	"channel" varchar(50) NOT NULL,
	"external_thread_id" text,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"ai_status" varchar(50) DEFAULT 'idle' NOT NULL,
	"last_message_preview" text,
	"last_message_at" timestamp,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_id" integer,
	"order_id" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"source_channel" varchar(50) DEFAULT 'manual' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text,
	"phone" text,
	"email" text,
	"source_channel" varchar(50) DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"last_contact_at" timestamp,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_organization_channel_unique" ON "channel_connections" USING btree ("organization_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_organization_channel_thread_unique" ON "conversations" USING btree ("organization_id","channel","external_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_organization_channel_external_unique" ON "customers" USING btree ("organization_id","source_channel","external_id");
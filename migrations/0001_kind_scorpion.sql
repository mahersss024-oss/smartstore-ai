CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"items" jsonb NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"source" varchar(50) DEFAULT 'whatsapp',
	"assigned_to" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"image" text,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"store_name" text,
	"store_description" text,
	"logo" text,
	"welcome_message" text,
	"working_hours" jsonb,
	"notification_settings" jsonb,
	"currency" varchar(3) DEFAULT 'USD',
	"timezone" varchar(50) DEFAULT 'UTC',
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_organization_id_unique" UNIQUE("organization_id")
);

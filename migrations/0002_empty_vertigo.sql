CREATE TABLE "delivery_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estimated_time" text,
	"config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"payment_status" varchar(50) DEFAULT 'unpaid' NOT NULL,
	"payment_method_id" integer,
	"payment_link" text,
	"sent_to_customer_at" timestamp,
	"approved_by_store_at" timestamp,
	"paid_at" timestamp,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" varchar(50) NOT NULL,
	"type" varchar(50) NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"requires_online_payment" boolean DEFAULT false NOT NULL,
	"supported_currencies" jsonb,
	"supported_delivery_methods" jsonb,
	"config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" varchar(50) DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_method_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_status" varchar(50) DEFAULT 'not_started';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_review_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_confirmation_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_approved_at" timestamp;
ALTER TABLE "ai_action_logs" DROP CONSTRAINT "ai_action_logs_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_action_logs" DROP CONSTRAINT "ai_action_logs_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_reviews" DROP CONSTRAINT "customer_reviews_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_reviews" DROP CONSTRAINT "customer_reviews_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_payment_method_id_payment_methods_id_fk";
--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_method_id_payment_methods_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivery_method_id_delivery_methods_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_organization_id_unique" ON "conversations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_organization_id_unique" ON "customers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_methods_organization_id_unique" ON "delivery_methods" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_organization_id_unique" ON "orders" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_organization_id_unique" ON "payment_methods" USING btree ("organization_id","id");--> statement-breakpoint

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_organization_payment_method_fk"
  FOREIGN KEY ("organization_id", "payment_method_id")
  REFERENCES "payment_methods" ("organization_id", "id")
  ON DELETE SET NULL ("payment_method_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_organization_delivery_method_fk"
  FOREIGN KEY ("organization_id", "delivery_method_id")
  REFERENCES "delivery_methods" ("organization_id", "id")
  ON DELETE SET NULL ("delivery_method_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_organization_order_fk"
  FOREIGN KEY ("organization_id", "order_id")
  REFERENCES "orders" ("organization_id", "id")
  ON DELETE CASCADE
  NOT VALID;--> statement-breakpoint
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_organization_customer_fk"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers" ("organization_id", "id")
  ON DELETE SET NULL ("customer_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_organization_conversation_fk"
  FOREIGN KEY ("organization_id", "conversation_id")
  REFERENCES "conversations" ("organization_id", "id")
  ON DELETE CASCADE
  NOT VALID;--> statement-breakpoint
ALTER TABLE "ai_action_logs"
  ADD CONSTRAINT "ai_action_logs_organization_conversation_fk"
  FOREIGN KEY ("organization_id", "conversation_id")
  REFERENCES "conversations" ("organization_id", "id")
  ON DELETE SET NULL ("conversation_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "ai_action_logs"
  ADD CONSTRAINT "ai_action_logs_organization_order_fk"
  FOREIGN KEY ("organization_id", "order_id")
  REFERENCES "orders" ("organization_id", "id")
  ON DELETE SET NULL ("order_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "customer_reviews"
  ADD CONSTRAINT "customer_reviews_organization_customer_fk"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "customers" ("organization_id", "id")
  ON DELETE SET NULL ("customer_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "customer_reviews"
  ADD CONSTRAINT "customer_reviews_organization_order_fk"
  FOREIGN KEY ("organization_id", "order_id")
  REFERENCES "orders" ("organization_id", "id")
  ON DELETE SET NULL ("order_id")
  NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_order_fk"
  FOREIGN KEY ("organization_id", "order_id")
  REFERENCES "orders" ("organization_id", "id")
  ON DELETE CASCADE
  NOT VALID;--> statement-breakpoint
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_payment_method_fk"
  FOREIGN KEY ("organization_id", "payment_method_id")
  REFERENCES "payment_methods" ("organization_id", "id")
  ON DELETE SET NULL ("payment_method_id")
  NOT VALID;--> statement-breakpoint

ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_organization_payment_method_fk";--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_organization_delivery_method_fk";--> statement-breakpoint
ALTER TABLE "order_events" VALIDATE CONSTRAINT "order_events_organization_order_fk";--> statement-breakpoint
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_organization_customer_fk";--> statement-breakpoint
ALTER TABLE "conversation_messages" VALIDATE CONSTRAINT "conversation_messages_organization_conversation_fk";--> statement-breakpoint
ALTER TABLE "ai_action_logs" VALIDATE CONSTRAINT "ai_action_logs_organization_conversation_fk";--> statement-breakpoint
ALTER TABLE "ai_action_logs" VALIDATE CONSTRAINT "ai_action_logs_organization_order_fk";--> statement-breakpoint
ALTER TABLE "customer_reviews" VALIDATE CONSTRAINT "customer_reviews_organization_customer_fk";--> statement-breakpoint
ALTER TABLE "customer_reviews" VALIDATE CONSTRAINT "customer_reviews_organization_order_fk";--> statement-breakpoint
ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_organization_order_fk";--> statement-breakpoint
ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_organization_payment_method_fk";

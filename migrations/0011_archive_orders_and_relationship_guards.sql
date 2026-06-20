ALTER TABLE "orders" ADD COLUMN "archived_at" timestamp;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fk"
  FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_delivery_method_id_delivery_methods_id_fk"
  FOREIGN KEY ("delivery_method_id") REFERENCES "delivery_methods"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "ai_action_logs"
  ADD CONSTRAINT "ai_action_logs_conversation_id_conversations_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "ai_action_logs"
  ADD CONSTRAINT "ai_action_logs_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "customer_reviews"
  ADD CONSTRAINT "customer_reviews_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "customer_reviews"
  ADD CONSTRAINT "customer_reviews_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE NOT VALID;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_payment_method_id_payment_methods_id_fk"
  FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id")
  ON DELETE SET NULL NOT VALID;

CREATE INDEX "ai_action_logs_organization_conversation_created_idx" ON "ai_action_logs" USING btree ("organization_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_action_logs_organization_order_created_idx" ON "ai_action_logs" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_organization_conversation_created_idx" ON "conversation_messages" USING btree ("organization_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_organization_customer_last_message_idx" ON "conversations" USING btree ("organization_id","customer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "customer_reviews_organization_customer_created_idx" ON "customer_reviews" USING btree ("organization_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_reviews_organization_order_created_idx" ON "customer_reviews" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE INDEX "customers_organization_last_contact_idx" ON "customers" USING btree ("organization_id","last_contact_at");--> statement-breakpoint
CREATE INDEX "invoices_organization_order_idx" ON "invoices" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "order_events_organization_order_created_idx" ON "order_events" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_events_organization_type_created_idx" ON "order_events" USING btree ("organization_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "orders_organization_archived_created_idx" ON "orders" USING btree ("organization_id","archived_at","created_at");--> statement-breakpoint
CREATE INDEX "orders_organization_status_created_idx" ON "orders" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_organization_customer_phone_created_idx" ON "orders" USING btree ("organization_id","customer_phone","created_at");--> statement-breakpoint
CREATE INDEX "orders_organization_customer_email_created_idx" ON "orders" USING btree ("organization_id","customer_email","created_at");--> statement-breakpoint
CREATE INDEX "products_organization_active_sort_idx" ON "products" USING btree ("organization_id","is_active","sort_order");
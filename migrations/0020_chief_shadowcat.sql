CREATE INDEX "ai_action_logs_subscription_usage_idx" ON "ai_action_logs" USING btree ("organization_id","action_type","allowed","created_at","conversation_id");--> statement-breakpoint
CREATE INDEX "customers_organization_created_idx" ON "customers" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_audit_logs_organization_created_idx" ON "platform_admin_audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "products_organization_created_idx" ON "products" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "public_endpoint_rate_limits_expires_idx" ON "public_endpoint_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "store_settings_created_idx" ON "store_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_events_status_updated_idx" ON "webhook_events" USING btree ("status","updated_at");
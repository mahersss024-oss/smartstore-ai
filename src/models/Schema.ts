import { sql } from 'drizzle-orm';
import { boolean, decimal, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

// ============================================
// Products and Services (Generic for any store type)
// ============================================
export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(), // Linked to organization/store
  name: text('name').notNull(), // Product/service name
  description: text('description'), // Optional description
  price: decimal('price', { precision: 10, scale: 2 }).notNull(), // Price
  image: text('image'), // Image URL (optional)
  imageSizeBytes: integer('image_size_bytes').default(0).notNull(),
  category: text('category'), // Category (e.g., meals, drinks, services)
  isActive: boolean('is_active').default(true).notNull(), // Is product active?
  sortOrder: integer('sort_order').default(0), // Display order
  metadata: jsonb('metadata'), // Additional flexible data (JSON)
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('products_organization_active_sort_idx').on(table.organizationId, table.isActive, table.sortOrder),
  index('products_organization_created_idx').on(table.organizationId, table.createdAt),
]);

// ============================================
// Payment Methods configured by each store
// ============================================
export const paymentMethodsTable = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  requiresOnlinePayment: boolean('requires_online_payment').default(false).notNull(),
  supportedCurrencies: jsonb('supported_currencies'),
  supportedDeliveryMethods: jsonb('supported_delivery_methods'),
  config: jsonb('config'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('payment_methods_organization_id_unique').on(table.organizationId, table.id),
  uniqueIndex('payment_methods_organization_provider_unique').on(table.organizationId, table.provider),
]);

// ============================================
// Delivery/Pickup methods configured by store
// ============================================
export const deliveryMethodsTable = pgTable('delivery_methods', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  fee: decimal('fee', { precision: 10, scale: 2 }).default('0').notNull(),
  estimatedTime: text('estimated_time'),
  config: jsonb('config'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('delivery_methods_organization_id_unique').on(table.organizationId, table.id),
  uniqueIndex('delivery_methods_organization_type_unique').on(table.organizationId, table.type),
]);

// ============================================
// Incoming Orders (from WhatsApp or Web)
// ============================================
export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(), // Linked to organization/store
  customerName: text('customer_name'), // Customer name
  customerPhone: text('customer_phone'), // Phone number
  customerEmail: text('customer_email'),
  customerAddress: text('customer_address'),
  items: jsonb('items').notNull(), // Requested items (JSON)
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(), // Total price
  status: varchar('status', { length: 50 }).default('draft').notNull(), // Status: draft, pending_store_review, approved_by_store, sent_to_customer, waiting_payment, confirmed, preparing, completed, cancelled
  paymentStatus: varchar('payment_status', { length: 50 }).default('unpaid').notNull(),
  paymentMethodId: integer('payment_method_id'),
  deliveryMethodId: integer('delivery_method_id'),
  deliveryStatus: varchar('delivery_status', { length: 50 }).default('not_started'),
  notes: text('notes'), // Additional notes
  source: varchar('source', { length: 50 }).default('whatsapp'), // Source: whatsapp, web, phone
  assignedTo: text('assigned_to'), // Assigned employee (optional)
  aiAnalysis: jsonb('ai_analysis'),
  storeReviewNotes: text('store_review_notes'),
  trackingToken: text('tracking_token'),
  customerConfirmationAt: timestamp('customer_confirmation_at', { mode: 'date' }),
  storeApprovedAt: timestamp('store_approved_at', { mode: 'date' }),
  archivedAt: timestamp('archived_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('orders_organization_id_unique').on(table.organizationId, table.id),
  index('orders_organization_archived_created_idx').on(table.organizationId, table.archivedAt, table.createdAt),
  index('orders_organization_status_created_idx').on(table.organizationId, table.status, table.createdAt),
  index('orders_organization_customer_phone_created_idx').on(table.organizationId, table.customerPhone, table.createdAt),
  index('orders_organization_customer_email_created_idx').on(table.organizationId, table.customerEmail, table.createdAt),
]);

// ============================================
// Order event history
// ============================================
export const orderEventsTable = pgTable('order_events', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  orderId: integer('order_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  fromStatus: varchar('from_status', { length: 50 }),
  toStatus: varchar('to_status', { length: 50 }),
  actorType: varchar('actor_type', { length: 50 }).notNull(),
  actorId: text('actor_id'),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('order_events_organization_order_created_idx').on(table.organizationId, table.orderId, table.createdAt),
  index('order_events_organization_type_created_idx').on(table.organizationId, table.eventType, table.createdAt),
]);

// ============================================
// Store Settings (General)
// ============================================
export const storeSettingsTable = pgTable('store_settings', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull().unique(), // Linked to organization (one per org)
  storeName: text('store_name'), // Store name
  storeDescription: text('store_description'), // Store description
  logo: text('logo'), // Store logo
  welcomeMessage: text('welcome_message'), // Automated welcome message
  workingHours: jsonb('working_hours'), // Working hours (JSON)
  notificationSettings: jsonb('notification_settings'), // Notification settings
  currency: varchar('currency', { length: 3 }).default('USD'), // Currency
  timezone: varchar('timezone', { length: 50 }).default('UTC'), // Timezone
  metadata: jsonb('metadata'), // Additional flexible data
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('store_settings_created_idx').on(table.createdAt),
]);

// ============================================
// Platform-level settings controlled by owner admins
// ============================================
export const platformSettingsTable = pgTable('platform_settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ============================================
// External webhook idempotency and retry tracking
// ============================================
export const webhookEventsTable = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  eventId: text('event_id').notNull(),
  eventType: varchar('event_type', { length: 150 }).notNull(),
  status: varchar('status', { length: 50 }).default('processing').notNull(),
  attempts: integer('attempts').default(1).notNull(),
  lastError: text('last_error'),
  metadata: jsonb('metadata'),
  processedAt: timestamp('processed_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('webhook_events_provider_event_unique').on(table.provider, table.eventId),
  index('webhook_events_status_updated_idx').on(table.status, table.updatedAt),
]);

// ============================================
// Durable inbound AI job queue (outbox) for asynchronous customer-message
// processing. The webhook persists a job here and returns immediately; a worker
// claims the job with a processing lease and runs the AI reply pipeline.
// ============================================
export const aiInboundJobsTable = pgTable('ai_inbound_jobs', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(), // whatsapp | web_chat
  externalThreadId: text('external_thread_id'),
  dedupeKey: text('dedupe_key').notNull(), // twilio MessageSid / clientSubmissionId
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending|processing|done|failed|dead
  attempts: integer('attempts').default(0).notNull(),
  leaseToken: text('lease_token'),
  lockedUntil: timestamp('locked_until', { mode: 'date' }),
  lastDispatchedAt: timestamp('last_dispatched_at', { mode: 'date' }),
  nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }),
  lastError: text('last_error'),
  processedAt: timestamp('processed_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('ai_inbound_jobs_org_channel_dedupe_unique').on(
    table.organizationId,
    table.channel,
    table.dedupeKey,
  ),
  index('ai_inbound_jobs_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
  index('ai_inbound_jobs_dispatch_recovery_idx').on(table.status, table.lastDispatchedAt),
  index('ai_inbound_jobs_organization_created_idx').on(table.organizationId, table.createdAt),
  // Supports the per-claim conversation-ordering NOT EXISTS guard and the reaper.
  index('ai_inbound_jobs_ordering_guard_idx').on(
    table.organizationId,
    table.channel,
    table.externalThreadId,
    table.status,
  ),
]);

// ============================================
// Durable public endpoint rate limits
// ============================================
export const publicEndpointRateLimitsTable = pgTable('public_endpoint_rate_limits', {
  id: serial('id').primaryKey(),
  rateLimitKey: text('rate_limit_key').notNull(),
  scope: varchar('scope', { length: 100 }).notNull(),
  count: integer('count').default(1).notNull(),
  windowStartAt: timestamp('window_start_at', { mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  metadata: jsonb('metadata'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('public_endpoint_rate_limits_key_unique').on(table.rateLimitKey),
  index('public_endpoint_rate_limits_expires_idx').on(table.expiresAt),
]);

// ============================================
// Customer profiles collected from channels
// ============================================
export const customersTable = pgTable('customers', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  displayName: text('display_name'),
  phone: text('phone'),
  email: text('email'),
  sourceChannel: varchar('source_channel', { length: 50 }).default('manual').notNull(),
  externalId: text('external_id'),
  lastContactAt: timestamp('last_contact_at', { mode: 'date' }),
  metadata: jsonb('metadata'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('customers_organization_created_idx').on(table.organizationId, table.createdAt),
  index('customers_organization_last_contact_idx').on(table.organizationId, table.lastContactAt),
  uniqueIndex('customers_organization_id_unique').on(table.organizationId, table.id),
  uniqueIndex('customers_organization_channel_external_unique').on(table.organizationId, table.sourceChannel, table.externalId),
]);

// ============================================
// Channel integrations configured by each store
// ============================================
export const channelConnectionsTable = pgTable('channel_connections', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  channel: varchar('channel', { length: 50 }).notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').default(false).notNull(),
  connectionStatus: varchar('connection_status', { length: 50 }).default('not_connected').notNull(),
  aiMode: varchar('ai_mode', { length: 50 }).default('assist').notNull(),
  config: jsonb('config'),
  lastSyncedAt: timestamp('last_synced_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('channel_connections_organization_channel_unique').on(table.organizationId, table.channel),
  // Inbound Twilio webhooks look up the store by config->>'twilioWhatsAppFrom'.
  // Without this expression index every inbound message scans all active
  // whatsapp connections (a pre-auth full scan that does not scale to many stores).
  index('channel_connections_whatsapp_from_idx')
    .on(sql`(${table.config} ->> 'twilioWhatsAppFrom')`)
    .where(sql`${table.channel} = 'whatsapp' AND ${table.isActive} = true`),
]);

// ============================================
// AI-assisted conversations with customers
// ============================================
export const conversationsTable = pgTable('conversations', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  customerId: integer('customer_id'),
  channel: varchar('channel', { length: 50 }).notNull(),
  externalThreadId: text('external_thread_id'),
  status: varchar('status', { length: 50 }).default('open').notNull(),
  aiStatus: varchar('ai_status', { length: 50 }).default('idle').notNull(),
  lastMessagePreview: text('last_message_preview'),
  lastMessageAt: timestamp('last_message_at', { mode: 'date' }),
  metadata: jsonb('metadata'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('conversations_organization_customer_last_message_idx').on(table.organizationId, table.customerId, table.lastMessageAt),
  uniqueIndex('conversations_organization_id_unique').on(table.organizationId, table.id),
  uniqueIndex('conversations_organization_channel_thread_unique').on(table.organizationId, table.channel, table.externalThreadId),
]);

export const conversationMessagesTable = pgTable('conversation_messages', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  conversationId: integer('conversation_id').notNull(),
  senderType: varchar('sender_type', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 50 }).notNull(),
  body: text('body').notNull(),
  aiIntent: varchar('ai_intent', { length: 100 }),
  aiConfidence: decimal('ai_confidence', { precision: 5, scale: 2 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('conversation_messages_organization_conversation_created_idx').on(table.organizationId, table.conversationId, table.createdAt),
]);

// ============================================
// AI action audit log
// ============================================
export const aiActionLogsTable = pgTable('ai_action_logs', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  conversationId: integer('conversation_id'),
  orderId: integer('order_id'),
  requiredPermission: varchar('required_permission', { length: 100 }),
  allowed: boolean('allowed').notNull(),
  policyVersion: varchar('policy_version', { length: 50 }).notNull(),
  aiConfidence: decimal('ai_confidence', { precision: 5, scale: 2 }),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('ai_action_logs_subscription_usage_idx').on(
    table.organizationId,
    table.actionType,
    table.allowed,
    table.createdAt,
    table.conversationId,
  ),
  index('ai_action_logs_organization_conversation_created_idx').on(table.organizationId, table.conversationId, table.createdAt),
  index('ai_action_logs_organization_order_created_idx').on(table.organizationId, table.orderId, table.createdAt),
]);

// ============================================
// Customer reviews requested after completion
// ============================================
export const customerReviewsTable = pgTable('customer_reviews', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  customerId: integer('customer_id'),
  orderId: integer('order_id'),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  sourceChannel: varchar('source_channel', { length: 50 }).default('manual').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('customer_reviews_organization_customer_created_idx').on(table.organizationId, table.customerId, table.createdAt),
  index('customer_reviews_organization_order_created_idx').on(table.organizationId, table.orderId, table.createdAt),
  uniqueIndex('customer_reviews_organization_order_customer_unique').on(
    table.organizationId,
    table.orderId,
    table.customerId,
  ),
]);

// ============================================
// Draft and final invoices generated from orders
// ============================================
export const invoicesTable = pgTable('invoices', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  orderId: integer('order_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  status: varchar('status', { length: 50 }).default('draft').notNull(),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).default('0').notNull(),
  tax: decimal('tax', { precision: 10, scale: 2 }).default('0').notNull(),
  discount: decimal('discount', { precision: 10, scale: 2 }).default('0').notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: varchar('payment_status', { length: 50 }).default('unpaid').notNull(),
  paymentMethodId: integer('payment_method_id'),
  paymentLink: text('payment_link'),
  sentToCustomerAt: timestamp('sent_to_customer_at', { mode: 'date' }),
  approvedByStoreAt: timestamp('approved_by_store_at', { mode: 'date' }),
  paidAt: timestamp('paid_at', { mode: 'date' }),
  metadata: jsonb('metadata'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('invoices_organization_order_idx').on(table.organizationId, table.orderId),
]);

// ============================================
// Phone OTP verifications for web customer identity
// ============================================
export const phoneVerificationsTable = pgTable('phone_verifications', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  sessionId: text('session_id').notNull(),
  phone: text('phone').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending | approved | expired
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  verifiedAt: timestamp('verified_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  uniqueIndex('phone_verifications_org_session_phone_unique').on(table.organizationId, table.sessionId, table.phone),
  index('phone_verifications_expires_idx').on(table.expiresAt),
]);

// ============================================
// Platform admin audit log
// ============================================
export const platformAdminAuditLogsTable = pgTable('platform_admin_audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  organizationId: text('organization_id').notNull(),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => [
  index('platform_admin_audit_logs_organization_created_idx').on(
    table.organizationId,
    table.createdAt,
  ),
]);

# AI Store Employee Roadmap

SmartStore AI will evolve into an AI store employee for each store. The AI does not manage the platform. It serves only the store it is attached to, inside that store's organization boundary.

## Product Vision

The AI store employee should welcome customers, understand what they want, recommend products, show relevant product images, build a cart, confirm the order with the customer, send it to the store for review, follow the order status until pickup or delivery is completed, then request and store a customer review.

The store owner remains in control. The AI can automate low-risk work and prepare higher-risk changes for approval.

## Operating Model

- Clerk handles user identity, teams, and organizations.
- Stripe handles plans, subscriptions, and add-ons.
- SmartStore AI owns store operations, conversations, orders, product catalog, and service workflows.
- The AI store employee is scoped to one `organizationId`.
- The AI cannot access other stores, platform administration, billing changes, team permissions, or payment credentials.

## Store-Scoped AI Context

The AI must read only the current store's data. Every AI request must be scoped by `organizationId`.

Allowed AI context:

- Store profile:
  - Store name
  - Store description
  - Business type
  - Welcome message
  - Tone settings
  - Language and local dialect settings
  - Currency
  - Timezone
  - Location
  - Delivery and pickup rules
- Catalog:
  - Active products for the same store
  - Product names, descriptions, prices, categories, images, availability, and tags
  - Matching or recommended products only when possible
- Customer context:
  - Current conversation
  - Current cart
  - Customer details already provided in this store
  - Prior orders in this store only when needed
- Store knowledge:
  - Policies
  - FAQs
  - Working hours
  - Delivery areas
  - Payment instructions that are safe to show customers

Forbidden AI context:

- Other stores' data
- Platform admin data
- Billing management actions
- Payment credentials or secrets
- Team permissions
- Customers or orders from another `organizationId`

The AI should receive a minimal context bundle instead of unrestricted database access.

## Store-Owned AI Settings

Each store controls the basic settings for its own AI employee. The platform provides defaults, but the store owner decides how the AI behaves with customers and what it is allowed to do inside the store.

Platform-owned AI configuration:

- System prompt and safety rules
- Supported language list
- Supported local dialect list
- Dialect quality rules
- Fallback language rules
- Forbidden AI actions
- Tool permissions and action validation
- Prompt and policy versioning
- Subscription-based usage limits
- Store isolation rules by `organizationId`

The platform defines the allowed dialects. The store chooses from those allowed options. Stores cannot write free-form system instructions that override platform safety rules.

Initial supported dialect options:

- Professional Arabic
- Saudi Arabic
- Gulf Arabic
- Emirati Arabic
- Kuwaiti Arabic
- Egyptian Arabic
- Levantine Arabic
- Moroccan Arabic
- English

Dialect rules:

- The AI should use the selected store dialect only when it improves customer experience.
- Product names, prices, addresses, phone numbers, and order confirmations must stay clear and unambiguous.
- If the customer uses another supported language, the AI may switch to the customer's language.
- If dialect confidence is low, the AI should fall back to professional Arabic or English based on store settings.
- The AI must not imitate protected identities, real people, or offensive speech styles.

Core AI settings controlled by the store:

- AI enabled or disabled
- Customer-facing welcome message
- AI display name, such as "SmartStore Assistant" or a custom employee name
- Response tone:
  - Professional
  - Friendly
  - Concise
  - Premium
  - Local dialect where appropriate
- Supported customer languages
- Local dialect behavior:
  - Use the dialect of the store country or target market when enabled
  - Let the store choose country, dialect, and fallback language
  - Keep product names, prices, addresses, and order confirmations clear even when using dialect
  - Switch to the customer's language when the customer clearly uses another language
  - Fall back to professional Arabic or English when the dialect is unknown or confidence is low
- Selling style:
  - Helpful only
  - Light upsell
  - Active recommendations
  - No upsell
- Product recommendation rules:
  - Recommend alternatives
  - Recommend add-ons
  - Recommend bundles
  - Hide unavailable products
- Order rules:
  - Require explicit customer confirmation
  - Ask for phone number
  - Ask for address only when delivery is selected
  - Ask for pickup time when needed
  - Allow notes and special instructions
- Handoff rules:
  - Transfer to store staff when confidence is low
  - Transfer when customer asks for a human
  - Transfer for complaints or refund requests
- AI permissions:
  - Reply to customers
  - Recommend products
  - Build carts
  - Create orders after customer confirmation
  - Request reviews
  - Suggest catalog improvements
  - Suggest store setup improvements
- Approval requirements:
  - Apply setup changes only after owner approval
  - Apply product edits only after owner approval
  - Never change billing, team permissions, or payment credentials

The dashboard should expose these settings in a clear AI employee settings page. The store should be able to test changes in simulation mode before publishing them to customers.

## Core Customer Journey

1. Customer opens the store chat from the public store page or WhatsApp.
2. AI sends the store welcome message.
3. Customer describes what they want.
4. AI searches the store catalog and recommends matching products.
5. AI shows product names, prices, short descriptions, and images.
6. Customer adds products or asks for alternatives.
7. AI builds a cart with quantities, notes, delivery preference, and customer details.
8. AI summarizes the order and asks for customer confirmation.
9. Confirmed order is created as `pending_store_review`.
10. Store reviews, accepts, modifies, or rejects the order.
11. AI informs the customer of the store response.
12. AI follows order status until pickup, delivery, or completion.
13. AI asks for a rating and captures review feedback.

## Current Implementation Status

As of 2026-06-08, the web-order AI employee loop is implemented for the
limited-pilot path:

- Store readiness, AI settings, knowledge base, catalog quality, AI visibility,
  and platform policy controls are in place.
- Web chat is the primary customer channel and uses the shared conversation
  engine.
- Product selection, cart state, fulfillment, payment, location, confirmation,
  order creation, store review, status updates, and review capture are handled
  through system-controlled actions.
- Checkout system actions persist final visible action state after model reply
  analysis, preventing stale metadata from reopening completed steps.
- AI guards and repair flow block unsafe facts, unsupported prices, broken
  language/encoding, privacy leaks, repeated greetings, and repeated completed
  checkout prompts.
- Production smoke testing and live web-order checkout verification have passed
  against `https://www.smartstore-ai.com`.

The next implementation focus is not a new customer feature. The highest-value
work is expanded E2E coverage, internal AI orchestration analytics, external
monitoring, and gradual modularization of `AIEmployeeAgent.ts` and
`WebOrderChat.tsx`.

## Development Phases

### Phase 1: Store Readiness Foundation

- Require each store to complete its operating profile:
  - Store name
  - Store description
  - Business type
  - Currency
  - Timezone
  - Welcome message
  - Location and pickup instructions
  - Delivery methods
  - Payment methods
- Improve launch readiness checks so the store cannot enable customer AI until the catalog and settings are usable.
- Make missing setup items actionable from the dashboard.

### Phase 1A: Platform AI Policy

Build the platform-owned AI policy layer before any customer-facing AI conversations.

This phase defines the rules that every store AI employee must follow. Stores can customize behavior inside these limits, but cannot override platform safety, store isolation, or billing boundaries.

Required platform AI policy:

- System prompt templates owned by the platform
- Prompt and policy versioning
- Supported language list
- Supported local dialect list
- Dialect quality and fallback rules
- Store isolation rules by `organizationId`
- Forbidden actions:
  - Billing changes
  - Payment credential changes
  - Team permission changes
  - Cross-store access
  - Destructive deletion
  - Platform admin actions
- Structured AI action schema:
  - `reply`
  - `recommend_products`
  - `update_cart`
  - `request_customer_details`
  - `create_order_after_confirmation`
  - `request_store_approval`
  - `request_human_handoff`
- Validation rules for every AI action before database writes.
- Safe fallback behavior when AI confidence is low, context is missing, or usage limits are reached.

### Phase 1B: AI Store Setup Assistant

After a store subscribes, the AI should help the owner prepare the store for customer-facing AI.

The assistant should serve the store only. It should not manage platform settings or billing.

Setup assistant capabilities:

- Ask the owner about the store type, products, service area, and operating style.
- Suggest a store description.
- Suggest a welcome message.
- Suggest customer-facing tone settings.
- Suggest product categories.
- Suggest initial FAQs.
- Suggest delivery and pickup instructions.
- Suggest store policies.
- Identify missing setup items before AI is published to customers.
- Improve product descriptions.
- Suggest product tags for better recommendations.
- Prepare draft products from owner-provided text or CSV.

Approval model:

- The assistant may suggest changes.
- The assistant may save drafts.
- The assistant may apply low-risk settings only when the owner explicitly approves.
- Price changes, payment settings, deletion, team access, billing, and platform controls require blocking or explicit owner approval.

Example setup flow:

1. Owner subscribes to a paid plan.
2. The dashboard opens "Prepare your AI store employee".
3. AI asks what the store sells and how it operates.
4. AI drafts profile, welcome message, categories, FAQs, and policies.
5. Owner reviews and applies approved changes.
6. Store readiness score updates.
7. Customer AI can be published only when required checks pass.

### Phase 1C: AI Employee Settings

Add a dedicated dashboard page for the store owner to configure the AI employee.

Required settings:

- Enable customer AI
- Welcome message
- AI employee name
- Tone
- Languages
- Country and local dialect
- Dialect fallback language
- Sales style
- Recommendation behavior
- Customer data collection rules
- Human handoff rules
- Review request behavior
- Store-scoped AI permissions
- Approval rules for AI-suggested setup and catalog changes

The settings page should include:

- A live preview of how the AI will greet customers.
- A simulation chat for testing before publishing.
- A readiness warning if required store data is missing.
- A clear "Publish AI to customers" action.

### Phase 1D: Store Knowledge Base

Add store-owned knowledge that the AI can read safely when serving customers.

Required knowledge fields:

- FAQs
- Working hours
- Delivery areas
- Delivery fees or delivery notes
- Pickup instructions
- Return and refund policy
- Warranty or exchange policy when applicable
- Safe payment instructions shown to customers
- Store-specific service notes

Knowledge base rules:

- Every knowledge item is scoped by `organizationId`.
- The AI can quote or summarize store-approved knowledge.
- The AI should not invent policies when knowledge is missing.
- The dashboard should show missing knowledge as readiness warnings.
- Sensitive secrets, payment credentials, and private staff notes must never be included.

### Phase 2A: Catalog Quality

- Strengthen product fields:
  - Name
  - Description
  - Price
  - Category
  - Image
  - Availability
  - Sort order
  - Optional tags
- Add simple catalog search by name, category, and description.
- Add product recommendation rules:
  - Related products
  - Popular products
  - Alternatives
  - Add-ons or complementary items
- Track whether a product can be suggested by AI.
- Add sales intelligence before the web chat UI:
  - Understand occasion, taste, budget, and preference signals
  - Rank products by contextual fit, not only keyword matches
  - Attach a short sales reason to each recommendation
  - Keep unavailable-product alternatives professional and non-repetitive

### Phase 2B: Order Status Constants And Events

Centralize order state before customer AI starts creating or following orders.

Required order status constants:

- `pending_store_review`
- `approved_by_store`
- `waiting_payment`
- `confirmed`
- `preparing`
- `ready_for_pickup`
- `out_for_delivery`
- `completed`
- `cancelled`

Required order events:

- Order created by customer confirmation
- Order submitted for store review
- Store approved order
- Store modified order
- Store rejected order
- Customer confirmed modified order
- Payment marked as waiting or received when applicable
- Order marked as preparing
- Order marked as ready for pickup
- Order marked as out for delivery
- Order marked as completed
- Review requested
- Review received

Order workflow rules:

- Prevent invalid transitions, such as moving a cancelled order to preparing.
- Require customer confirmation before creating an order for store review.
- Require customer confirmation again if the store modifies the order.
- Every status update should create an internal order event.
- Customer-facing notifications should be generated from order events.
- Review request should be triggered only once after completion.

Customer payment decision:

- Stripe remains only for platform subscriptions and add-ons.
- Store-customer payment is separate from platform billing.
- The first AI order milestone keeps customer payment handling
  provider-independent until the automated payment scope is enabled.
- Online customer payment links, wallets, and gateway-backed payments are reserved as inactive infrastructure and can be activated later as a separate store payment phase.

### Phase 2C: AI Permission Enforcement And Audit Log

Add the minimum permission and audit layer before the conversation engine can write actions.

Required enforcement:

- Store-scoped AI permissions
- Action validation before writes
- Owner approval requirements for setup and catalog changes
- Human handoff triggers
- Public endpoint rate limits
- Message length limits
- Usage limit checks by subscription plan

Required audit log:

- `organizationId`
- Action type
- Conversation id
- Order id when applicable
- Before and after values
- Whether owner approval was required
- Approved by
- Prompt or policy version
- Timestamp

This phase protects the system before the AI is allowed to create carts, orders, or customer-facing messages.

### Phase 3: Conversation Engine

- Replace keyword-only AI logic with a structured AI conversation service.
- Use one engine for all channels:
  - Web chat
  - WhatsApp
  - Future channels
- Store conversation state in `conversations.metadata`.
- Store every inbound and outbound message in `conversation_messages`.
- Return structured actions from AI, not only free text:
  - `reply`
  - `recommendedProducts`
  - `cartUpdates`
  - `missingDetails`
  - `nextStep`
  - `requiresStoreApproval`

### Phase 4: Web Chat Experience

- Replace the public web order form with a chat-first experience.
- Keep a fallback manual form if AI is disabled.
- Add:
  - Customer messages
  - AI messages
  - Product cards with images and prices
  - Add/remove quantity controls
  - Cart summary
  - Confirm order action
  - Customer details collection
- Make the chat mobile-first and fast for repeated ordering.

### Phase 5: Cart And Order Confirmation

- Store cart state in conversation metadata.
- Support:
  - Add item
  - Remove item
  - Change quantity
  - Item notes
  - Delivery or pickup preference
  - Customer name and phone
  - Address when needed
- Create an order only after the customer explicitly confirms.
- The order should start as `pending_store_review`.

### Phase 6: Store Review Workflow

- Store owner sees AI-created orders in the dashboard.
- Store can:
  - Approve
  - Modify
  - Reject
  - Request more information
  - Mark unavailable items
- Store response creates a conversation message back to the customer.
- If the store modifies the order, customer confirmation is required again.

### Phase 7: Order Status Follow-Up

- Add clear order milestones:
  - `pending_store_review`
  - `approved_by_store`
  - `waiting_payment`
  - `confirmed`
  - `preparing`
  - `ready_for_pickup`
  - `out_for_delivery`
  - `completed`
  - `cancelled`
- AI sends customer updates when important status changes happen.
- Keep all updates in the same conversation thread.

### Phase 8: Reviews And Retention

- After completion, AI requests a rating.
- Capture:
  - Rating
  - Comment
  - Channel
  - Matched order
  - Customer
- Add owner dashboard summaries:
  - Average rating
  - Recent complaints
  - Repeat customers
  - Suggested improvements

### Phase 9: WhatsApp Channel

- Add WhatsApp as a channel adapter after web chat is stable.
- Connect a WhatsApp Business provider.
- Map WhatsApp phone identifiers to `organizationId`.
- Support:
  - Inbound messages
  - Outbound text
  - Product images
  - Interactive lists or buttons where available
  - 24-hour messaging window rules
  - Approved templates for follow-ups outside the active window
- Reuse the same conversation engine used by web chat.

### Phase 10: Advanced AI Store Operations Permissions

The AI serves the store, not the platform.

Expand permission settings per store after the first web chat and order workflow are stable:

- Reply to customers
- Recommend products
- Create draft carts
- Create orders after customer confirmation
- Request customer details
- Request reviews
- Suggest product edits
- Draft product descriptions
- Hide unavailable products with owner approval
- Update welcome message with owner approval
- Update working hours with owner approval

Blocked or approval-only actions:

- Delete products
- Change payment credentials
- Change billing or subscription
- Manage team members
- Access other stores
- Delete customers or orders
- Apply large price changes without owner approval

### Phase 11: Expanded Audit And Safety

- Expand the AI action log after the minimum audit layer is live.
- Add deeper review tools for store owners and platform operators.
- Add structured logs for AI decisions, tool calls, blocked actions, and handoffs.
- Add retry handling for outbound customer notifications.
- Add idempotency keys for AI action processing and order events.
- Add health checks for database, Stripe, Clerk, AI provider, and channel providers.
- Add monitoring alerts for webhook failures, AI error rates, and notification delivery failures.

### Phase 12: Analytics And Quality

- Track:
  - Conversations started
  - Products recommended
  - Carts created
  - Orders confirmed by customer
  - Orders approved by store
  - Conversion rate
  - Average response time
  - Review score
  - AI handoff rate
- Use these metrics in the dashboard and in subscription value reporting.

### Phase 13: Store Staff App

Add a lightweight external staff app for store owners and employees who only need to review and update orders quickly.

The staff app should not manage the platform. It serves one store at a time and must be scoped by `organizationId`.

Staff app capabilities:

- View pending AI-created orders
- Approve an order
- Modify an order before approval
- Reject an order with a reason
- Mark order as preparing
- Mark order as ready for pickup
- Mark order as out for delivery
- Mark order as completed
- Add internal notes for the store team

Required platform APIs:

- `GET /api/store/orders`
- `POST /api/store/orders/:id/approve`
- `POST /api/store/orders/:id/reject`
- `POST /api/store/orders/:id/status`
- `POST /api/store/orders/:id/notes`

Security requirements:

- Authenticate the external app.
- Scope every request to the store organization.
- Enforce store employee permissions.
- Never expose platform admin controls.
- Never expose another store's orders.
- Log every status change.

Staff app order automation:

- Staff app status changes should reuse the same order event system from Phase 2B.
- Important events should create customer-facing conversation messages.
- The AI store employee should notify the customer when the order is approved, modified, rejected, ready for pickup, out for delivery, or completed.
- When the order becomes `completed`, the AI should request a review from the customer.

This phase prepares SmartStore AI for a future mobile app or compact staff dashboard without duplicating the full store dashboard.

## Professional Additions

- Owner-controlled AI tone: formal, friendly, concise, premium.
- Owner-controlled local dialect based on the store country or target market.
- Store-specific sales rules.
- Product availability controls.
- Customer handoff to human staff.
- Conversation summary for store staff.
- Internal notes per order.
- Suggested upsells and bundles.
- Customer repeat-order detection.
- AI confidence score.
- AI disabled fallback flow.
- Per-channel usage limits by subscription plan.
- External staff app for fast order confirmation and status updates.
- Event-driven customer notifications.

## Pre-Development Hardening Checklist

Before building the advanced AI employee, the platform should close the gaps below so new features are built on a reliable foundation.

### Data Model Quality

- Replace free-form status strings with shared constants or enums for orders, invoices, payments, delivery, conversations, and AI states.
- Add validation schemas for all customer-facing and store-facing writes.
- Add indexes for high-traffic queries:
  - Products by `organizationId`, `isActive`, and `category`
  - Orders by `organizationId`, `status`, and `createdAt`
  - Conversations by `organizationId`, `channel`, and `externalThreadId`
  - Customers by `organizationId`, phone, email, and external id
- Add soft-delete or archive fields for products, customers, and orders where deletion would lose business history.
- Add order event history instead of relying only on the latest status.

### Store Setup Quality

- Add a store readiness score with clear pass/fail checks.
- Block customer AI activation until required setup is complete.
- Add a guided setup flow for:
  - Store profile
  - Catalog
  - Delivery and pickup
  - Payment options
  - AI behavior
- Add a preview mode where the owner can see the public store and AI chat before publishing.

### Catalog Readiness

- Add AI visibility controls per product.
- Add product availability controls.
- Add optional product tags for search and recommendations.
- Add product options support for future variants:
  - Size
  - Color
  - Add-ons
  - Special instructions
- Add bulk import validation with a clear error report.
- Add image optimization or compression for uploaded images.

### AI Safety And Control

- [x] Add simulation mode before publishing AI to customers.
- Add human handoff when confidence is low or the customer asks for a person.
- Add AI confidence score to every AI decision.
- Add store-scoped AI permissions.
- Add store-scoped AI context loading with strict `organizationId` filtering.
- [x] Add owner approval queue for AI-suggested store changes.
- Add forbidden actions that AI can never perform:
  - Billing changes
  - Payment credential changes
  - Team permission changes
  - Cross-store access
  - Destructive deletion
- Add prompt and policy versioning so behavior changes are traceable.

### Conversation Quality

- Add conversation summaries for store staff.
- Add customer identity matching across web and WhatsApp.
- Add repeat-order support.
- Add structured cart state.
- Add missing-information prompts instead of failed order creation.
- Add clear fallback messages when AI is disabled or limits are reached.
- Add support for multilingual conversations based on customer language.
- Add support for country-specific local dialects controlled by the store.
- Add fallback rules from dialect to professional Arabic or English when needed.

### Order Workflow Reliability

- Add order event table and status transition rules.
- Prevent invalid transitions, such as moving a cancelled order to preparing.
- Require customer confirmation before creating an order for store review.
- Require customer confirmation again if the store modifies the order.
- Add internal store notes that are never sent to the customer.
- Add customer-facing status updates generated from order events.
- Trigger review request only once after completion.

### Channel Architecture

- [x] Keep one conversation engine shared by all channels.
- Build channel adapters:
  - Web chat adapter
  - WhatsApp adapter
  - Future staff app adapter
- Normalize inbound messages into one internal message format.
- Normalize outbound messages into channel-specific formats.
- Add channel capability detection:
  - Text
  - Image
  - Buttons
  - Lists
  - Templates
- Add WhatsApp 24-hour window handling and approved templates.

### Security And Privacy

- Enforce `organizationId` scoping in every query and mutation.
- [x] Add rate limits for public endpoints.
- Add bot/spam protection for public web chat.
- Add webhook signature verification for all external providers.
- Add API authentication for the future staff app.
- Add audit logs for AI actions, staff actions, and platform admin actions.
- Avoid storing secrets in metadata fields.
- Review privacy policy for chat, order, address, and review data.

### Billing And Limits

- Define what consumes AI usage:
  - Confirmed AI orders
  - Qualified conversations
  - Optional message credits later
- Show usage clearly in the subscription page.
- Add graceful behavior when limits are reached.
- Make add-ons instantly reflected in entitlements.
- Add billing event tests for plan activation, add-ons, cancellation, and expiry.

### Reliability And Operations

- Add structured logs around:
  - Webhooks
  - AI decisions
  - Order status changes
  - Payment callbacks
  - Channel delivery failures
- Add retry handling for outbound customer notifications.
- Add idempotency keys for webhooks and order event processing.
- Add health checks for database, Stripe, Clerk, and channel providers.
- Add background job support before adding heavy notification workflows.
- Add monitoring alerts for webhook failures and AI error rates.

### Testing Strategy

- Add unit tests for entitlement calculations.
- Add unit tests for order status transition rules.
- Add integration tests for Stripe webhook sync.
- Add integration tests for AI order creation.
- Add e2e tests for:
  - Store setup
  - Product creation with image storage limit
  - Public customer order flow
  - Store approval flow
  - Review request flow
- Add channel adapter contract tests before WhatsApp integration.

### Product Analytics

- Track conversion funnel:
  - Chat opened
  - Product recommended
  - Product added to cart
  - Order confirmed by customer
  - Order approved by store
  - Order completed
  - Review submitted
- Track AI quality:
  - Low-confidence replies
  - Human handoffs
  - Failed recommendations
  - Abandoned carts
- Show store-level analytics without exposing platform-wide data.

### Launch Readiness Definition

The platform is ready for the first AI chat milestone when:

- Store setup checks are enforced.
- Catalog search is reliable.
- Order statuses and transitions are centralized.
- AI permissions are defined.
- Public endpoints are rate-limited.
- Stripe entitlements are tested.
- Product image storage is tested.
- The dashboard can receive and review AI-created orders.
- There is a clear fallback when AI is disabled, unavailable, or over limit.

## First Implementation Milestone

The first milestone should deliver a working web chat:

- Customer opens web chat.
- AI welcomes them.
- AI suggests products from the store catalog.
- Product cards include images.
- Customer adds items to cart.
- AI summarizes the order.
- Customer confirms.
- Order appears in store dashboard as `pending_store_review`.

This milestone proves the core loop before WhatsApp and advanced automation are added.

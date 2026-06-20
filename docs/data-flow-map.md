# Data Flow Map

Generated: 2026-06-08

## Customer chat/order flow

1. Customer opens smart link or web-order page.
2. Public page loads store settings, active payment methods, delivery methods, branding, QR, and feedback panel.
3. Customer message or UI event is submitted through `WebChatActions`.
4. Public endpoint validates body size, schema, rate limits, store feature flags, and subscription state.
5. `AIEmployeeAgent` loads trusted store context and conversation context from the database.
6. Product matching, cart mutation, checkout completeness, order lifecycle, and visible system actions are computed server-side.
7. Model reply is generated.
8. Reply guard pipeline validates deterministic privacy/price/encoding checks and semantic review.
9. If needed, model repair rewrites the reply using trusted facts only.
10. Response and messages are persisted and returned to the customer UI.

## Dashboard order flow

1. Store staff authenticates with Clerk and active organization.
2. Dashboard page queries only rows scoped to `auth().orgId`.
3. Server action validates order id plus `organization_id`.
4. Status change writes order event and updates order/invoice state.
5. Customer conversation writer sends safe customer-visible status update when applicable.

## Webhook flow

1. Provider sends webhook.
2. Route verifies signature/raw body.
3. `WebhookIdempotency` ensures one processing lease per provider event id.
4. Handler synchronizes Stripe billing or Clerk organization state.
5. Processing status is marked processed or failed for retry safety.


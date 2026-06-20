# Phase 4: WhatsApp Production Flow Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

WhatsApp source flow and unit-level route coverage are stronger after this
phase, but production WhatsApp cannot be certified while D-0003 and D-0004
remain open and live Meta-to-production runtime evidence is unavailable.

## Source Trace

### Meta webhook verification request

Source evidence:

- `src/app/api/twilio/webhook/route.ts`

Behavior:

- `GET` reads `hub.mode`, `hub.challenge`, and `hub.verify_token`.
- It loads `runtimeConfig.whatsapp.webhookVerifyToken`.
- It returns the challenge only when mode is `subscribe` and token comparison
  succeeds through `secureTokenEquals`.

Test evidence:

- `src/app/api/twilio/webhook/route.test.ts` verifies successful challenge
  response.

### Meta webhook message request and signature verification

Source evidence:

- `POST` in `src/app/api/twilio/webhook/route.ts`
- `verifyWhatsAppSignature` in `src/libs/TwilioWhatsApp.ts`

Behavior:

- Reads raw body with a 256 KB limit.
- Verifies `x-hub-signature-256` against the configured app secret.
- Rejects invalid signatures with HTTP 401.
- Rejects malformed JSON with HTTP 400.

Test evidence:

- `TwilioWhatsApp.test.ts` verifies valid and invalid Meta signatures.
- `route.test.ts` verifies invalid signature does not enter idempotency
  processing.

### Idempotency and conversation lock

Source evidence:

- `runWebhookEventOnce` and `acquireWebhookProcessingLock` in
  `src/libs/WebhookIdempotency.ts`
- Usage in `src/app/api/twilio/webhook/route.ts`

Behavior:

- Each incoming WhatsApp `messageId` is processed through provider-level
  idempotency.
- Each customer thread uses a separate `whatsapp_thread_lock` event ID based on
  `twilioWhatsAppFrom` and customer phone.
- If a customer sends another message while the previous reply is processing,
  processing is skipped and no AI/outbound send occurs.

Test evidence:

- `WebhookIdempotency.test.ts` covers duplicate, processing, failed, retry, and
  lock behavior.
- `route.test.ts` verifies parallel same-thread processing is skipped.

### Store connection and tenant routing

Source evidence:

- `findWhatsAppStoreConnection` in `src/libs/TwilioWhatsApp.ts`
- `route.ts` passes `connection.organizationId` into `sendWebChatMessage`.

Behavior:

- Incoming `twilioWhatsAppFrom` resolves the active store channel connection.
- Store access token is decrypted from the store connection config.
- Messages without a matching active store connection are skipped and do not
  call the AI engine or outbound Meta send.

Test evidence:

- `route.test.ts` verifies store-connection-not-found skips AI and outbound
  sends.
- `TwilioWhatsApp.test.ts` verifies different customers on one store phone
  number get different external thread IDs.

### AI, guardrails, product, cart, checkout, and order progression

Source evidence:

- `route.ts` routes WhatsApp input through `sendWebChatMessage`.
- `WebChatActions.ts` calls `handleCustomerMessageWithAIEmployee`.
- `AIEmployeeAgent.ts` owns AI orchestration, guardrail invocation, cart/order
  state, reviews, and complaints.
- `TwilioWhatsApp.ts` maps interactive WhatsApp replies into canonical
  `semanticHints`.

Behavior:

- Normal WhatsApp text is sent as normal customer text.
- Interactive product, cart, fulfillment, payment, and confirmation replies are
  converted to the same system semantic hints used by web-order UI actions.
- WhatsApp outbound replies include list/buttons for product selection, cart
  controls, payment choices, fulfillment choices, final confirmation, restore
  cart, and review ratings.

Test evidence:

- `TwilioWhatsApp.test.ts` covers product replies, cart quantity/remove/restore,
  fulfillment, payment, confirmation, review rating, location sharing, product
  list messages, cart summary, final confirmation, and normalized cart metadata.

### Order status notification and review request

Source evidence:

- `src/features/dashboard/OrderActions.ts`
- `sendWhatsAppConversationTextMessage`
- `sendWhatsAppConversationReviewRequestMessage`

Behavior:

- Dashboard order actions send WhatsApp status notifications when the order
  came from a WhatsApp conversation.
- Completed orders can send a WhatsApp interactive review list instead of an
  external tracking link.

Test evidence:

- `TwilioWhatsApp.test.ts` verifies review request payload is a WhatsApp list
  message and does not contain `/track/`.

### Review and complaint capture

Source evidence:

- `AIEmployeeAgent.ts`
- `AIEmployeeOrderLifecycle.ts`
- `customerReviewsTable`
- `orderEventsTable` with `ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT`

Behavior:

- WhatsApp review ratings map to `dialogueState: 'review'` and referenced
  order ID.
- AI review capture writes `customer_reviews`.
- WhatsApp complaint/review text without a rating can create an order event
  with `CUSTOMER_COMPLAINT` and source `whatsapp_chat_feedback`.
- Customer detail page reads reviews from `customer_reviews` and feedback from
  `order_events`, not only chat messages.

Test evidence:

- `TwilioWhatsApp.test.ts` covers review rating semantic hints.
- Phase 3 source trace confirmed customer detail feedback/review sections read
  scoped dedicated records.

### Outbound send and failure handling

Source evidence:

- `sendWhatsAppMessagePayload` in `src/libs/TwilioWhatsApp.ts`
- outbound try/catch in `route.ts`

Behavior:

- Meta send failures are logged and returned as processed webhook work without
  throwing the webhook request after AI processing.
- AI failure skips outbound send and releases the thread lock.

Test evidence:

- `route.test.ts` covers AI failure and Meta outbound send failure.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/app/api/twilio/webhook/route.test.ts src/libs/TwilioWhatsApp.test.ts src/libs/WebhookIdempotency.test.ts` | pass: 3 files, 35 tests |
| `npm run check:types` | pass |

## Confirmed Findings

### D-0010: WhatsApp live production parity is not certified

Root cause:

- The code has source and unit test coverage for WhatsApp route/adapters, but
  the full live Meta-to-production flow cannot be proven while production DB
  connectivity and WhatsApp runtime-source proof remain blocked.

Impact:

- WhatsApp Production Flow Gate cannot be certified.

Affected areas:

- Meta webhook delivery to production.
- Store runtime WhatsApp credential source.
- Live per-store token decryption and outbound send.
- Full web-vs-WhatsApp parity scenarios with production-like data.

Fix:

- Resolve D-0003 and D-0004, then run live-safe Meta webhook tests and
  production-like WhatsApp parity scenarios using approved test data.

Verification:

- Unit-level WhatsApp route, adapter, interactive payload, idempotency, lock,
  AI failure, and Meta-send failure tests pass.
- Live production runtime verification remains blocked.

Regression prevention:

- Keep route-level WhatsApp tests in the gate and add live-safe smoke evidence
  after production DB/runtime keys are corrected.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.

## Exit Decision

Phase 4 cannot be certified yet. Source and unit evidence now proves the
internal WhatsApp path is materially covered, including failure handling, but
live production certification requires the carried production blockers to be
resolved first.

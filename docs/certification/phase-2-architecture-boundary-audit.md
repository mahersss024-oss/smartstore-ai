# Phase 2: Architecture And Boundary Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

Phase 2 has started as a source-level architecture and boundary audit under
`R-0007`. The product cannot be certified while Phase -1 blockers remain open.

This phase records the current route, integration, AI, guardrail, order, and
runtime boundaries before deeper refactoring or parity work. No production
write, destructive check, migration, or live customer mutation was performed.

## Boundary Map

### Public and marketing routes

Source evidence:

- `src/app/[locale]/(marketing)/page.tsx`
- `src/app/[locale]/(marketing)/privacy/page.tsx`
- `src/app/[locale]/(marketing)/terms/page.tsx`
- `src/app/[locale]/(marketing)/connect/[organizationId]/page.tsx`
- `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx`
- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`

Responsibility:

- Serve public entry, legal pages, customer connect page, order tracking, and
  customer web ordering.

Current risk:

- Public customer links must be verified for multi-customer concurrency and
  tenant isolation in later phases.

### Authenticated store dashboard

Source evidence:

- `src/app/[locale]/(auth)/dashboard/layout.tsx`
- `src/app/[locale]/(auth)/dashboard/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/page.tsx`
- `src/app/[locale]/(auth)/dashboard/settings/page.tsx`
- `src/features/dashboard/*Actions.ts`

Responsibility:

- Store operations, products, orders, customers, settings, payments, AI setup,
  and WhatsApp configuration.

Current risk:

- Dashboard server actions must be covered by tenant isolation tests before
  production certification.

### Platform administration

Source evidence:

- `src/app/[locale]/(auth)/admin/page.tsx`
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`
- `src/features/admin/PlatformAdminActions.ts`
- `src/libs/PlatformAIProviderConfig.ts`
- `src/libs/PlatformRuntimeConfig.ts`

Responsibility:

- Platform-level operational keys, AI provider configuration, runtime secrets,
  and store-level administration.

Current risk:

- Runtime DB proof is blocked by D-0004, so platform-stored key source cannot
  yet be certified.

### Customer web order conversation

Source evidence:

- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`
- `src/features/customer/WebOrderChat.tsx`
- `src/features/customer/WebChatActions.ts`
- `src/features/customer/WebOrderChatState.ts`
- `src/features/ai/AIEmployeeAgent.ts`

Responsibility:

- Web customer chat, product selection, cart state, order confirmation,
  complaints, feedback, and AI employee replies.

Current risk:

- `WebOrderChat.tsx` is 1267 lines and owns a large amount of UI-state behavior.
  Web and WhatsApp parity must be proven by scenario tests, not assumed.

### WhatsApp conversation

Source evidence:

- `src/app/api/twilio/webhook/route.ts`
- `src/libs/TwilioWhatsApp.ts`
- `src/features/ai/AIEmployeeAgent.ts`
- `src/libs/WebhookIdempotency.ts`

Responsibility:

- Verify webhook challenge and signatures, extract inbound WhatsApp messages,
  match phone number IDs to store connections, route message text and
  interactive replies into AI employee semantics, and send outbound WhatsApp
  text or interactive payloads.

Observed flow:

- `route.ts` verifies signature and extracts messages.
- `findWhatsAppStoreConnection` resolves the tenant from `twilioWhatsAppFrom`.
- `buildWhatsAppChatMessageInput` converts text, location, and interactive
  reply IDs to `semanticHints`.
- `handleCustomerMessageWithAIEmployee` processes the same AI/order engine used
  by customer chat.
- `sendWhatsAppReplyMessage` chooses text, product choices, review request, cart
  controls, or system-action interactive payloads.

Current risk:

- WhatsApp parity with the web chat is not yet certified.
- WhatsApp inbound concurrency behavior must be tested with simultaneous
  messages from the same customer and parallel messages from different
  customers.

### AI employee and orchestration

Source evidence:

- `src/features/ai/AIEmployeeAgent.ts`
- `src/libs/AIEmployeeOrchestration.ts`
- `src/libs/AIEmployeeSemanticAnalysis.ts`
- `src/libs/AIEmployeeCart.ts`
- `src/libs/AIEmployeeCheckout.ts`
- `src/libs/AIEmployeeOrderLifecycle.ts`
- `src/libs/AIEmployeeSystemEventBridge.ts`
- `src/libs/AIEmployeeSystemEventReply.ts`
- `src/libs/StoreAIContext.ts`

Responsibility:

- Interpret customer messages, normalize semantic hints, manage cart/order
  lifecycle, call model/provider logic, and produce customer-facing replies.

Current risk:

- `AIEmployeeAgent.ts` is 3111 lines and is the central orchestration hotspot.
  Any direct change here requires focused regression tests across web and
  WhatsApp.

### Guardrails and AI safety

Source evidence:

- `src/libs/AIEmployeeReplyGuardPipeline.ts`
- `src/libs/AIReplySafetyGuards.ts`
- `src/libs/AIActionPermissions.ts`
- `src/libs/PlatformAIPolicy.ts`
- `src/libs/AIOrchestrationDiagnostics.ts`

Responsibility:

- Validate reply language/encoding, privacy, false action claims, unsupported
  prices/catalog claims, unavailable system actions, and semantic safety review.

Current risk:

- `AIEmployeeReplyGuardPipeline.ts` is 1494 lines. Guard behavior must not be
  changed casually; later fixes must prove root cause and regression coverage.

### Order workflow and notifications

Source evidence:

- `src/libs/OrderWorkflow.ts`
- `src/libs/OrderOperations.ts`
- `src/features/dashboard/OrderActions.ts`
- `src/libs/OrderConversationWriter.ts`
- `src/libs/OrderDataNormalization.ts`

Responsibility:

- Define order states, allowed transitions, lifecycle timestamps, order
  mutations, dashboard actions, and customer notifications.

Observed status evidence:

- `OrderWorkflow.ts` defines allowed transitions from draft through pending,
  approved, confirmed, preparing, ready/out-for-delivery, completed, and
  cancelled.
- `OrderActions.ts` sends WhatsApp status and review notifications after store
  order actions.

Current risk:

- Order state transitions must be tested through both dashboard and customer
  conversation paths.

## Route Inventory Evidence

Command evidence:

- `Get-ChildItem src\app -Recurse -File -Include page.tsx,route.ts,layout.tsx,loading.tsx,error.tsx,not-found.tsx`

Observed route-convention files:

- 56 route-convention files were previously inventoried in Phase 0.
- The current command enumerated localized marketing, authenticated dashboard,
  admin, auth, and API routes, including:
  - `src/app/api/ai-employee/messages/route.ts`
  - `src/app/api/clerk/webhooks/route.ts`
  - `src/app/api/maintenance/cleanup/route.ts`
  - `src/app/api/payments/moyasar/callback/route.ts`
  - `src/app/api/stripe/webhooks/route.ts`
  - `src/app/api/twilio/webhook/route.ts`

## Complexity Hotspots

Command evidence:

- `Get-ChildItem src\features\ai,src\features\customer,src\libs -Recurse -File`
  with line counts sorted descending.

Top source hotspots:

| Lines | File |
| ---: | --- |
| 3111 | `src/features/ai/AIEmployeeAgent.ts` |
| 1494 | `src/libs/AIEmployeeReplyGuardPipeline.ts` |
| 1267 | `src/features/customer/WebOrderChat.tsx` |
| 1153 | `src/libs/TwilioWhatsApp.ts` |
| 889 | `src/libs/AIEmployeeOrderLifecycle.ts` |
| 709 | `src/libs/AIEmployeeOrchestration.ts` |
| 521 | `src/features/customer/WebChatActions.ts` |

## Confirmed Findings

### D-0008: large cross-channel orchestration hotspots

Root cause:

- AI, guardrail, web-chat, and WhatsApp orchestration responsibilities are
  concentrated in a small number of large files.

Impact:

- Correctness changes are harder to reason about and require broad regression
  coverage across web chat, WhatsApp, orders, guardrails, and customer records.

Affected files:

- `src/features/ai/AIEmployeeAgent.ts`
- `src/libs/AIEmployeeReplyGuardPipeline.ts`
- `src/features/customer/WebOrderChat.tsx`
- `src/libs/TwilioWhatsApp.ts`
- `src/libs/AIEmployeeOrderLifecycle.ts`
- `src/libs/AIEmployeeOrchestration.ts`
- `src/features/customer/WebChatActions.ts`

Fix:

- No Phase 2 code refactor was applied. The safe fix is to first add
  scenario-level regression tests and boundary contracts, then split behavior
  only when each extracted unit has equivalent tests.

Verification:

- Source line-count evidence is recorded above.
- Phase 1 baseline gates passed before this finding was opened.

Regression prevention:

- Later phases must require channel-parity tests before changing AI or WhatsApp
  flow code.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.

## Exit Decision

Phase 2 cannot be certified yet. The boundary map is now recorded, but deeper
channel parity, tenant isolation, runtime DB proof, and scenario regression tests
must be completed before production readiness can be claimed.

# Phase 6: Orders, Cart, Reviews, And Complaints Integrity

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase fixed confirmed order/cart integrity risks and added regression
coverage for complaints versus reviews. The phase is not fully certified yet
because the complete order-status transition matrix, notification leak matrix,
and executable customer-page aggregation scenarios are not finished.

## Source Trace

### Cart and checkout state

Source evidence:

- `src/features/customer/WebOrderChatState.ts`
- `src/libs/AIEmployeeOrchestration.ts`
- `src/libs/AIEmployeeCheckout.ts`
- `src/features/ai/AIEmployeeAgent.ts`

Behavior:

- Web and WhatsApp system actions are normalized into canonical semantic hints.
- Fulfillment, payment, and final confirmation are accepted only from valid
  system-controlled action state.
- Cart pricing is normalized before order creation.
- Missing checkout facts are computed before the final confirmation step.

### Order creation and lifecycle

Source evidence:

- `src/libs/AIEmployeeOrderLifecycle.ts`
- `src/libs/OrderWorkflow.ts`
- `src/features/dashboard/OrderActions.ts`
- `src/libs/OrderOperations.ts`

Behavior:

- Draft order creation is now blocked when cart items are empty or checkout
  missing details remain.
- Dashboard status updates use workflow transition validation.
- Concurrent status races return an order concurrency error.
- Dashboard order archive stores `archivedAt` instead of deleting active orders.
- Permanent deletion is limited to archived orders and cascades dependent order
  data inside the active organization scope.

### Reviews and complaints

Source evidence:

- `src/features/customer/WebChatActions.ts`
- `src/libs/AIEmployeeOrderLifecycle.ts`
- `src/features/ai/AIEmployeeAgent.ts`
- `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/page.tsx`

Behavior:

- Star ratings for completed orders are stored in `customer_reviews`.
- Text feedback without a rating is stored as `customer_complaint` order events.
- WhatsApp complaint/review text without a numeric rating is routed to order
  events through `createAIEmployeeCustomerFeedbackEvent`.
- Customer pages aggregate reviews from `customer_reviews` and complaints from
  `order_events`; they do not depend on chat transcript messages alone.

## Fixes Applied

### D-0012: empty or incomplete carts could reach draft order creation

Root cause:

- `createAIEmployeeDraftOrder` did not explicitly reject `items=[]` or
  `aiAnalysis.missingDetails.length > 0` before inserting an order.
- `validateAIEmployeeRequestedCustomerNeed` could accept `order_confirmation`
  from a model decision even when no active cart existed.
- `sanitizeAIEmployeeSystemSemanticHints` could accept a stale final
  confirmation hint if stale metadata still referenced a final confirmation
  action after the cart was gone.

Impact:

- A stale system action or incorrect model decision could theoretically create
  an empty or incomplete order before store review.

Affected files:

- `src/libs/AIEmployeeOrderLifecycle.ts`
- `src/libs/AIEmployeeOrchestration.ts`
- `src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts`
- `src/libs/AIEmployeeOrchestration.test.ts`

Fix:

- Block draft order creation when cart items are empty.
- Block draft order creation while checkout missing details remain.
- Require an active collecting cart before accepting final confirmation for a
  new order.

Verification:

- `npm test -- src/libs/AIEmployeeOrchestration.test.ts src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts`
  passed 18 tests.
- `npm test -- src/features/customer/WebChatActions.test.ts src/libs/AIEmployeeOrchestration.test.ts src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts`
  passed 32 tests.
- `npm run check:types` passed.

Regression prevention:

- Keep explicit tests for empty cart, missing checkout facts, and stale final
  confirmation actions in the Phase 6 gate.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/libs/AIEmployeeOrchestration.test.ts src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts` | pass: 2 files, 18 tests |
| `npm test -- src/features/customer/WebChatActions.test.ts src/libs/AIEmployeeOrchestration.test.ts src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts` | pass: 3 files, 32 tests |
| `npm test -- src/features/dashboard/OrderActions.test.ts src/libs/OrderOperations.test.ts src/libs/AIEmployeeCheckout.test.ts src/features/customer/WebOrderChatState.test.ts` | pass: 4 files, 30 tests |
| `npm run check:types` | pass |

## Confirmed Findings

### D-0013: full order integrity matrix remains incomplete

Root cause:

- The current suite has focused tests for high-risk paths, but the complete
  Phase 6 matrix is not yet executable.

Impact:

- Orders Integrity Gate and Customer Feedback Gate cannot be fully certified.

Affected areas:

- Complete invalid status transition matrix.
- Concurrent order status update matrix beyond the covered stale update case.
- Notification leak tests across different customers and channels.
- Executable customer-page aggregation tests that render reviews and complaint
  sections from dedicated records.
- Archive/delete behavior across all dependent tables and dashboard views.

Fix:

- Add scenario tests for the full order transition matrix, cross-customer
  notification isolation, customer detail aggregation, and archive/delete
  cascade behavior.

Verification:

- Focused order, cart, review, complaint, and dashboard tests pass.
- Full matrix remains pending.

Regression prevention:

- Require the Phase 6 scenario matrix before declaring Orders Integrity Gate or
  Customer Feedback Gate certified.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.
- D-0010: WhatsApp live production parity is not certified.
- D-0011: full web customer journey coverage is incomplete.

## Exit Decision

Phase 6 cannot be certified yet. Confirmed integrity defects were fixed and
covered by tests, but the full required order, notification, and customer
feedback matrix remains incomplete.

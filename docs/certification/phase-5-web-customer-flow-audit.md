# Phase 5: Web Customer Flow Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

The main web-order E2E path now covers desktop, mobile, and tablet rendering,
but the full Phase 5 customer journey is not complete because review,
complaint/feedback, revisit-as-same-customer, and revisit-as-different-customer
scenarios still require executable coverage.

## Source Trace

### Public store link

Source evidence:

- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`

Behavior:

- Loads store settings, active offline payment methods, active delivery methods,
  feature flags, AI employee settings, store theme, and location metadata using
  `organizationId`.
- Disables order chat when web orders, AI, fulfillment methods, or compatible
  payment methods are unavailable.

### Web chat identity and conversation

Source evidence:

- `src/features/customer/WebOrderChat.tsx`
- `src/features/customer/WebOrderGuestIdentity.ts`
- `src/features/customer/WebChatActions.ts`

Behavior:

- Creates or reuses a browser guest ID.
- Scopes thread ID to `organizationId` and channel source.
- Sends messages through `sendWebChatMessage`.
- Reads conversation messages through `getWebChatMessages`.
- Uses canonical semantic hints for UI-owned choices.

### Cart, fulfillment, payment, and order confirmation

Source evidence:

- `WebOrderChat.tsx`
- `WebOrderChatState.ts`
- `WebChatActions.ts`
- `AIEmployeeAgent.ts`

Behavior:

- Product suggestions can be selected from UI choices.
- Cart state is normalized from AI response data.
- Fulfillment and payment choices are controlled by visible system actions.
- Current cart and submitted cart state are rendered in the customer UI.

### Tracking and feedback

Source evidence:

- `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx`
- `src/features/customer/OrderTrackingFeedbackPanel`
- `src/features/customer/WebOrderFeedbackPanel`
- `WebChatActions.ts`

Behavior:

- Tracking page scopes order lookup by `organizationId`, `orderId`, archived
  state, and customer phone verification.
- Feedback panels submit either reviews or customer complaint events through
  scoped server actions.

## E2E Evidence

File:

- `tests/e2e/WebOrderChat.e2e.ts`

Existing coverage:

- Store identity renders.
- Chat controls render.
- Store location side panel renders.
- Customer sends a real message to a mock AI provider.
- AI orchestration quality metadata is persisted.
- Product choice appears and can be selected.
- Cart state appears.
- Pickup fulfillment is selected.
- Payment option appears and is selected.
- Adding another item keeps fulfilled pickup state and does not re-open
  fulfillment choices.

New coverage added in Phase 5:

- Mobile viewport `390x844` renders without visible horizontal overflow.
- Tablet viewport `768x1024` renders without visible horizontal overflow.
- Both mobile and tablet checks verify the store heading and send button are
  visible.

Verification command:

- `npm run test:e2e -- tests/e2e/WebOrderChat.e2e.ts`

Result:

- Passed 5 tests in Chromium.

Additional verification:

- `npm run check:types` passed.
- `npm run lint` passed with the known 333 warnings recorded as D-0007.

## Confirmed Findings

### D-0011: full web customer journey coverage is incomplete

Root cause:

- The current E2E suite validates the primary chat/cart/checkout path and now
  mobile/tablet overflow, but not every Phase 5 required customer journey.

Impact:

- Web Customer Flow Gate, Mobile Gate, Tablet Gate, and Web Gate cannot be
  certified as complete.

Affected areas:

- Review submission.
- Complaint/feedback submission.
- Order tracking feedback.
- Revisit as the same customer.
- Revisit as a different customer.
- Empty/error/loading states beyond the current path.

Fix:

- Add E2E coverage for review, feedback, tracking, same customer revisit,
  different customer isolation, and selected error/empty states.

Verification:

- Current E2E passed 5 tests including desktop, mobile, and tablet visibility
  and overflow checks.
- Missing scenarios remain pending.

Regression prevention:

- Keep mobile/tablet overflow checks and extend the E2E suite before Phase 5
  certification.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.
- D-0010: WhatsApp live production parity is not certified.

## Exit Decision

Phase 5 cannot be certified yet. The primary web-order path and responsive
rendering are improved with executable evidence, but full customer journey
coverage remains incomplete.

# Phase 7: AI And Guardrails Forensic Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase strengthened deterministic AI safety around secret leakage and
recorded the AI/guardrail source map. It is not fully certified yet because the
complete adversarial matrix across web and WhatsApp is not executable.

## Source Trace

### Prompt construction

Source evidence:

- `src/libs/PlatformAIPolicy.ts`
- `src/features/ai/AIEmployeeAgent.ts`

Behavior:

- The platform policy prompt scopes the AI to exactly one store.
- The model instructions state that administrator style guidance cannot
  override platform facts, tenant isolation, permissions, product truth,
  prices, or action controls.
- The model is instructed to write the final customer reply only from provided
  facts and not expose internal labels or reasoning.

### Store, customer, and catalog context injection

Source evidence:

- `src/libs/StoreAIContext.ts`
- `src/features/ai/AIEmployeeAgent.ts`
- `src/libs/ConversationEngine.ts`

Behavior:

- Store AI context is loaded by organization.
- Products, delivery methods, payment methods, AI settings, and knowledge base
  are passed as scoped facts.
- Customer details, current cart, last order, order snapshots, and conversation
  metadata are passed as bounded context.
- Catalog matching never converts unavailable products into cart items.

### Semantic analysis and orchestration

Source evidence:

- `src/libs/AIEmployeeSemanticAnalysis.ts`
- `src/libs/AIEmployeeSemanticHints.ts`
- `src/libs/AIEmployeeOrchestration.ts`
- `src/libs/AIEmployeeCheckout.ts`

Behavior:

- Parsed semantic values are constrained to canonical enums.
- System-controlled semantic hints are sanitized against previous visible
  actions and current cart facts.
- Store delivery and payment method constraints are applied before checkout
  progression.
- Final order confirmation is now accepted only when the active collecting cart
  exists or an explicit order modification confirmation is pending.

### Guardrail decisions and reply rewrites

Source evidence:

- `src/libs/AIReplySafetyGuards.ts`
- `src/libs/AIEmployeeReplyGuardPipeline.ts`
- `src/libs/AIEmployeeSystemEventReply.ts`

Behavior:

- Deterministic guards run before semantic review.
- Encoding, repeated conversation restarts, repeated satisfied needs, visible
  system actions, unproven system actions, privacy, catalog history, catalog
  item truth, price truth, and availability claims are checked.
- Guarded replies can be repaired by the model and then checked again.
- If safe repair is unavailable, non-dangerous contextual rewrites can be
  downgraded to noted, while deterministic safety failures remain guarded.

## Fixes Applied

### D-0014: secret-like operational values were not directly guarded

Root cause:

- `guardCustomerPrivacyReply` detected leaked emails and phone numbers, but did
  not detect common secret/token shapes in model replies.

Impact:

- A prompt-injection response containing an API key, webhook secret, or
  WhatsApp access-token-like value could pass this deterministic privacy guard
  unless another guard caught it later.

Affected files:

- `src/libs/AIReplySafetyGuards.ts`
- `src/libs/AIReplySafetyGuards.test.ts`
- `src/libs/AIEmployeeReplyGuardPipeline.test.ts`

Fix:

- Added deterministic secret-like pattern detection for common API keys,
  webhook secrets, WhatsApp access-token-like values, and explicit
  `api_key`/`secret`/`token` assignments.
- Added direct safety-guard tests and a full reply-guard pipeline test.

Verification:

- `npm test -- src/libs/AIReplySafetyGuards.test.ts src/libs/AIEmployeeReplyGuardPipeline.test.ts src/libs/PlatformAIPolicy.test.ts src/libs/AIEmployeeSemanticAnalysis.test.ts`
  passed 42 tests.
- `npm test -- src/libs/AIReplySafetyGuards.test.ts src/libs/AIEmployeeReplyGuardPipeline.test.ts src/libs/PlatformAIPolicy.test.ts src/libs/AIEmployeeSemanticAnalysis.test.ts src/libs/ConversationEngine.test.ts`
  passed 59 tests.
- `npm run check:types` passed.

Regression prevention:

- Keep direct and pipeline-level secret-leak tests in the AI Safety Gate.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/libs/AIReplySafetyGuards.test.ts src/libs/AIEmployeeReplyGuardPipeline.test.ts src/libs/PlatformAIPolicy.test.ts src/libs/AIEmployeeSemanticAnalysis.test.ts` | pass: 4 files, 42 tests |
| `npm test -- src/libs/AIReplySafetyGuards.test.ts src/libs/AIEmployeeReplyGuardPipeline.test.ts src/libs/PlatformAIPolicy.test.ts src/libs/AIEmployeeSemanticAnalysis.test.ts src/libs/ConversationEngine.test.ts` | pass: 5 files, 59 tests |
| `npm run check:types` | pass |

## Confirmed Findings

### D-0015: full adversarial AI matrix remains incomplete

Root cause:

- Focused deterministic guard and conversation-engine tests exist, but the full
  Phase 7 adversarial matrix has not been implemented end-to-end across both
  web and WhatsApp channels.

Impact:

- AI Safety Gate, Guardrails Gate, and web/WhatsApp behavior-equivalence claim
  cannot be fully certified.

Affected areas:

- Prompt injection requesting another store's data.
- Multi-message customer changes of mind mid-checkout.
- Price questions after cart state exists.
- Multiple products in one message through full AI flow.
- Customer refusal of required checkout facts.
- AI-proposed invalid order action through full handler.
- Guardrail rewrite preservation of valid sales answers across channels.

Fix:

- Add adversarial scenario tests around `handleCustomerMessageWithAIEmployee`,
  web chat actions, and WhatsApp interactive/text routes using the same store
  fixture and channel-equivalence assertions.

Verification:

- Focused guardrail, semantic, policy, and conversation tests pass.
- Full matrix remains pending.

Regression prevention:

- Require the adversarial matrix before declaring AI Safety Gate or Guardrails
  Gate certified.

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
- D-0013: full order integrity matrix remains incomplete.

## Exit Decision

Phase 7 cannot be certified yet. Secret leakage protection is stronger and
covered by deterministic plus pipeline tests, but the full adversarial
web/WhatsApp matrix remains incomplete.

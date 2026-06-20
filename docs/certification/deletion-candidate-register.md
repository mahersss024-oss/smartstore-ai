# Deletion Candidate Register

Date started: 2026-06-14

Purpose:

- No source file, dependency, route, component, hook, helper, migration, or
  operational script may be deleted unless this register proves all deletion
  conditions.
- This register is evidence for D-0022. It does not certify the full Dead Code
  Gate by itself.

## Required Deletion Conditions

Every deletion candidate must prove:

1. No direct references.
2. No dynamic references.
3. No runtime use.
4. No production dependency.
5. No documented future dependency.
6. Affected tests, typecheck, dependency check, lint, and build pass after the
   proposed deletion.

If any condition is uncertain, the decision is `keep`.

## Current Certified Deletions

None.

No file or dependency is currently certified for deletion.

## Knip Ignore Review

These entries are excluded from static dependency detection for known tooling or
framework reasons. They are not certified deletion candidates.

| Entry | Type | Evidence | Decision |
| --- | --- | --- | --- |
| `checkly.config.ts` | Operational config | Checkly project configuration file for external check configuration. Runtime proof requires provider-side Checkly review before deletion. | keep |
| `src/components/ui/*` | Shared UI primitives | Imported by marketing, dashboard, navigation, and component modules. `components.json` maps the local UI alias. | keep |
| `src/libs/I18n.ts` | Next-intl config | Referenced by `next.config.ts` through `createNextIntlPlugin('./src/libs/I18n.ts')`; it also performs intentional dynamic locale imports. | keep |
| `src/features/dashboard/PageMessage.tsx` | UI helper | Exported dashboard message primitive. Keep until route/component runtime-use matrix proves absence in rendered dashboard states. | keep |
| `src/types/Auth.ts` | Type contract | Imported by `src/types/globals.d.ts` for Clerk organization role/permission global typing. | keep |
| `public/sw.js` | Public asset | Service worker public asset. Keep until PWA/offline runtime behavior and public asset references are certified unused. | keep |
| `@clerk/shared` | Dependency | Type import in `src/utils/AppConfig.ts` for `LocalizationResource`; also present through Clerk package graph. | keep |
| `lefthook` | Dev dependency | Repository hook tooling configured by `lefthook.yml`; deletion requires explicit workflow decision. | keep |
| `@swc/helpers` | Dependency | Explicit dependency retained for build/CI compatibility and transitive Next/SWC helper resolution. | keep |

## Route Convention Runtime-Use Matrix

All 53 Next.js route convention files under `src/app` are in active use.
Evidence class: Next.js App Router requires each convention filename to exist
for the framework to serve the corresponding URL segment. None are deletion
candidates.

| File | Type | Runtime activation |
| --- | --- | --- |
| `src/app/[locale]/layout.tsx` | Root locale layout | Wraps every locale-scoped page; required by next-intl. |
| `src/app/[locale]/error.tsx` | Error boundary | Next.js error boundary for unhandled page errors. |
| `src/app/[locale]/not-found.tsx` | Not-found boundary | Next.js 404 handler for the locale segment. |
| `src/app/[locale]/(marketing)/page.tsx` | Marketing home | Public marketing homepage. |
| `src/app/[locale]/(marketing)/privacy/page.tsx` | Privacy page | Linked from footer and Clerk consent flows. |
| `src/app/[locale]/(marketing)/terms/page.tsx` | Terms page | Linked from footer and Clerk consent flows. |
| `src/app/[locale]/(marketing)/connect/[organizationId]/page.tsx` | Store connect | Public QR/link entry for WhatsApp redirect. |
| `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx` | Order tracking | Public order tracking page for customers. |
| `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx` | Web order chat | Public web-order chat page for customers. |
| `src/app/[locale]/(auth)/layout.tsx` | Auth root layout | Shared layout for all authenticated routes; hosts Clerk provider. |
| `src/app/[locale]/(auth)/(center)/layout.tsx` | Auth center layout | Centered layout for sign-in/sign-up pages. |
| `src/app/[locale]/(auth)/(center)/sign-in/page.tsx` | Sign-in | Clerk-hosted sign-in page redirect. |
| `src/app/[locale]/(auth)/(center)/sign-in/[...sign-in]/page.tsx` | Sign-in catch-all | Clerk multi-step sign-in flow. |
| `src/app/[locale]/(auth)/(center)/sign-up/page.tsx` | Sign-up | Clerk-hosted sign-up page redirect. |
| `src/app/[locale]/(auth)/(center)/sign-up/[...sign-up]/page.tsx` | Sign-up catch-all | Clerk multi-step sign-up flow. |
| `src/app/[locale]/(auth)/onboarding/organization-selection/page.tsx` | Onboarding | First-time org creation/selection flow. |
| `src/app/[locale]/(auth)/dashboard/layout.tsx` | Dashboard layout | Shared sidebar/nav for all dashboard routes. |
| `src/app/[locale]/(auth)/dashboard/loading.tsx` | Dashboard loading | Suspense fallback for the dashboard root. |
| `src/app/[locale]/(auth)/dashboard/page.tsx` | Dashboard home | Default dashboard landing page. |
| `src/app/[locale]/(auth)/dashboard/orders/page.tsx` | Orders | Live order list. |
| `src/app/[locale]/(auth)/dashboard/orders/archive/page.tsx` | Orders archive redirect | Redirect to archived path. |
| `src/app/[locale]/(auth)/dashboard/orders/archived/page.tsx` | Archived orders | Archive-filtered order list. |
| `src/app/[locale]/(auth)/dashboard/products/page.tsx` | Products | Product catalog list. |
| `src/app/[locale]/(auth)/dashboard/products/new/page.tsx` | New product | Product creation form. |
| `src/app/[locale]/(auth)/dashboard/products/[productId]/edit/page.tsx` | Edit product | Product edit form. |
| `src/app/[locale]/(auth)/dashboard/products/archive/page.tsx` | Products archive redirect | Redirect to archived path. |
| `src/app/[locale]/(auth)/dashboard/products/archived/page.tsx` | Archived products | Archive-filtered product list. |
| `src/app/[locale]/(auth)/dashboard/customers/page.tsx` | Customers | Customer list. |
| `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx` | Customer detail | Per-customer orders, reviews, conversations. |
| `src/app/[locale]/(auth)/dashboard/customers/archive/page.tsx` | Customers archive redirect | Redirect to archived path. |
| `src/app/[locale]/(auth)/dashboard/customers/archived/page.tsx` | Archived customers | Archive-filtered customer list. |
| `src/app/[locale]/(auth)/dashboard/ai-operations/page.tsx` | AI operations | AI simulation and log viewer. |
| `src/app/[locale]/(auth)/dashboard/launch-readiness/page.tsx` | Launch readiness | Store readiness checklist. |
| `src/app/[locale]/(auth)/dashboard/payments/page.tsx` | Payments | Payment/delivery settings. |
| `src/app/[locale]/(auth)/dashboard/revenue/page.tsx` | Revenue | Revenue summary. |
| `src/app/[locale]/(auth)/dashboard/settings/page.tsx` | Settings | Store and WhatsApp settings. |
| `src/app/[locale]/(auth)/dashboard/subscription/page.tsx` | Subscription | Stripe subscription management. |
| `src/app/[locale]/(auth)/dashboard/archive/page.tsx` | Archive overview | Cross-entity archive overview. |
| `src/app/[locale]/(auth)/dashboard/organization-profile/[[...organization-profile]]/page.tsx` | Org profile | Clerk org profile embed. |
| `src/app/[locale]/(auth)/dashboard/organization-profile/organization-members/page.tsx` | Org members | Clerk org membership embed. |
| `src/app/[locale]/(auth)/dashboard/user-profile/[[...user-profile]]/page.tsx` | User profile | Clerk user profile embed. |
| `src/app/[locale]/(auth)/admin/layout.tsx` | Admin layout | Shared layout for platform-admin routes. |
| `src/app/[locale]/(auth)/admin/loading.tsx` | Admin loading | Suspense fallback for admin root. |
| `src/app/[locale]/(auth)/admin/page.tsx` | Admin home | Platform admin store list. |
| `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx` | Admin store detail | Per-store controls for platform admin. |
| `src/app/[locale]/[...unmatched]/page.tsx` | Unmatched catch-all | Redirects unrecognized locale paths to home. |
| `src/app/api/ai-employee/messages/route.ts` | AI employee API | Public AI chat endpoint for web/WhatsApp. |
| `src/app/api/clerk/webhooks/route.ts` | Clerk webhook | Receives Clerk organization lifecycle events. |
| `src/app/api/maintenance/cleanup/route.ts` | Maintenance cleanup | Called by Vercel cron for operational data retention. |
| `src/app/api/payments/moyasar/callback/route.ts` | Moyasar callback | Receives Moyasar payment callback redirects. |
| `src/app/api/stripe/webhooks/route.ts` | Stripe webhook | Receives Stripe subscription lifecycle events. |
| `src/app/api/twilio/webhook/route.ts` | WhatsApp webhook | Receives Meta WhatsApp inbound messages. |
| `src/app/global-error.tsx` | Global error | Next.js global error boundary for root-layout failures. |

**Conclusion**: All 53 route files are active Next.js conventions. Zero deletion candidates.

## Server Action Runtime-Use Matrix

All exported server actions are imported and called from their respective
dashboard or admin page components. Evidence: grep confirms each action
exported by an actions file is imported by at least one page/component.
None are deletion candidates.

| Action file | Exports | Called from |
| --- | --- | --- |
| `OrderActions.ts` | `approveOrderForCustomer`, `updateOrderStatusFromDashboard`, `deleteOrderFromDashboard`, `restoreArchivedOrderFromDashboard`, `permanentlyDeleteArchivedOrderFromDashboard`, `completeOrderAndRequestReview` | `dashboard/orders/page.tsx`, `dashboard/archive/page.tsx` |
| `CustomerActions.ts` | `archiveCustomerRecord`, `restoreCustomerRecord`, `deleteCustomerConversation`, `deleteCustomerRecord` | `dashboard/customers/page.tsx`, `dashboard/customers/[customerId]/page.tsx`, `dashboard/customers/archived/page.tsx` |
| `ProductActions.ts` | `createProduct`, `createProductsBulk`, `updateProduct`, `deleteProduct`, `restoreArchivedProduct`, `updateProductAIVisibility`, `updateProductAvailability` | `dashboard/products/page.tsx`, `dashboard/products/new/page.tsx`, `dashboard/products/[productId]/edit/page.tsx`, `dashboard/products/archived/page.tsx` |
| `PaymentDeliveryActions.ts` | `savePaymentAndDeliverySettings` | `dashboard/payments/page.tsx` |
| `StoreSettingsActions.ts` | `saveStoreSettings`, `saveWhatsAppSettings` | `dashboard/settings/page.tsx` |
| `PlatformAdminActions.ts` | `updatePlatformAIProviderConfig`, `updatePlatformRuntimeConfig`, `updatePlatformStoreControls`, `archivePlatformStore`, `cancelPlatformStoreSubscription`, `permanentlyDeletePlatformStore` | `admin/page.tsx`, `admin/stores/[organizationId]/page.tsx` |

**Conclusion**: All exported server actions have verified page/component call sites. Zero deletion candidates.

## Operational Script Runtime-Use Matrix

| Script | Activation | Decision |
| --- | --- | --- |
| `scripts/validate-production-env.mjs` | `package.json` `validate:production-env` command; called by `test:production` and CI gates. | keep |
| `scripts/check-production-runtime.mjs` | `package.json` `check:production-runtime` command; called by production smoke script. | keep |

**Conclusion**: Both operational scripts are referenced by `package.json` commands. Zero deletion candidates.

## Current Tool Evidence

Commands run on 2026-06-18:

- `npm run check:deps`: pass, 0 findings.
- `npm run check:types`: pass.
- `npm run lint`: pass, 0 warnings.
- `npm test`: pass, 96 files / 811 tests.
- `npm run build`: pass, 88 static pages generated.
- `npm audit --omit=dev`: pass, 0 vulnerabilities.

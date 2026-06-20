# Local Acceptance Checklist

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3008
```

## Required Environment Variables

Keep real values only in `.env.local`.

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER_MONTHLY=
STRIPE_PRICE_GROWTH_MONTHLY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_EXTRA_AI_ORDERS=
STRIPE_PRICE_EXTRA_CATALOG_ITEMS=
STRIPE_PRICE_EXTRA_IMAGE_STORAGE=
STRIPE_PRICE_EXTRA_TEAM_MEMBER=
AI_EMPLOYEE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=
DATABASE_URL=
```

`CLERK_WEBHOOK_SIGNING_SECRET` is for Clerk organization/user events only.
`STRIPE_WEBHOOK_SECRET` is required for subscription and add-on billing sync.

## Billing Ownership

Clerk is used for authentication, organizations, and user management.
Stripe is used for platform subscriptions and paid add-ons.

Create recurring monthly Stripe prices for base plans:

```text
starter
growth
pro
```

Create recurring Stripe prices for add-ons:

```text
extra_ai_orders
extra_catalog_items
extra_image_storage
extra_team_member
```

The store add-on buttons open Stripe Checkout and activate capacity through the
Stripe webhook after successful payment.

## Free Store Rules

- New stores must start on `free`.
- `free` has no paid features.
- AI orders, web orders, catalog publishing, and channels require an active paid entitlement.
- Paid admin override unlocks base plan capabilities only.
- Add-ons require an active paid Stripe subscription.

## Stripe Payment Test

1. Sign up as a new user.
2. Create a new organization/store.
3. Confirm the subscription page shows `free`.
4. Buy `Starter` or `Growth` through Stripe Checkout.
5. Confirm the paid package appears in the dashboard.
6. Confirm paid features are available.
7. Buy `Extra AI Orders` from the subscription page.
8. Buy `Extra Catalog Items` from the subscription page.
9. Confirm Stripe webhook updates the add-on capacity in store metadata.
10. Confirm the add-on is activated automatically after the Stripe webhook syncs.

## Local Webhook Test

Clerk and Stripe cannot send webhooks to plain `localhost`.

Use a tunnel such as ngrok or Cloudflare Tunnel:

```text
https://your-tunnel.example.com/api/clerk/webhooks
https://your-tunnel.example.com/api/stripe/webhooks
```

Then copy the webhook signing secrets into:

```text
CLERK_WEBHOOK_SIGNING_SECRET=
STRIPE_WEBHOOK_SECRET=
```

Required Clerk webhook event groups:

```text
organization.*
```

Required Stripe webhook event groups:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## Order Flow Test

1. Add products.
2. Add active payment methods.
3. Add active delivery methods.
4. Open the public web order link.
5. Create an order.
6. Review the order in the store dashboard.
7. Approve the order.
8. Complete the order and request review.
9. Send a customer rating message from 1 to 5.
10. Confirm the review is stored and counted in AI Operations.

## AI Flow Test

1. Confirm AI is blocked on `free`.
2. Confirm AI works on a paid Stripe subscription or admin-paid base override.
3. Send a customer message that includes an existing product name.
4. Confirm AI creates a pending order draft.
5. Complete the order and request review.
6. Send a rating response.
7. Confirm the rating is saved and linked to the completed order when phone or email matches.
8. Confirm monthly AI order limits are enforced.

## Admin Test

1. Convert a store from `free` to a paid plan.
2. Confirm base paid features open.
3. Convert it back to `free`.
4. Confirm paid features close again.
5. Suspend the store or pause individual features.
6. Confirm disabled features are blocked.

## Final Local Verification

```bash
npm run check:types
npm run lint
npm test
npm run check:i18n
npm run test:e2e
npm run build-local
```

## Do Not Share

Do not send these files or folders to another person:

```text
.env
.env.local
node_modules
.next
dev-server.log
dev-server.err.log
```

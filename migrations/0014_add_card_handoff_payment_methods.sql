INSERT INTO "payment_methods" (
  "organization_id",
  "provider",
  "type",
  "display_name",
  "is_active",
  "requires_online_payment",
  "supported_delivery_methods",
  "config"
)
SELECT
  "organization_id",
  'card_on_delivery',
  'offline',
  'Card on delivery',
  false,
  false,
  '["delivery"]'::jsonb,
  '{}'::jsonb
FROM "store_settings"
ON CONFLICT ("organization_id", "provider") DO NOTHING;

INSERT INTO "payment_methods" (
  "organization_id",
  "provider",
  "type",
  "display_name",
  "is_active",
  "requires_online_payment",
  "supported_delivery_methods",
  "config"
)
SELECT
  "organization_id",
  'card_on_pickup',
  'offline',
  'Card at pickup',
  false,
  false,
  '["pickup"]'::jsonb,
  '{}'::jsonb
FROM "store_settings"
ON CONFLICT ("organization_id", "provider") DO NOTHING;

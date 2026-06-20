UPDATE "payment_methods"
SET
  "supported_delivery_methods" = '["delivery"]'::jsonb,
  "updated_at" = now()
WHERE "provider" = 'cash_on_delivery';

UPDATE "payment_methods"
SET
  "supported_delivery_methods" = '["pickup"]'::jsonb,
  "updated_at" = now()
WHERE "provider" = 'cash_on_pickup';

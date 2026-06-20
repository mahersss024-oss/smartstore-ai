UPDATE "payment_methods"
SET
  "is_active" = false,
  "supported_delivery_methods" = '[]'::jsonb,
  "updated_at" = now()
WHERE "provider" = 'bank_transfer';

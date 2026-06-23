-- Add a non-guessable tracking token to each order so public tracking URLs cannot
-- be brute-forced via sequential order IDs + phone guessing.
-- Existing rows are backfilled with a random UUID; new rows default to gen_random_uuid().
ALTER TABLE orders ADD COLUMN tracking_token TEXT;
UPDATE orders SET tracking_token = gen_random_uuid()::text WHERE tracking_token IS NULL;
ALTER TABLE orders ALTER COLUMN tracking_token SET DEFAULT gen_random_uuid()::text;
ALTER TABLE orders ALTER COLUMN tracking_token SET NOT NULL;
CREATE UNIQUE INDEX orders_organization_tracking_token_unique ON orders (organization_id, tracking_token);

-- Collapse duplicate phone verification rows that accumulated while
-- requestPhoneOtp used onConflictDoNothing without a matching unique
-- constraint. Keep the most recent row per (organization, session, phone).
DELETE FROM "phone_verifications" AS older
USING "phone_verifications" AS newer
WHERE older."organization_id" = newer."organization_id"
  AND older."session_id" = newer."session_id"
  AND older."phone" = newer."phone"
  AND older."id" < newer."id";

-- Replace the non-unique lookup index with a unique one so repeated OTP
-- requests upsert a single row instead of inserting duplicates.
DROP INDEX IF EXISTS "phone_verifications_org_session_phone_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "phone_verifications_org_session_phone_unique"
  ON "phone_verifications" ("organization_id", "session_id", "phone");

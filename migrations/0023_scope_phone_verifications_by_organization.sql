CREATE TABLE IF NOT EXISTS "phone_verifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" text,
  "session_id" text NOT NULL,
  "phone" text NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "verified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "phone_verifications"
  ADD COLUMN IF NOT EXISTS "organization_id" text;

UPDATE "phone_verifications"
SET "organization_id" = 'legacy_unscoped'
WHERE "organization_id" IS NULL;

ALTER TABLE "phone_verifications"
  ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX IF EXISTS "phone_verifications_session_phone_idx";

CREATE INDEX IF NOT EXISTS "phone_verifications_org_session_phone_idx"
  ON "phone_verifications" ("organization_id", "session_id", "phone");

CREATE INDEX IF NOT EXISTS "phone_verifications_expires_idx"
  ON "phone_verifications" ("expires_at");

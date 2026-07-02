DROP INDEX IF EXISTS "channel_connections_meta_phone_number_idx";

CREATE INDEX IF NOT EXISTS "channel_connections_whapi_channel_idx"
  ON "channel_connections" ((config ->> 'channelId'))
  WHERE channel = 'whatsapp' AND is_active = true;

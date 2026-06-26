-- The legacy Twilio per-store sender lookup index is no longer used: the
-- WhatsApp channel now runs on the Cloud API (Meta) and resolves the store by
-- config->>'phoneNumberId' (channel_connections_meta_phone_number_idx).
DROP INDEX IF EXISTS channel_connections_whatsapp_from_idx;

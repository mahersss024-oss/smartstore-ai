-- WhatsApp Cloud API (Meta) inbound webhooks resolve the store by the
-- config->>'phoneNumberId' that Meta sends in the webhook metadata. Restore the
-- partial expression index (it existed for the original Meta design as
-- channel_connections_whatsapp_phone_number_id_idx, dropped in 0024 during the
-- Twilio-only migration) so the lookup does not scan all whatsapp connections.
CREATE INDEX IF NOT EXISTS channel_connections_meta_phone_number_idx
    ON channel_connections ((config->>'phoneNumberId'))
    WHERE channel = 'whatsapp' AND is_active = true;

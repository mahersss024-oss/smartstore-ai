-- Inbound Twilio webhooks resolve the store by config->>'twilioWhatsAppFrom'.
-- Without this expression index every inbound WhatsApp message triggers a full
-- scan of all active whatsapp connections (a pre-auth scan that does not scale
-- to many stores). The partial index matches the lookup's exact predicate.
CREATE INDEX IF NOT EXISTS channel_connections_whatsapp_from_idx
    ON channel_connections ((config->>'twilioWhatsAppFrom'))
    WHERE channel = 'whatsapp' AND is_active = true;

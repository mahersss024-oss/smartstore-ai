CREATE INDEX IF NOT EXISTS channel_connections_whatsapp_phone_number_id_idx
ON channel_connections ((config->>'phoneNumberId'))
WHERE channel = 'whatsapp' AND is_active = true;

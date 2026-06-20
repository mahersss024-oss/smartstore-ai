INSERT INTO "channel_connections" (
  "organization_id",
  "channel",
  "display_name",
  "is_active",
  "connection_status",
  "ai_mode",
  "config",
  "created_at",
  "updated_at"
)
SELECT
  "organization_id",
  'whatsapp',
  'WhatsApp',
  true,
  'direct_link',
  'assist',
  jsonb_build_object(
    'connectionStatus', 'direct_link',
    'customerMapping', 'whatsapp_phone',
    'directLinkStatus', 'ready',
    'eventArchitecture', 'webhook_ready',
    'mode', 'direct_link',
    'notificationRouting', jsonb_build_array('web_chat', 'whatsapp'),
    'orderMapping', 'source_channel_order',
    'phoneNumber', whatsapp_number,
    'provider', 'manual_direct_link',
    'qrType', 'whatsapp',
    'webhookReady', true,
    'whatsappLink', concat('https://wa.me/', regexp_replace(whatsapp_number, '\D', '', 'g'), '?text=Hello%2C%20I%20would%20like%20to%20place%20an%20order.'),
    'whatsappTarget', concat('https://wa.me/', regexp_replace(whatsapp_number, '\D', '', 'g'))
  ),
  now(),
  now()
FROM (
  SELECT
    "organization_id",
    "store_name",
    trim("metadata"->'contactChannels'->>'whatsapp') AS whatsapp_number
  FROM "store_settings"
  WHERE trim(coalesce("metadata"->'contactChannels'->>'whatsapp', '')) <> ''
    AND lower(trim(coalesce("metadata"->'contactChannels'->>'whatsapp', ''))) NOT IN ('true', 'false')
) stores_with_whatsapp
WHERE regexp_replace(whatsapp_number, '\D', '', 'g') <> ''
ON CONFLICT ("organization_id", "channel") DO NOTHING;

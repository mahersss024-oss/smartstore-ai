DROP INDEX IF EXISTS channel_connections_whatsapp_phone_number_id_idx;

WITH ranked_twilio_connections AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY config->>'twilioWhatsAppFrom'
      ORDER BY id
    ) AS connection_rank
  FROM channel_connections
  WHERE channel = 'whatsapp'
    AND is_active = true
    AND config->>'provider' = 'twilio'
    AND NULLIF(config->>'twilioWhatsAppFrom', '') IS NOT NULL
)
UPDATE channel_connections AS connection
SET
  connection_status = 'duplicate_configuration',
  is_active = false,
  updated_at = localtimestamp
FROM ranked_twilio_connections AS ranked
WHERE connection.id = ranked.id
  AND ranked.connection_rank > 1;

UPDATE channel_connections
SET
  config = (
    COALESCE(config, '{}'::jsonb)
      - 'accessToken'
      - 'businessAccountId'
      - 'connectionMethod'
      - 'displayPhoneNumber'
      - 'encryptedAccessToken'
      - 'hasAccessToken'
      - 'phoneNumberId'
      - 'webhookProvider'
  ) || jsonb_build_object(
    'connectionMethod', 'twilio_direct_setup',
    'mode', 'twilio',
    'provider', 'twilio',
    'webhookProvider', 'twilio'
  ),
  connection_status = CASE
    WHEN connection_status = 'duplicate_configuration'
      THEN 'duplicate_configuration'
    WHEN config->>'twilioAccountSid' ~ '^AC[[:xdigit:]]{32}$'
      AND NULLIF(config->>'encryptedTwilioAuthToken', '') IS NOT NULL
      AND config->>'twilioWhatsAppFrom' ~ '^whatsapp:\+[0-9]{8,15}$'
      THEN 'connected'
    ELSE 'pending_setup'
  END,
  is_active = CASE
    WHEN connection_status = 'duplicate_configuration'
      THEN false
    WHEN config->>'twilioAccountSid' ~ '^AC[[:xdigit:]]{32}$'
      AND NULLIF(config->>'encryptedTwilioAuthToken', '') IS NOT NULL
      AND config->>'twilioWhatsAppFrom' ~ '^whatsapp:\+[0-9]{8,15}$'
      THEN true
    ELSE false
  END,
  updated_at = localtimestamp
WHERE channel = 'whatsapp';

UPDATE store_settings
SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{channelIntegrations,whatsapp}',
    (
      COALESCE(metadata#>'{channelIntegrations,whatsapp}', '{}'::jsonb)
        - 'accessToken'
        - 'businessAccountId'
        - 'displayPhoneNumber'
        - 'encryptedAccessToken'
        - 'phoneNumberId'
    ) || jsonb_build_object('mode', 'twilio'),
    true
  ),
  updated_at = localtimestamp
WHERE metadata#>'{channelIntegrations,whatsapp}' IS NOT NULL;

UPDATE platform_settings
SET
  value = COALESCE(value, '{}'::jsonb) - 'whatsapp',
  updated_at = localtimestamp
WHERE key = 'runtime_config'
  AND COALESCE(value, '{}'::jsonb) ? 'whatsapp';

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_twilio_whatsapp_from_active_unique
ON channel_connections ((config->>'twilioWhatsAppFrom'))
WHERE channel = 'whatsapp'
  AND is_active = true
  AND config->>'provider' = 'twilio'
  AND NULLIF(config->>'twilioWhatsAppFrom', '') IS NOT NULL;

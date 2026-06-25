// One-off: create/update a store's WhatsApp Cloud API (Meta) channel connection
// so the Meta webhook can resolve it. Encrypts the access token in the same
// AES-256-GCM format the app uses. Run once with the values from the Meta app.
//
//   PLATFORM_SECRETS_ENCRYPTION_KEY=...  (must match the app / .secrets.render.local)
//   DATABASE_URL=postgres://...neon...
//   META_SEED_PHONE_NUMBER_ID=123456789012345
//   META_SEED_ACCESS_TOKEN=EAA....
//   META_SEED_WABA_ID=...            (optional)
//   META_SEED_DISPLAY_PHONE=+9665... (optional)
//   META_SEED_ORG_ID=org_...         (optional — defaults to the existing whatsapp store)
//   node scripts/seed-meta-whatsapp-connection.mjs
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const readEnv = (name) => {
  if (process.env[name]) return process.env[name];
  for (const file of ['.secrets.render.local', '.env.local', '.env']) {
    try {
      const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
      if (line) {
        let v = line.slice(name.length + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) v = v.slice(1, -1);
        if (v) return v;
      }
    } catch {}
  }
  return undefined;
};

const encryptSecret = (value, secret) => {
  const iv = randomBytes(12);
  const key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

const databaseUrl = readEnv('DATABASE_URL');
const encryptionKey = readEnv('PLATFORM_SECRETS_ENCRYPTION_KEY');
const phoneNumberId = process.env.META_SEED_PHONE_NUMBER_ID;
const accessToken = process.env.META_SEED_ACCESS_TOKEN;
const wabaId = process.env.META_SEED_WABA_ID ?? null;
const displayPhoneNumber = process.env.META_SEED_DISPLAY_PHONE ?? null;

if (!databaseUrl || !encryptionKey || !phoneNumberId || !accessToken) {
  console.error('Missing required env: DATABASE_URL, PLATFORM_SECRETS_ENCRYPTION_KEY, META_SEED_PHONE_NUMBER_ID, META_SEED_ACCESS_TOKEN');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 1 });

try {
  let organizationId = process.env.META_SEED_ORG_ID;
  if (!organizationId) {
    const { rows } = await pool.query(`SELECT organization_id FROM channel_connections WHERE channel = 'whatsapp' ORDER BY id LIMIT 1`);
    organizationId = rows[0]?.organization_id;
  }
  if (!organizationId) {
    console.error('No organization_id given and no existing whatsapp connection to infer it from. Set META_SEED_ORG_ID.');
    process.exit(1);
  }

  const config = {
    displayPhoneNumber,
    encryptedAccessToken: encryptSecret(accessToken, encryptionKey),
    phoneNumberId,
    provider: 'meta',
    wabaId,
  };

  await pool.query(
    `INSERT INTO channel_connections (organization_id, channel, display_name, is_active, connection_status, ai_mode, config, updated_at, created_at)
     VALUES ($1, 'whatsapp', 'WhatsApp', true, 'connected', 'assist', $2::jsonb, now(), now())
     ON CONFLICT (organization_id, channel)
     DO UPDATE SET is_active = true, connection_status = 'connected', config = $2::jsonb, updated_at = now()`,
    [organizationId, JSON.stringify(config)],
  );

  console.log('✓ Meta WhatsApp connection seeded');
  console.log('  organizationId :', organizationId);
  console.log('  phoneNumberId  :', phoneNumberId);
  console.log('  token          : encrypted (', config.encryptedAccessToken.length, 'chars )');
} catch (e) {
  console.error('seed error:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}

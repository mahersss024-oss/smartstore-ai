import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { getPlatformRuntimeConfig } from '@/libs/PlatformRuntimeConfig';
import { secureTokenEquals } from '@/libs/SecureTokens';
import { renewWhapiManagedChannels } from '@/libs/WhapiChannelRenewal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = async (request: Request) => {
  const runtimeConfig = await getPlatformRuntimeConfig();
  const maintenanceSecret = runtimeConfig.internal.maintenanceSecret;
  const acceptedSecrets = [maintenanceSecret, Env.CRON_SECRET].filter(
    (value): value is string => Boolean(value),
  );

  if (acceptedSecrets.length === 0) {
    return NextResponse.json(
      { error: 'Maintenance endpoint is not configured' },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!acceptedSecrets.some(secret => secureTokenEquals(token, secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!Env.WHAPI_PARTNER_API_TOKEN || !Env.WHAPI_PROJECT_ID) {
    return NextResponse.json({
      checked: 0,
      extended: 0,
      failed: 0,
      missing: 0,
      skipped: true,
      skippedInactiveStore: 0,
      skippedNotDue: 0,
      skippedRecentlyExtended: 0,
    });
  }

  const result = await renewWhapiManagedChannels();

  return NextResponse.json({
    renewedAt: new Date().toISOString(),
    skipped: false,
    ...result,
  });
};

export const GET = POST;

import { NextResponse } from 'next/server';
import { cleanupExpiredOperationalData } from '@/libs/OperationalDataRetention';
import { getPlatformRuntimeConfig } from '@/libs/PlatformRuntimeConfig';
import { secureTokenEquals } from '@/libs/SecureTokens';

export const dynamic = 'force-dynamic';

export const POST = async (request: Request) => {
  const runtimeConfig = await getPlatformRuntimeConfig();
  const maintenanceSecret = runtimeConfig.internal.maintenanceSecret;

  if (!maintenanceSecret) {
    return NextResponse.json(
      { error: 'Maintenance endpoint is not configured' },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!secureTokenEquals(token, maintenanceSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await cleanupExpiredOperationalData();

  return NextResponse.json({
    cleanedAt: new Date().toISOString(),
    ...result,
  });
};

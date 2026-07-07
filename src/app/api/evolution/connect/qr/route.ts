import { randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import {
  ensureEvolutionInstanceForQr,
  EvolutionConnectError,
  isEvolutionConnectConfigured,
  normalizeEvolutionInstanceName,
} from '@/libs/EvolutionConnect';
import { logger } from '@/libs/Logger';
import {
  channelConnectionsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { buildWhatsAppChannelConfig } from '@/utils/CustomerChannels';

type StoreSettingsMetadata = {
  channelIntegrations?: {
    whatsapp?: Record<string, unknown>;
  };
  contactChannels?: Record<string, unknown>;
};

type EvolutionConnectionConfig = {
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  provider?: null | string;
  webhookSecret?: null | string;
};

const generateWebhookSecret = () => randomBytes(24).toString('hex');

const getOrigin = async () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto')
    ?? (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');

  return host ? `${protocol}://${host}` : '';
};

const getSafeErrorResponse = (error: unknown) => {
  if (error instanceof EvolutionConnectError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502 },
    );
  }

  return NextResponse.json({ error: 'evolution_qr_connect_failed' }, { status: 500 });
};

export const POST = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!isEvolutionConnectConfigured()) {
    return NextResponse.json({ error: 'evolution_connect_not_configured' }, { status: 503 });
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`evolution_qr_connect:${orgId}`}))`);

      const [settings] = await tx
        .select({
          metadata: storeSettingsTable.metadata,
          storeName: storeSettingsTable.storeName,
        })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1);
      const [existingConnection] = await tx
        .select({
          config: channelConnectionsTable.config,
        })
        .from(channelConnectionsTable)
        .where(
          and(
            eq(channelConnectionsTable.organizationId, orgId),
            eq(channelConnectionsTable.channel, 'whatsapp'),
          ),
        )
        .limit(1);
      const existingConfig = (existingConnection?.config ?? {}) as EvolutionConnectionConfig;
      const existingInstanceName = existingConfig.provider === 'evolution' && existingConfig.channelId
        ? existingConfig.channelId
        : '';
      const instanceName = existingInstanceName || normalizeEvolutionInstanceName(orgId);
      const webhookSecret = existingConfig.webhookSecret?.trim() || generateWebhookSecret();
      const origin = await getOrigin();
      const webhookUrl = `${origin}/api/whatsapp/webhook?provider=evolution&instanceName=${
        encodeURIComponent(instanceName)
      }&secret=${encodeURIComponent(webhookSecret)}`;
      const storeName = settings?.storeName ?? 'SmartStore';

      const result = await ensureEvolutionInstanceForQr({
        instanceName,
        webhookUrl,
      });

      const whatsappChannel = buildWhatsAppChannelConfig({
        apiTokenPreview: null,
        channelId: instanceName,
        displayPhoneNumber: existingConfig.displayPhoneNumber ?? null,
        encryptedApiToken: null,
        hasApiToken: true,
        provider: 'evolution',
        status: 'connected',
        storeName,
        webhookReady: true,
        webhookSecret,
      });
      const whatsappChannelConfig = {
        ...whatsappChannel.config,
        instanceName,
        managedByPlatform: true,
      };

      const [lockedSettings] = await tx
        .select({ metadata: storeSettingsTable.metadata })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1)
        .for('update');
      const metadata = (lockedSettings?.metadata ?? settings?.metadata ?? {}) as StoreSettingsMetadata;
      const displayPhoneNumber = existingConfig.displayPhoneNumber ?? '';
      const nextContactChannels = {
        ...(metadata.contactChannels ?? {}),
      };

      if (displayPhoneNumber) {
        nextContactChannels.whatsapp = displayPhoneNumber;
      } else {
        delete nextContactChannels.whatsapp;
      }

      const nextMetadata: StoreSettingsMetadata = {
        ...metadata,
        channelIntegrations: {
          ...(metadata.channelIntegrations ?? {}),
          whatsapp: {
            ...(metadata.channelIntegrations?.whatsapp ?? {}),
            channelId: instanceName,
            connectionStatus: whatsappChannel.connectionStatus,
            displayPhoneNumber,
            instanceName,
            managedByPlatform: true,
            mode: whatsappChannel.mode,
            phoneNumber: displayPhoneNumber,
            provider: 'evolution',
            webhookReady: true,
            webhookSecret,
            whatsappLink: whatsappChannel.whatsappLink,
            whatsappTarget: whatsappChannel.whatsappTarget,
          },
        },
        contactChannels: nextContactChannels,
      };

      if (lockedSettings || settings) {
        await tx
          .update(storeSettingsTable)
          .set({ metadata: nextMetadata })
          .where(eq(storeSettingsTable.organizationId, orgId));
      } else {
        await tx.insert(storeSettingsTable).values({
          metadata: nextMetadata,
          organizationId: orgId,
          storeName: 'SmartStore',
        });
      }

      await tx
        .insert(channelConnectionsTable)
        .values({
          aiMode: 'assist',
          channel: 'whatsapp',
          config: whatsappChannelConfig,
          connectionStatus: whatsappChannel.connectionStatus,
          displayName: 'WhatsApp',
          isActive: whatsappChannel.isActive,
          organizationId: orgId,
        })
        .onConflictDoUpdate({
          set: {
            aiMode: 'assist',
            config: whatsappChannelConfig,
            connectionStatus: whatsappChannel.connectionStatus,
            displayName: 'WhatsApp',
            isActive: whatsappChannel.isActive,
          },
          target: [
            channelConnectionsTable.organizationId,
            channelConnectionsTable.channel,
          ],
        });

      logger.info('Evolution QR connect prepared', {
        instanceName,
        organizationId: orgId,
      });

      return NextResponse.json({
        instanceName: result.instanceName,
        qrDataUrl: result.qrDataUrl,
        webhookReady: true,
        webhookUrl,
      });
    });
  } catch (error) {
    logger.warn('Evolution QR connect failed', {
      detail: error instanceof EvolutionConnectError ? error.detail : undefined,
      error: error instanceof Error ? error.message : 'unknown_error',
      organizationId: orgId,
      status: error instanceof EvolutionConnectError ? error.status : undefined,
    });

    return getSafeErrorResponse(error);
  }
};

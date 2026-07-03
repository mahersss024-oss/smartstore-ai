import type { WhapiManagedChannel } from '@/libs/WhapiConnect';
import { randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { maskApiKey } from '@/libs/PlatformAIProviderConfig';
import {
  activateWhapiManagedChannel,
  checkWhapiManagedChannelExists,
  configureWhapiChannelWebhook,
  createWhapiManagedChannel,
  fetchWhapiQrCodeDataUrl,
  getWhapiManagedChannel,
  isWhapiManagedConnectConfigured,
  restartWhapiManagedChannel,
  WhapiConnectError,
} from '@/libs/WhapiConnect';
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

type WhapiConnectionConfig = {
  apiTokenPreview?: null | string;
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  managedChannelActivatedAt?: null | string;
  provider?: null | string;
  webhookSecret?: null | string;
};

const generateWebhookSecret = () => randomBytes(24).toString('hex');

const isWhapiQrPendingError = (error: WhapiConnectError) => {
  return [404, 429, 502, 503, 504].includes(error.status ?? 0);
};

const getOrigin = async () => {
  if (Env.NEXT_PUBLIC_APP_URL) {
    return Env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto')
    ?? (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');

  return host ? `${protocol}://${host}` : '';
};

const getSafeErrorResponse = (error: unknown) => {
  if (error instanceof WhapiConnectError) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502 },
    );
  }

  return NextResponse.json(
    {
      error: 'whapi_qr_connect_failed',
    },
    { status: 500 },
  );
};

export const POST = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!isWhapiManagedConnectConfigured()) {
    return NextResponse.json({ error: 'whapi_managed_connect_not_configured' }, { status: 503 });
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`whapi_qr_connect:${orgId}`}))`);

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
      const existingConfig = (existingConnection?.config ?? {}) as WhapiConnectionConfig;
      const existingChannelId = existingConfig.provider === 'whapi' && existingConfig.channelId
        ? existingConfig.channelId
        : '';
      const storeName = settings?.storeName ?? 'SmartStore';
      const createManagedChannel = () => createWhapiManagedChannel({
        name: `${storeName} - ${orgId}`,
      });
      const loadExistingManagedChannel = async () => {
        if (!existingChannelId) {
          return null;
        }

        try {
          const upstreamChannel = await getWhapiManagedChannel({ channelId: existingChannelId });

          if (!upstreamChannel) {
            return null;
          }

          return {
            ...upstreamChannel,
            displayPhoneNumber: upstreamChannel.displayPhoneNumber
              ?? existingConfig.displayPhoneNumber
              ?? undefined,
          };
        } catch (error) {
          logger.warn('Whapi saved channel lookup deferred', {
            channelId: existingChannelId,
            detail: error instanceof WhapiConnectError ? error.detail : undefined,
            error: error instanceof Error ? error.message : 'unknown_error',
            organizationId: orgId,
            status: error instanceof WhapiConnectError ? error.status : undefined,
          });

          throw error;
        }
      };
      const existingManagedChannel = await loadExistingManagedChannel();
      const isUsingExistingChannel = Boolean(existingManagedChannel);
      let managedChannel: WhapiManagedChannel = existingManagedChannel ?? await createManagedChannel();
      let hasReplacedManagedChannel = Boolean(existingChannelId && !existingManagedChannel);
      const managedChannelActivatedAt = typeof existingConfig.managedChannelActivatedAt === 'string'
        && existingConfig.managedChannelActivatedAt.trim()
        ? existingConfig.managedChannelActivatedAt
        : null;

      let nextManagedChannelActivatedAt = managedChannelActivatedAt;
      const activateChannelForQr = async (channelId: string) => {
        try {
          await activateWhapiManagedChannel({ channelId });
        } catch (error) {
          if (error instanceof WhapiConnectError && error.message === 'whapi_channel_extend_failed') {
            logger.warn('Whapi channel extension deferred', {
              channelId,
              detail: error.detail,
              error: error.message,
              organizationId: orgId,
              status: error.status,
            });
            return;
          }

          throw error;
        }
      };

      const checkChannelExists = async (channelId: string) => {
        try {
          return await checkWhapiManagedChannelExists({ channelId });
        } catch (error) {
          logger.warn('Whapi channel existence check deferred', {
            channelId,
            detail: error instanceof WhapiConnectError ? error.detail : undefined,
            error: error instanceof Error ? error.message : 'unknown_error',
            organizationId: orgId,
            status: error instanceof WhapiConnectError ? error.status : undefined,
          });
          return true;
        }
      };

      const restartChannelForQr = async (channelId: string) => {
        try {
          await restartWhapiManagedChannel({ channelId });
        } catch (error) {
          logger.warn('Whapi channel restart deferred', {
            channelId,
            detail: error instanceof WhapiConnectError ? error.detail : undefined,
            error: error instanceof Error ? error.message : 'unknown_error',
            organizationId: orgId,
            status: error instanceof WhapiConnectError ? error.status : undefined,
          });
        }
      };

      if (!nextManagedChannelActivatedAt) {
        await activateChannelForQr(managedChannel.channelId);
        nextManagedChannelActivatedAt = new Date().toISOString();
      }

      const webhookSecret = existingConfig.webhookSecret?.trim() || generateWebhookSecret();
      const origin = await getOrigin();
      const buildWebhookUrl = (channelId: string) => {
        return `${origin}/api/whatsapp/webhook?provider=whapi&channelId=${
          encodeURIComponent(channelId)
        }&secret=${encodeURIComponent(webhookSecret)}`;
      };
      let webhookUrl = buildWebhookUrl(managedChannel.channelId);

      let webhookReady = false;

      const configureWebhook = async () => {
        await configureWhapiChannelWebhook({
          apiToken: managedChannel.apiToken,
          webhookUrl,
        });
        webhookReady = true;
      };

      try {
        await configureWebhook();
      } catch (error) {
        const shouldReplaceMissingChannel = isUsingExistingChannel
          && error instanceof WhapiConnectError
          && error.status === 404
          && !(await checkChannelExists(managedChannel.channelId));

        if (shouldReplaceMissingChannel) {
          logger.warn('Whapi saved channel missing; creating replacement channel', {
            channelId: managedChannel.channelId,
            detail: error.detail,
            error: error.message,
            organizationId: orgId,
            status: error.status,
          });
          managedChannel = await createManagedChannel();
          hasReplacedManagedChannel = true;
          await activateChannelForQr(managedChannel.channelId);
          nextManagedChannelActivatedAt = new Date().toISOString();
          webhookUrl = buildWebhookUrl(managedChannel.channelId);
          try {
            await configureWebhook();
          } catch (replacementError) {
            logger.warn('Whapi webhook configure deferred', {
              channelId: managedChannel.channelId,
              detail: replacementError instanceof WhapiConnectError ? replacementError.detail : undefined,
              error: replacementError instanceof Error ? replacementError.message : 'unknown_error',
              organizationId: orgId,
              status: replacementError instanceof WhapiConnectError ? replacementError.status : undefined,
            });
          }
        } else {
          logger.warn('Whapi webhook configure deferred', {
            channelId: managedChannel.channelId,
            detail: error instanceof WhapiConnectError ? error.detail : undefined,
            error: error instanceof Error ? error.message : 'unknown_error',
            organizationId: orgId,
            status: error instanceof WhapiConnectError ? error.status : undefined,
          });
        }
      }

      const persistManagedChannel = async () => {
        const apiTokenPreview = maskApiKey(managedChannel.apiToken);
        const displayPhoneNumber = managedChannel.displayPhoneNumber
          ?? (hasReplacedManagedChannel ? '' : existingConfig.displayPhoneNumber)
          ?? '';
        const whatsappChannel = buildWhatsAppChannelConfig({
          apiTokenPreview,
          channelId: managedChannel.channelId,
          displayPhoneNumber,
          encryptedApiToken: null,
          hasApiToken: true,
          provider: 'whapi',
          status: 'connected',
          storeName,
          webhookReady,
          webhookSecret,
        });
        const whatsappChannelConfig = {
          ...whatsappChannel.config,
          managedByPlatform: true,
          managedChannelActivatedAt: nextManagedChannelActivatedAt,
        };

        const [lockedSettings] = await tx
          .select({ metadata: storeSettingsTable.metadata })
          .from(storeSettingsTable)
          .where(eq(storeSettingsTable.organizationId, orgId))
          .limit(1)
          .for('update');
        const metadata = (lockedSettings?.metadata ?? settings?.metadata ?? {}) as StoreSettingsMetadata;
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
              apiTokenPreview,
              channelId: managedChannel.channelId,
              connectionStatus: whatsappChannel.connectionStatus,
              displayPhoneNumber,
              managedByPlatform: true,
              managedChannelActivatedAt: nextManagedChannelActivatedAt,
              mode: whatsappChannel.mode,
              phoneNumber: displayPhoneNumber,
              provider: 'whapi',
              webhookReady,
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
      };

      await persistManagedChannel();
      await restartChannelForQr(managedChannel.channelId);

      let qrDataUrl = '';
      let qrPending = false;

      try {
        qrDataUrl = await fetchWhapiQrCodeDataUrl({
          apiToken: managedChannel.apiToken,
        });
      } catch (error) {
        if (error instanceof WhapiConnectError && isWhapiQrPendingError(error)) {
          const shouldReplaceMissingChannel = isUsingExistingChannel
            && error.status === 404
            && !(await checkChannelExists(managedChannel.channelId));

          if (shouldReplaceMissingChannel) {
            logger.warn('Whapi saved channel missing during QR fetch; creating replacement channel', {
              channelId: managedChannel.channelId,
              detail: error.detail,
              error: error.message,
              organizationId: orgId,
              status: error.status,
            });
            managedChannel = await createManagedChannel();
            hasReplacedManagedChannel = true;
            await activateChannelForQr(managedChannel.channelId);
            nextManagedChannelActivatedAt = new Date().toISOString();
            webhookReady = false;
            webhookUrl = buildWebhookUrl(managedChannel.channelId);

            try {
              await configureWebhook();
            } catch (replacementError) {
              logger.warn('Whapi webhook configure deferred', {
                channelId: managedChannel.channelId,
                detail: replacementError instanceof WhapiConnectError ? replacementError.detail : undefined,
                error: replacementError instanceof Error ? replacementError.message : 'unknown_error',
                organizationId: orgId,
                status: replacementError instanceof WhapiConnectError ? replacementError.status : undefined,
              });
            }

            await persistManagedChannel();
            await restartChannelForQr(managedChannel.channelId);
            try {
              qrDataUrl = await fetchWhapiQrCodeDataUrl({
                apiToken: managedChannel.apiToken,
              });
            } catch (replacementQrError) {
              if (replacementQrError instanceof WhapiConnectError && isWhapiQrPendingError(replacementQrError)) {
                qrPending = true;
                logger.warn('Whapi replacement QR fetch deferred', {
                  channelId: managedChannel.channelId,
                  detail: replacementQrError.detail,
                  error: replacementQrError.message,
                  organizationId: orgId,
                  status: replacementQrError.status,
                });
              } else {
                throw replacementQrError;
              }
            }
          } else {
            qrPending = true;
            logger.warn('Whapi QR fetch deferred', {
              channelId: managedChannel.channelId,
              detail: error.detail,
              error: error.message,
              organizationId: orgId,
              status: error.status,
            });
          }
        } else {
          throw error;
        }
      }

      logger.info('Whapi QR connect prepared', {
        channelId: managedChannel.channelId,
        organizationId: orgId,
        qrPending,
      });

      if (qrPending) {
        return NextResponse.json(
          {
            channelId: managedChannel.channelId,
            error: 'whapi_channel_initializing',
            pending: true,
            retryAfterSeconds: 90,
            webhookReady,
            webhookUrl,
          },
          { status: 202 },
        );
      }

      return NextResponse.json({
        channelId: managedChannel.channelId,
        qrDataUrl,
        webhookReady,
        webhookUrl,
      });
    });
  } catch (error) {
    logger.warn('Whapi QR connect failed', {
      detail: error instanceof WhapiConnectError ? error.detail : undefined,
      error: error instanceof Error ? error.message : 'unknown_error',
      organizationId: orgId,
      status: error instanceof WhapiConnectError ? error.status : undefined,
    });

    return getSafeErrorResponse(error);
  }
};

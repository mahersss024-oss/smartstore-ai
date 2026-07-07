import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from './Env';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('./DB', () => ({
  db: {
    select: mocks.select,
  },
}));

const createSelectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    then: vi.fn((resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => {
      return Promise.resolve(rows).then(resolve, reject);
    }),
    where: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);

  return chain;
};

const mockConnectionRows = (rows: unknown[]) => {
  mocks.select.mockReturnValueOnce(createSelectChain(rows));
};

describe('EvolutionWhatsApp', () => {
  let evolutionModule: typeof import('./EvolutionWhatsApp');

  beforeAll(async () => {
    evolutionModule = await import('./EvolutionWhatsApp');
  }, 15000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    Object.assign(Env, {
      EVOLUTION_API_BASE_URL: 'https://evolution.test',
      EVOLUTION_API_KEY: 'global_key',
    });
  });

  it('parses an inbound Evolution messages.upsert payload', () => {
    const { parseEvolutionWebhookPayload } = evolutionModule;

    expect(parseEvolutionWebhookPayload({
      data: {
        key: {
          id: 'msg_1',
          remoteJid: '966500000001@s.whatsapp.net',
        },
        message: {
          conversation: 'salam',
        },
        pushName: 'Maher',
      },
      event: 'messages.upsert',
      instance: 'smartstore-org-1',
    })).toEqual({
      body: 'salam',
      from: '966500000001',
      instanceName: 'smartstore-org-1',
      messageId: 'msg_1',
      profileName: 'Maher',
    });
  });

  it('skips outgoing echoes', () => {
    const { parseEvolutionWebhookPayload } = evolutionModule;

    expect(parseEvolutionWebhookPayload({
      data: {
        key: {
          fromMe: true,
          id: 'msg_1',
          remoteJid: '966500000001@s.whatsapp.net',
        },
        message: {
          conversation: 'salam',
        },
      },
      instance: 'smartstore-org-1',
    })).toBeNull();
  });

  it('sends outbound WhatsApp replies through Evolution API for ewa threads', async () => {
    mockConnectionRows([{
      config: {
        channelId: 'smartstore-org-1',
        provider: 'evolution',
        webhookSecret: 'secret',
      },
      connectionStatus: 'connected',
      isActive: true,
      organizationId: 'org_1',
    }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'evolution_message_1' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { sendEvolutionConversationTextMessage } = evolutionModule;

    const result = await sendEvolutionConversationTextMessage({
      body: 'جاهز',
      externalThreadId: 'ewa:smartstore-org-1:966500000001',
      organizationId: 'org_1',
    });

    expect(result).toEqual({
      outboundMessageId: 'evolution_message_1',
      status: 'sent',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.test/message/sendText/smartstore-org-1',
      expect.objectContaining({
        body: JSON.stringify({
          number: '966500000001',
          text: 'جاهز',
        }),
        headers: expect.objectContaining({
          apikey: 'global_key',
        }),
      }),
    );
  });
});

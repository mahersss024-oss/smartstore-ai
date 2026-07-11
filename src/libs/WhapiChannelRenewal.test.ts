import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from './Env';
import { renewWhapiManagedChannels } from './WhapiChannelRenewal';

const now = new Date('2026-07-05T12:00:00.000Z');

const buildDeps = (overrides: Partial<Parameters<typeof renewWhapiManagedChannels>[1]> = {}) => {
  return {
    extendChannel: vi.fn(async () => undefined),
    getChannel: vi.fn(async () => ({
      activeUntil: '2026-07-05T18:00:00.000Z',
      apiToken: 'channel_token',
      channelId: 'CATWMN-B42ST',
    })),
    isWhatsappEnabled: vi.fn(async () => true),
    loadCandidates: vi.fn(async () => [{
      config: {
        channelId: 'CATWMN-B42ST',
        provider: 'whapi',
      },
      id: 7,
      organizationId: 'org_1',
    }]),
    saveConnectionConfig: vi.fn(async () => undefined),
    ...overrides,
  };
};

describe('WhapiChannelRenewal', () => {
  beforeEach(() => {
    Object.assign(Env, {
      WHAPI_CHANNEL_RENEW_COOLDOWN_HOURS: 20,
      WHAPI_CHANNEL_RENEW_LOOKAHEAD_HOURS: 24,
      WHAPI_MANAGED_CHANNEL_EXTEND_DAYS: 1,
    });
  });

  it('extends active store channels that are close to expiry', async () => {
    const deps = buildDeps();

    await expect(renewWhapiManagedChannels({ now }, deps))
      .resolves
      .toMatchObject({
        checked: 1,
        extended: 1,
      });

    expect(deps.extendChannel).toHaveBeenCalledWith({
      channelId: 'CATWMN-B42ST',
      comment: '[SmartStore AI] Automatic active store renewal',
      days: 1,
    });
    expect(deps.saveConnectionConfig).toHaveBeenCalledWith(expect.objectContaining({
      connectionStatus: 'connected',
      id: 7,
      isActive: true,
    }));
  });

  it('does not extend when the store subscription or WhatsApp feature is inactive', async () => {
    const deps = buildDeps({
      isWhatsappEnabled: vi.fn(async () => false),
    });

    await expect(renewWhapiManagedChannels({ now }, deps))
      .resolves
      .toMatchObject({
        extended: 0,
        skippedInactiveStore: 1,
      });

    expect(deps.extendChannel).not.toHaveBeenCalled();
  });

  it('does not extend the same channel repeatedly inside the renewal cooldown', async () => {
    const deps = buildDeps({
      loadCandidates: vi.fn(async () => [{
        config: {
          channelId: 'CATWMN-B42ST',
          provider: 'whapi',
          whapiAutoRenew: {
            lastExtendedAt: '2026-07-05T02:00:00.000Z',
          },
        },
        id: 7,
        organizationId: 'org_1',
      }]),
    });

    await expect(renewWhapiManagedChannels({ now }, deps))
      .resolves
      .toMatchObject({
        extended: 0,
        skippedRecentlyExtended: 1,
      });

    expect(deps.getChannel).not.toHaveBeenCalled();
    expect(deps.extendChannel).not.toHaveBeenCalled();
  });

  it('keeps a transiently missing Whapi channel active and records the miss', async () => {
    const deps = buildDeps({
      getChannel: vi.fn(async () => null),
    });

    await expect(renewWhapiManagedChannels({ now }, deps))
      .resolves
      .toMatchObject({
        missing: 1,
      });

    expect(deps.extendChannel).not.toHaveBeenCalled();
    expect(deps.saveConnectionConfig).toHaveBeenCalledWith(expect.objectContaining({
      id: 7,
      config: expect.objectContaining({
        whapiAutoRenew: expect.objectContaining({ consecutiveMissing: 1 }),
      }),
    }));
    // Not deactivated on a single miss.
    expect(deps.saveConnectionConfig).not.toHaveBeenCalledWith(expect.objectContaining({
      isActive: false,
    }));
  });

  it('deactivates a Whapi channel once it is missing on the threshold consecutive pass', async () => {
    const deps = buildDeps({
      getChannel: vi.fn(async () => null),
      loadCandidates: vi.fn(async () => [{
        config: {
          channelId: 'CATWMN-B42ST',
          provider: 'whapi',
          whapiAutoRenew: {
            consecutiveMissing: 2,
          },
        },
        id: 7,
        organizationId: 'org_1',
      }]),
    });

    await expect(renewWhapiManagedChannels({ now }, deps))
      .resolves
      .toMatchObject({
        missing: 1,
      });

    expect(deps.extendChannel).not.toHaveBeenCalled();
    expect(deps.saveConnectionConfig).toHaveBeenCalledWith(expect.objectContaining({
      connectionStatus: 'disconnected',
      id: 7,
      isActive: false,
      config: expect.objectContaining({
        whapiAutoRenew: expect.objectContaining({ consecutiveMissing: 3 }),
      }),
    }));
  });
});

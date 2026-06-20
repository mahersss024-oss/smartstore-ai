import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not_found');
  }),
  platformAdminUserIds: '',
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('./Env', () => ({
  Env: {
    get PLATFORM_ADMIN_USER_IDS() {
      return mocks.platformAdminUserIds;
    },
  },
}));

describe('PlatformAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformAdminUserIds = '';
    mocks.currentUser.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: null });
  });

  it('grants every permission to configured platform owners', async () => {
    mocks.platformAdminUserIds = ' user_1, user_2 ';
    const {
      hasPlatformPermission,
      PLATFORM_PERMISSIONS,
    } = await import('./PlatformAdmin');

    await expect(hasPlatformPermission(
      'user_1',
      PLATFORM_PERMISSIONS.MANAGE_STORES,
    )).resolves.toBe(true);
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it('combines valid metadata roles and explicit permissions', async () => {
    mocks.currentUser.mockResolvedValue({
      id: 'user_1',
      privateMetadata: {
        permissions: ['platform:billing:manage', 'invalid'],
        role: 'platform_viewer',
      },
      publicMetadata: {
        roles: ['platform_support', 'invalid'],
      },
    });
    const {
      hasPlatformPermission,
      PLATFORM_PERMISSIONS,
    } = await import('./PlatformAdmin');

    await expect(hasPlatformPermission(
      'user_1',
      PLATFORM_PERMISSIONS.VIEW_STORES,
    )).resolves.toBe(true);
    await expect(hasPlatformPermission(
      'user_1',
      PLATFORM_PERMISSIONS.MANAGE_SERVICE,
    )).resolves.toBe(true);
    await expect(hasPlatformPermission(
      'user_1',
      PLATFORM_PERMISSIONS.MANAGE_BILLING,
    )).resolves.toBe(true);
    await expect(hasPlatformPermission(
      'user_1',
      PLATFORM_PERMISSIONS.MANAGE_STORES,
    )).resolves.toBe(false);
  });

  it('fails closed when the authenticated user lacks permission', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    const {
      PLATFORM_PERMISSIONS,
      requirePlatformPermission,
    } = await import('./PlatformAdmin');

    await expect(requirePlatformPermission(
      PLATFORM_PERMISSIONS.MANAGE_STORES,
    )).rejects.toThrow('not_found');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('returns the authenticated context and resolved access', async () => {
    mocks.auth.mockResolvedValue({
      orgId: 'org_1',
      userId: 'user_1',
    });
    mocks.currentUser.mockResolvedValue({
      id: 'user_1',
      privateMetadata: {
        role: 'platform_owner',
      },
      publicMetadata: {},
    });
    const {
      PLATFORM_PERMISSIONS,
      requirePlatformPermission,
    } = await import('./PlatformAdmin');

    await expect(requirePlatformPermission(
      PLATFORM_PERMISSIONS.MANAGE_STORES,
    )).resolves.toMatchObject({
      orgId: 'org_1',
      platformAccess: {
        userId: 'user_1',
      },
      userId: 'user_1',
    });
  });

  it('returns false immediately when userId is null without querying Clerk', async () => {
    const {
      hasPlatformPermission,
      PLATFORM_PERMISSIONS,
    } = await import('./PlatformAdmin');

    await expect(hasPlatformPermission(null, PLATFORM_PERMISSIONS.VIEW_STORES)).resolves.toBe(false);
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it('requirePlatformAdmin delegates to requirePlatformPermission with VIEW_STORES', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.platformAdminUserIds = 'user_1';
    const { requirePlatformAdmin } = await import('./PlatformAdmin');

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      userId: 'user_1',
    });
  });
});

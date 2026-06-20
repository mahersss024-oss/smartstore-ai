import { auth, currentUser } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { Env } from './Env';

export const PLATFORM_PERMISSIONS = {
  MANAGE_BILLING: 'platform:billing:manage',
  MANAGE_SERVICE: 'platform:service:manage',
  MANAGE_STORES: 'platform:stores:manage',
  VIEW_STORES: 'platform:stores:view',
} as const;

export type PlatformPermission
  = typeof PLATFORM_PERMISSIONS[keyof typeof PLATFORM_PERMISSIONS];

type PlatformRole
  = | 'platform_admin'
    | 'platform_billing'
    | 'platform_owner'
    | 'platform_support'
    | 'platform_viewer';

type PlatformAdminMetadata = {
  permissions?: unknown;
  role?: unknown;
  roles?: unknown;
};

type PlatformAdminAccess = {
  permissions: PlatformPermission[];
  userId: string;
};

const ALL_PLATFORM_PERMISSIONS = Object.values(PLATFORM_PERMISSIONS);

const ROLE_PERMISSIONS = {
  platform_admin: ALL_PLATFORM_PERMISSIONS,
  platform_owner: ALL_PLATFORM_PERMISSIONS,
  platform_billing: [
    PLATFORM_PERMISSIONS.VIEW_STORES,
    PLATFORM_PERMISSIONS.MANAGE_BILLING,
  ],
  platform_support: [
    PLATFORM_PERMISSIONS.VIEW_STORES,
    PLATFORM_PERMISSIONS.MANAGE_SERVICE,
  ],
  platform_viewer: [
    PLATFORM_PERMISSIONS.VIEW_STORES,
  ],
} satisfies Record<PlatformRole, PlatformPermission[]>;

const getPlatformAdminUserIds = () => {
  return (Env.PLATFORM_ADMIN_USER_IDS ?? '')
    .split(',')
    .map(userId => userId.trim())
    .filter(Boolean);
};

const isPlatformRole = (value: unknown): value is PlatformRole => {
  return typeof value === 'string' && value in ROLE_PERMISSIONS;
};

const isPlatformPermission = (value: unknown): value is PlatformPermission => {
  return typeof value === 'string'
    && ALL_PLATFORM_PERMISSIONS.includes(value as PlatformPermission);
};

const getMetadataRoles = (metadata: PlatformAdminMetadata) => {
  const roles = new Set<PlatformRole>();

  if (isPlatformRole(metadata.role)) {
    roles.add(metadata.role);
  }

  if (Array.isArray(metadata.roles)) {
    for (const role of metadata.roles) {
      if (isPlatformRole(role)) {
        roles.add(role);
      }
    }
  }

  return [...roles];
};

const getMetadataPermissions = (metadata: PlatformAdminMetadata) => {
  const permissions = new Set<PlatformPermission>();

  for (const role of getMetadataRoles(metadata)) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }

  if (Array.isArray(metadata.permissions)) {
    for (const permission of metadata.permissions) {
      if (isPlatformPermission(permission)) {
        permissions.add(permission);
      }
    }
  }

  return permissions;
};

const getPlatformAdminAccess = async (
  userId: string | null | undefined,
): Promise<PlatformAdminAccess | null> => {
  if (!userId) {
    return null;
  }

  const adminUserIds = getPlatformAdminUserIds();

  if (adminUserIds.includes(userId)) {
    return {
      permissions: ALL_PLATFORM_PERMISSIONS,
      userId,
    };
  }

  const user = await currentUser();
  const permissions = new Set<PlatformPermission>();

  if (user?.id === userId) {
    for (const permission of getMetadataPermissions(user.privateMetadata)) {
      permissions.add(permission);
    }

    for (const permission of getMetadataPermissions(user.publicMetadata)) {
      permissions.add(permission);
    }
  }

  if (permissions.size > 0) {
    return {
      permissions: [...permissions],
      userId,
    };
  }

  return null;
};

export const hasPlatformPermission = async (
  userId: string | null | undefined,
  permission: PlatformPermission,
) => {
  const access = await getPlatformAdminAccess(userId);

  return access?.permissions.includes(permission) ?? false;
};

export const requirePlatformPermission = async (
  permission: PlatformPermission,
) => {
  const authContext = await auth();
  const access = await getPlatformAdminAccess(authContext.userId);

  if (!access?.permissions.includes(permission)) {
    notFound();
  }

  return {
    ...authContext,
    platformAccess: access,
  };
};

export const requirePlatformAdmin = async () => {
  return requirePlatformPermission(PLATFORM_PERMISSIONS.VIEW_STORES);
};

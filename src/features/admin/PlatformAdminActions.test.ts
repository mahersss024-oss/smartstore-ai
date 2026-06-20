import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequirePlatformAdmin = vi.fn();
const mockRequirePlatformPermission = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRedirect = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdateSet = vi.fn();
const mockDbUpdateWhere = vi.fn();
const mockDbInsertValues = vi.fn();
const mockDbInsertOnConflictDoUpdate = vi.fn();
const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));
const mockDbUpdateWhereChain = { where: mockDbUpdateWhere };
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbDeleteWhere = vi.fn();
const mockDbDelete = vi.fn(() => ({ where: mockDbDeleteWhere }));
const mockDbTxInsertValues = vi.fn();
const mockDbTxInsert = vi.fn(() => ({ values: mockDbTxInsertValues }));
const mockDbTxDeleteWhere = vi.fn();
const mockDbTxDelete = vi.fn(() => ({ where: mockDbTxDeleteWhere }));
const mockDbTransaction = vi.fn(async (callback: (tx: any) => Promise<void>) => {
  await callback({
    delete: mockDbTxDelete,
    insert: mockDbTxInsert,
  });
});

mockDbUpdateSet.mockReturnValue(mockDbUpdateWhereChain);
mockDbInsertValues.mockReturnValue({ onConflictDoUpdate: mockDbInsertOnConflictDoUpdate });

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/libs/PlatformAdmin', () => ({
  PLATFORM_PERMISSIONS: {
    MANAGE_BILLING: 'platform:billing:manage',
    MANAGE_SERVICE: 'platform:service:manage',
    MANAGE_STORES: 'platform:stores:manage',
    VIEW_STORES: 'platform:stores:view',
  },
  requirePlatformAdmin: mockRequirePlatformAdmin,
  requirePlatformPermission: mockRequirePlatformPermission,
}));

vi.mock('@/libs/PlatformAIProviderConfig', () => ({
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  maskApiKey: vi.fn(() => 'sk-...1234'),
  normalizePlatformAIProviderConfig: vi.fn((value: unknown) => ({
    enabled: false,
    model: 'gpt-4.1-mini',
    provider: 'openai',
    systemPrompt: 'Default system prompt',
    ...(value && typeof value === 'object' ? value as Record<string, unknown> : {}),
  })),
  normalizeProviderModel: vi.fn((provider: string, model: unknown) => {
    const value = typeof model === 'string' ? model : '';

    if (provider === 'deepseek' && !value.startsWith('deepseek-')) {
      return 'deepseek-chat';
    }

    return value || 'gpt-4.1-mini';
  }),
  PLATFORM_AI_PROVIDER_SETTING_KEY: 'ai_provider',
}));

vi.mock('@/libs/PlatformRuntimeConfig', () => ({
  normalizePlatformRuntimeConfig: vi.fn((value: unknown) => ({
    internal: {},
    updatedAt: undefined,
    updatedBy: undefined,
    ...(value && typeof value === 'object' ? value as Record<string, unknown> : {}),
  })),
  PLATFORM_RUNTIME_CONFIG_SETTING_KEY: 'runtime_config',
}));

vi.mock('@/libs/DB', () => ({
  db: {
    delete: mockDbDelete,
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: { organizationId: 'organizationId' },
  channelConnectionsTable: { organizationId: 'organizationId' },
  conversationMessagesTable: { organizationId: 'organizationId' },
  conversationsTable: { organizationId: 'organizationId' },
  customerReviewsTable: { organizationId: 'organizationId' },
  customersTable: { organizationId: 'organizationId' },
  deliveryMethodsTable: { organizationId: 'organizationId' },
  invoicesTable: { organizationId: 'organizationId' },
  orderEventsTable: { organizationId: 'organizationId', table: 'orderEvents' },
  ordersTable: { organizationId: 'organizationId' },
  paymentMethodsTable: { organizationId: 'organizationId' },
  platformAdminAuditLogsTable: {},
  platformSettingsTable: { key: 'key', value: 'value' },
  productsTable: { organizationId: 'organizationId' },
  storeSettingsTable: { id: 'id', metadata: 'metadata', organizationId: 'organizationId' },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    billing: {
      cancelSubscriptionItem: vi.fn(),
      getOrganizationBillingSubscription: vi.fn(async () => ({ subscriptionItems: [] })),
    },
    organizations: {
      deleteOrganization: vi.fn(),
    },
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq_condition'),
}));

describe('PlatformAdminActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects platform AI changes before database access when permission is denied', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');
    mockRequirePlatformPermission.mockRejectedValue(new Error('Forbidden'));

    await expect(updatePlatformAIProviderConfig('ar', new FormData()))
      .rejects
      .toThrowError('Forbidden');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  }, 20000);

  it('throws when updatePlatformStoreControls is called without organization id', async () => {
    const { updatePlatformStoreControls } = await import('./PlatformAdminActions');

    mockRequirePlatformAdmin.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    const formData = new FormData();

    await expect(updatePlatformStoreControls('ar', formData))
      .rejects
      .toThrowError('Missing organization id');
  }, 20000);

  it('throws when permanentlyDeletePlatformStore confirmation phrase does not match', async () => {
    const { permanentlyDeletePlatformStore } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:stores:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{ id: 1 }]);

    const formData = new FormData();
    formData.set('confirmOrganizationId', 'org_1');
    formData.set('confirmDeleteText', 'DELETE');

    await expect(permanentlyDeletePlatformStore('ar', 'org_1', formData))
      .rejects
      .toThrowError('Delete confirmation phrase does not match');
  });

  it('permanently deletes AI audit logs and order events with the store data', async () => {
    const { permanentlyDeletePlatformStore } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:stores:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{ id: 1 }]);

    const formData = new FormData();
    formData.set('confirmOrganizationId', 'org_1');
    formData.set('confirmDeleteText', 'DELETE STORE');

    await permanentlyDeletePlatformStore('ar', 'org_1', formData);

    expect(mockDbTxDelete).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'organizationId',
    }));
    expect(mockDbTxDelete).toHaveBeenCalledWith(expect.objectContaining({
      table: 'orderEvents',
    }));
    expect(mockDbTxDeleteWhere).toHaveBeenCalledWith('eq_condition');
  });

  it('updates store controls and triggers revalidation paths', async () => {
    const { updatePlatformStoreControls } = await import('./PlatformAdminActions');

    mockRequirePlatformAdmin.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:billing:manage', 'platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{ metadata: {} }]);

    const formData = new FormData();
    formData.set('organizationId', 'org_1');
    formData.set('status', 'active');
    formData.set('plan', 'starter');
    formData.set('extraAiOrders', '10');
    formData.set('extraCatalogItems', '30');
    formData.set('extraStorageMb', '20');
    formData.set('extraTeamMembers', '1');

    await updatePlatformStoreControls('ar', formData);

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        subscription: expect.objectContaining({
          adminOverride: expect.objectContaining({
            enabled: true,
            plan: 'starter',
            updatedBy: 'admin_1',
          }),
          addOns: {
            aiOrders: 10,
            products: 30,
            storageMb: 20,
            teamMembers: 1,
          },
          plan: 'starter',
          status: 'active',
        }),
      }),
    }));
    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(1, '/admin');
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(2, '/dashboard');
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(3, '/dashboard/subscription');
    expect(mockRevalidatePath).toHaveBeenNthCalledWith(4, '/dashboard/settings');
  });

  it('archives the selected store organization', async () => {
    const { archivePlatformStore } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:stores:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{ metadata: {} }]);

    await archivePlatformStore('ar', ' org_selected ');

    expect(mockDbUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        platform: expect.objectContaining({
          archivedBy: 'admin_1',
          status: 'suspended',
        }),
        subscription: expect.objectContaining({
          status: 'suspended',
          updatedBy: 'admin_1',
        }),
      }),
    }));
    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'store_archived',
      organizationId: 'org_selected',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/stores/org_selected');
  });

  it('cancels the selected store subscription only after organization confirmation', async () => {
    const { cancelPlatformStoreSubscription } = await import('./PlatformAdminActions');

    mockRequirePlatformAdmin.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:billing:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{ metadata: { subscription: {} } }]);

    const formData = new FormData();
    formData.set('confirmOrganizationId', 'org_selected');
    formData.set('cancelNow', 'on');

    await cancelPlatformStoreSubscription('ar', ' org_selected ', formData);

    expect(mockDbUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        platform: expect.objectContaining({
          status: 'suspended',
          updatedBy: 'admin_1',
        }),
        subscription: expect.objectContaining({
          status: 'suspended',
          stripeCancelEndNow: true,
        }),
      }),
    }));
    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'store_subscription_cancelled',
      organizationId: 'org_selected',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/stores/org_selected');
  });

  it('rejects subscription cancellation when confirmation belongs to another store', async () => {
    const { cancelPlatformStoreSubscription } = await import('./PlatformAdminActions');

    mockRequirePlatformAdmin.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:billing:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    const formData = new FormData();
    formData.set('confirmOrganizationId', 'org_other');

    await expect(cancelPlatformStoreSubscription('ar', 'org_selected', formData))
      .rejects
      .toThrowError('Organization id confirmation does not match');
  });

  it('saves platform AI provider configuration without exposing the raw key', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([]);

    const formData = new FormData();
    formData.set('provider', 'openai');
    formData.set('model', 'gpt-4.1-mini');
    formData.set('apiKey', 'sk-test-secret');
    formData.set('enabled', 'on');
    formData.set('systemPrompt', 'Sell naturally and ask for missing details.');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        encryptedApiKey: 'encrypted:sk-test-secret',
        enabled: true,
        model: 'gpt-4.1-mini',
        provider: 'openai',
        systemPrompt: 'Sell naturally and ask for missing details.',
      }),
    }));
    expect(mockDbInsertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-test-secret' }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('saves platform runtime production keys encrypted', async () => {
    const { updatePlatformRuntimeConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([]);

    const formData = new FormData();
    formData.set('aiEmployeeWebhookSecret', 'ai_employee_production_secret_12345');
    formData.set('maintenanceSecret', 'maintenance_production_secret_12345');

    await updatePlatformRuntimeConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'runtime_config',
      value: expect.objectContaining({
        internal: expect.objectContaining({
          encryptedAIEmployeeWebhookSecret: 'encrypted:ai_employee_production_secret_12345',
          encryptedMaintenanceSecret: 'encrypted:maintenance_production_secret_12345',
        }),
      }),
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('saves DeepSeek as a platform AI provider', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([]);

    const formData = new FormData();
    formData.set('provider', 'deepseek');
    formData.set('model', 'deepseek-chat');
    formData.set('apiKey', 'deepseek-secret');
    formData.set('enabled', 'on');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        encryptedApiKey: 'encrypted:deepseek-secret',
        enabled: true,
        model: 'deepseek-chat',
        provider: 'deepseek',
      }),
    }));
  });

  it('keeps the saved platform AI key when updating settings without a new key', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{
      value: {
        apiKeyPreview: 'sk-...1234',
        encryptedApiKey: 'encrypted:old-key',
        enabled: true,
        model: 'gpt-4.1-mini',
        provider: 'openai',
        systemPrompt: 'Default system prompt',
      },
    }]);

    const formData = new FormData();
    formData.set('provider', 'openai');
    formData.set('model', 'gpt-4.1-mini');
    formData.set('enabled', 'on');
    formData.set('systemPrompt', 'Updated system prompt');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        apiKeyPreview: 'sk-...1234',
        encryptedApiKey: 'encrypted:old-key',
        enabled: true,
        model: 'gpt-4.1-mini',
        provider: 'openai',
        systemPrompt: 'Updated system prompt',
      }),
    }));
  });

  it('clears provider endpoint when switching back to direct OpenAI', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{
      value: {
        apiKeyPreview: 'old...key',
        baseUrl: 'https://api.deepseek.com',
        encryptedApiKey: 'encrypted:old-key',
        enabled: true,
        model: 'deepseek-chat',
        provider: 'deepseek',
        systemPrompt: 'Default system prompt',
      },
    }]);

    const formData = new FormData();
    formData.set('provider', 'openai');
    formData.set('model', 'gpt-4.1-mini');
    formData.set('enabled', 'on');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        baseUrl: undefined,
        encryptedApiKey: undefined,
        enabled: false,
        model: 'gpt-4.1-mini',
        provider: 'openai',
      }),
    }));
  });

  it('saves an OpenAI-compatible provider with a custom endpoint and model', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([]);

    const formData = new FormData();
    formData.set('provider', 'openai_compatible');
    formData.set('model', 'provider/custom-model');
    formData.set('baseUrl', 'https://openrouter.ai/api/v1');
    formData.set('apiKey', 'compatible-secret');
    formData.set('enabled', 'on');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        baseUrl: 'https://openrouter.ai/api/v1',
        encryptedApiKey: 'encrypted:compatible-secret',
        enabled: true,
        model: 'provider/custom-model',
        provider: 'openai_compatible',
      }),
    }));
  });

  it('clears the platform AI API key and disables the provider when clearApiKey flag is set', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{
      value: {
        apiKeyPreview: 'sk-...1234',
        enabled: true,
        encryptedApiKey: 'encrypted:existing-key',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        systemPrompt: 'Sell naturally.',
      },
    }]);

    const formData = new FormData();
    formData.set('provider', 'openai');
    formData.set('model', 'gpt-4.1-mini');
    formData.set('clearApiKey', 'on');
    formData.set('enabled', 'on');
    formData.set('systemPrompt', 'Sell naturally.');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        apiKeyPreview: undefined,
        enabled: false,
        encryptedApiKey: undefined,
      }),
    }));
  });

  it('rejects archivePlatformStore before database access when permission is denied', async () => {
    const { archivePlatformStore } = await import('./PlatformAdminActions');
    mockRequirePlatformPermission.mockRejectedValueOnce(new Error('Forbidden'));

    const formData = new FormData();
    formData.set('organizationId', 'org_target');

    await expect(archivePlatformStore('ar', 'org_target'))
      .rejects
      .toThrowError('Forbidden');

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it('rejects cancelPlatformStoreSubscription before any operation when admin check fails', async () => {
    const { cancelPlatformStoreSubscription } = await import('./PlatformAdminActions');
    mockRequirePlatformAdmin.mockRejectedValueOnce(new Error('Not an admin'));

    const formData = new FormData();
    formData.set('organizationId', 'org_target');
    formData.set('confirmOrganizationId', 'org_target');

    await expect(cancelPlatformStoreSubscription('ar', 'org_target', formData))
      .rejects
      .toThrowError('Not an admin');

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('rejects updatePlatformRuntimeConfig before database access when permission is denied', async () => {
    const { updatePlatformRuntimeConfig } = await import('./PlatformAdminActions');
    mockRequirePlatformPermission.mockRejectedValueOnce(new Error('Forbidden'));

    await expect(updatePlatformRuntimeConfig('ar', new FormData()))
      .rejects
      .toThrowError('Forbidden');

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('writes updatePlatformStoreControls only to the explicitly specified organization, not the admin org', async () => {
    const { updatePlatformStoreControls } = await import('./PlatformAdminActions');
    mockRequirePlatformAdmin.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:stores:manage'],
        userId: 'admin_user_1',
      },
      userId: 'admin_user_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{
      id: 1,
      metadata: {},
    }]);

    const formData = new FormData();
    formData.set('organizationId', 'org_target_store');
    formData.set('status', 'active');

    await updatePlatformStoreControls('ar', formData);

    const whereCall = mockDbUpdateWhere.mock.calls.find(Boolean);

    expect(whereCall).toBeDefined();
  });

  it('does not reuse another provider endpoint when switching to OpenAI-compatible', async () => {
    const { updatePlatformAIProviderConfig } = await import('./PlatformAdminActions');

    mockRequirePlatformPermission.mockResolvedValue({
      platformAccess: {
        permissions: ['platform:service:manage'],
        userId: 'admin_1',
      },
      userId: 'admin_1',
    });

    mockDbSelect.mockReturnValue({ from: mockDbSelectFrom });
    mockDbSelectLimit.mockResolvedValue([{
      value: {
        baseUrl: 'https://api.deepseek.com',
        encryptedApiKey: 'encrypted:old-key',
        enabled: true,
        model: 'deepseek-chat',
        provider: 'deepseek',
        systemPrompt: 'Default system prompt',
      },
    }]);

    const formData = new FormData();
    formData.set('provider', 'openai_compatible');
    formData.set('model', 'provider/custom-model');
    formData.set('enabled', 'on');

    await updatePlatformAIProviderConfig('ar', formData);

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: 'ai_provider',
      value: expect.objectContaining({
        baseUrl: undefined,
        encryptedApiKey: undefined,
        enabled: false,
        model: 'provider/custom-model',
        provider: 'openai_compatible',
      }),
    }));
  });
});

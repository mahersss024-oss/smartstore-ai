import { describe, expect, it } from 'vitest';
import * as schema from './Schema';

const platformScopedTables = new Set([
  'platformSettingsTable',
  'publicEndpointRateLimitsTable',
  'webhookEventsTable',
]);

const requiredTenantConstraintNames = [
  'orders_organization_id_unique',
  'customers_organization_id_unique',
  'customers_organization_channel_external_unique',
  'conversations_organization_id_unique',
  'conversations_organization_channel_thread_unique',
  'channel_connections_organization_channel_unique',
  'customer_reviews_organization_order_customer_unique',
];

describe('Schema tenant isolation contract', () => {
  it('keeps every store-owned table scoped by organizationId', () => {
    const storeOwnedTables = Object.entries(schema)
      .filter(([name]) => name.endsWith('Table') && !platformScopedTables.has(name));

    expect(storeOwnedTables.length).toBeGreaterThan(0);

    for (const [name, table] of storeOwnedTables) {
      expect(table, `${name} must include organizationId`).toHaveProperty('organizationId');
    }
  });

  it('keeps critical uniqueness constraints organization-scoped', async () => {
    const source = await import('node:fs/promises')
      .then(fs => fs.readFile(new URL('./Schema.ts', import.meta.url), 'utf8'));

    for (const constraintName of requiredTenantConstraintNames) {
      expect(source).toContain(constraintName);
    }
  });
});

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const organizationId = 'org_e2e_responsive';

const getDatabaseUrl = () => {
  const port = process.env.DB_PORT ?? '5433';

  return `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
};

const seedResponsiveStore = async () => {
  const client = new Client({ connectionString: getDatabaseUrl() });

  await client.connect();
  await client.query('delete from products where organization_id = $1', [organizationId]);
  await client.query('delete from store_settings where organization_id = $1', [organizationId]);
  await client.query(`
    insert into store_settings (
      organization_id,
      store_name,
      store_description,
      welcome_message,
      currency,
      timezone,
      metadata
    )
    values ($1, $2, $3, $4, 'SAR', 'Asia/Riyadh', $5::jsonb)
  `, [
    organizationId,
    'Responsive E2E Store',
    'A long responsive store description used to catch mobile overflow in the smart link and web order experience.',
    'Welcome to the responsive store.',
    JSON.stringify({
      contactChannels: {
        whatsapp: '+966500000000',
      },
      customerEntry: {
        defaultChannel: 'web',
        mode: 'web_whatsapp',
      },
      platform: {
        status: 'active',
      },
      subscription: {
        adminOverride: {
          enabled: true,
          plan: 'pro',
        },
        status: 'active',
      },
    }),
  ]);
  await client.query(`
    insert into products (organization_id, name, description, price, category, is_active, metadata)
    values
      ($1, 'Responsive Meal With A Very Long Name', 'Long product copy that must stay inside the customer card on mobile portrait.', '25.00', 'Meals', true, $2::jsonb),
      ($1, 'Responsive Drink', 'Small add-on drink.', '5.00', 'Drinks', true, $2::jsonb)
  `, [organizationId, JSON.stringify({ aiVisible: true, availability: 'available' })]);
  await client.end();
};

const viewports = [
  { height: 844, name: 'iPhone portrait', width: 390 },
  { height: 390, name: 'iPhone landscape', width: 844 },
  { height: 915, name: 'Android portrait', width: 412 },
  { height: 412, name: 'Android landscape', width: 915 },
  { height: 1024, name: 'Tablet portrait', width: 768 },
  { height: 768, name: 'Tablet landscape', width: 1024 },
  { height: 900, name: 'Desktop', width: 1440 },
] as const;

const pages = [
  { path: '/ar', text: /كل ما يحتاجه المتجر/ },
  { path: `/fr/connect/${organizationId}?source=qr`, text: /Responsive E2E Store/i },
  { path: `/fr/web-order/${organizationId}?source=qr`, text: /Responsive E2E Store/i },
  { path: `/ar/web-order/${organizationId}?source=qr`, text: /Responsive E2E Store/i },
] as const;

const assertNoHorizontalOverflow = async (pageName: string, viewportName: string, page: Page) => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
  });

  expect(overflow, `${pageName} should not overflow horizontally on ${viewportName}`).toBeLessThanOrEqual(1);
};

const assertNoBrokenFallbackText = async (pageName: string, page: Page) => {
  const bodyText = await page.locator('body').evaluate((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript').forEach(element => element.remove());

    return clone.textContent;
  });

  expect(bodyText, `${pageName} should not render broken translation fallbacks`).not.toContain('????');
};

const assertTapTargetsInsideViewport = async (
  pageName: string,
  viewportName: string,
  page: Page,
) => {
  const escapedElements = await page.locator('a:visible, button:visible').evaluateAll((nodes) => {
    const viewportWidth = document.documentElement.clientWidth;

    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const label = node.textContent?.trim() || node.getAttribute('aria-label') || node.tagName;

        return {
          label,
          left: rect.left,
          right: rect.right,
        };
      })
      .filter(item => item.label !== 'Compiling...')
      .filter(item => item.left < -1 || item.right > viewportWidth + 1);
  });

  expect(escapedElements, `${pageName} tap targets must stay inside ${viewportName}`).toEqual([]);
};

test.describe('Responsive layout stability', () => {
  test.setTimeout(60_000);

  test.beforeAll(async () => {
    await seedResponsiveStore();
  });

  for (const viewport of viewports) {
    test(`keeps public customer pages stable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });

      for (const pageCase of pages) {
        await page.goto(pageCase.path);

        await expect(page.getByText(pageCase.text).first()).toBeVisible();

        await assertNoHorizontalOverflow(pageCase.path, viewport.name, page);

        await assertNoBrokenFallbackText(pageCase.path, page);

        await assertTapTargetsInsideViewport(pageCase.path, viewport.name, page);
      }
    });
  }
});

import { Buffer } from 'node:buffer';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const organizationId = 'org_e2e_orchestration';
let mockAIBaseUrl = '';
let mockAIServer: http.Server | undefined;

const loadLocalEnv = () => {
  for (const fileName of ['.env', '.env.local']) {
    if (!fs.existsSync(fileName)) {
      continue;
    }

    const content = fs.readFileSync(fileName, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (key === 'DATABASE_URL') {
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1);
      }

      if (key === 'CLERK_SECRET_KEY') {
        process.env[key] = value;
      } else {
        process.env[key] ??= value;
      }
    }
  }
};

const encryptSecretForTest = (value: string) => {
  loadLocalEnv();
  const secret = process.env.CLERK_SECRET_KEY;

  if (!secret) {
    throw new Error('CLERK_SECRET_KEY is required for E2E AI provider encryption.');
  }

  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

const startMockAIProvider = async () => {
  mockAIServer = http.createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        messages?: Array<{ content?: string; role?: string }>;
      };
      const systemContent = payload.messages?.find(message => message.role === 'system')?.content ?? '';
      const userContent = payload.messages?.find(message => message.role === 'user')?.content ?? '';
      let assistantReplyUnderReview = '';

      try {
        const parsedUserContent = JSON.parse(userContent) as { assistantReply?: unknown };

        assistantReplyUnderReview = typeof parsedUserContent.assistantReply === 'string'
          ? parsedUserContent.assistantReply
          : '';
      } catch {
        assistantReplyUnderReview = '';
      }
      let content = 'E2E Meal is available for 25.00. I can help you choose it or answer any question.';

      if (systemContent.includes('internal safety reviewer')) {
        content = JSON.stringify({ replacementReply: '', safe: true });
      } else if (systemContent.includes('internal orchestration reviewer')) {
        if (/confirm|send order|ready.*order|review.*order/i.test(assistantReplyUnderReview)) {
          content = JSON.stringify({ requestedCustomerNeed: 'order_confirmation' });
        } else if (/payment|cash|card/i.test(assistantReplyUnderReview)) {
          content = JSON.stringify({ requestedCustomerNeed: 'payment_method' });
        } else if (/delivery|pickup|fulfillment/i.test(assistantReplyUnderReview)) {
          content = JSON.stringify({ requestedCustomerNeed: 'fulfillment_method' });
        } else {
          content = JSON.stringify({});
        }
      } else if (systemContent.includes('understand customer messages')) {
        content = JSON.stringify({ checkoutRequested: false, dialogueState: 'catalog_inquiry' });
      } else if (
        (() => {
          try {
            const parsed = JSON.parse(userContent) as { userMessage?: string };

            return /complaint|problem|issue/i.test(parsed.userMessage ?? '');
          } catch {
            return false;
          }
        })()
      ) {
        content = 'We sincerely apologize. Your complaint will be forwarded to the store manager directly.';
      } else if (
        userContent.includes('"paymentPreference":"cash_on_pickup"')
        || userContent.includes('"paymentPreference":"card_on_pickup"')
      ) {
        content = 'The order is ready for review. Check the details, then send order when ready.';
      } else if (
        userContent.includes('"deliveryPreference":"pickup"')
        && !userContent.includes('"paymentPreference"')
      ) {
        content = 'Pickup from branch is selected. Choose your payment method to continue.';
      } else if (
        userContent.includes('"customerDetails":{"phone":"0500000000"')
        && !userContent.includes('"deliveryPreference"')
      ) {
        content = 'Your phone number is saved. Choose delivery or pickup from branch to continue.';
      } else if (userContent.includes('"currentCart":{"items":[{') && userContent.includes('E2E Meal')) {
        content = 'E2E Meal is in your cart. Send your phone number to continue.';
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }));
    });
  });

  await new Promise<void>((resolve) => {
    mockAIServer!.listen(0, '127.0.0.1', resolve);
  });
  const address = mockAIServer.address();

  if (!address || typeof address === 'string') {
    throw new Error('Mock AI provider did not start on a TCP port.');
  }

  mockAIBaseUrl = `http://localhost:${address.port}`;
};

const getDatabaseUrl = () => {
  const port = process.env.DB_PORT ?? '5433';

  return `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
};

const seedOrder = async (options: {
  customerPhone: string;
  status?: string;
  totalPrice?: string;
}) => {
  const client = new Client({ connectionString: getDatabaseUrl() });

  await client.connect();
  const result = await client.query<{ id: number }>(`
    insert into orders (
      organization_id,
      customer_phone,
      customer_name,
      items,
      total_price,
      status
    )
    values ($1, $2, $3, $4::jsonb, $5, $6)
    returning id
  `, [
    organizationId,
    options.customerPhone,
    'E2E Customer',
    JSON.stringify([{ id: 1, name: 'E2E Meal', price: '25.00', quantity: 1 }]),
    options.totalPrice ?? '25.00',
    options.status ?? 'pending_store_review',
  ]);
  await client.end();

  return result.rows[0]!.id;
};

const seedStore = async () => {
  const client = new Client({ connectionString: getDatabaseUrl() });

  await client.connect();
  await client.query('delete from platform_settings where key = $1', ['ai_provider']);
  await client.query('delete from delivery_methods where organization_id = $1', [organizationId]);
  await client.query('delete from payment_methods where organization_id = $1', [organizationId]);
  await client.query('delete from products where organization_id = $1', [organizationId]);
  await client.query('delete from store_settings where organization_id = $1', [organizationId]);
  await client.query(`
    insert into platform_settings (key, value)
    values ('ai_provider', $1::jsonb)
  `, [
    JSON.stringify({
      baseUrl: mockAIBaseUrl,
      enabled: true,
      encryptedApiKey: encryptSecretForTest('sk-e2e-test-key'),
      model: 'e2e-chat-model',
      provider: 'openai_compatible',
      systemPrompt: 'You are a concise E2E store employee.',
    }),
  ]);
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
    'E2E Harmony Store',
    'Store used for orchestration E2E checks.',
    'Welcome from the E2E store.',
    JSON.stringify({
      aiEmployee: {
        displayName: 'E2E Agent',
        enabled: true,
        fallbackLanguage: 'fr',
        language: 'fr',
        welcomeMessage: 'Welcome from the E2E AI employee.',
      },
      location: {
        branchName: 'E2E Branch',
        city: 'tabuk',
        district: 'testing',
        mapsUrl: 'https://maps.example.test/e2e',
        phone: '0500000000',
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
      ($1, 'E2E Meal', 'A meal for browser orchestration checks.', '25.00', 'Meals', true, $2::jsonb),
      ($1, 'E2E Yogurt', 'A small add-on for checkout continuity checks.', '2.00', 'Add-ons', true, $2::jsonb)
  `, [organizationId, JSON.stringify({ aiVisible: true, availability: 'available' })]);
  await client.query(`
    insert into payment_methods (
      organization_id,
      provider,
      type,
      display_name,
      is_active,
      requires_online_payment,
      supported_delivery_methods
    )
    values
      ($1, 'cash_on_delivery', 'manual', 'Cash on delivery', true, false, $2::jsonb),
      ($1, 'cash_on_pickup', 'manual', 'Cash on pickup', true, false, $3::jsonb)
  `, [
    organizationId,
    JSON.stringify(['delivery']),
    JSON.stringify(['pickup']),
  ]);
  await client.query(`
    insert into delivery_methods (organization_id, type, display_name, is_active, fee, estimated_time)
    values
      ($1, 'local_delivery', 'Local delivery', true, '20.00', '40 minutes'),
      ($1, 'pickup', 'Pickup', true, '0.00', 'Ready time')
  `, [organizationId]);
  await client.end();
};

test.describe('Web order chat orchestration', () => {
  test.beforeAll(async () => {
    await startMockAIProvider();
    await seedStore();
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockAIServer?.close(() => resolve());
    });
  });

  test('renders store identity, chat controls, and system-owned side panels', async ({ page }) => {
    await page.goto(`/fr/web-order/${organizationId}?source=e2e`);

    await expect(page.getByRole('heading', { name: /E2E Harmony Store/ })).toBeVisible();
    await expect(page.getByText('E2E Agent')).toBeVisible();
    await expect(page.getByText('Welcome from the E2E AI employee.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer la position' })).toBeVisible();
    await expect(page.getByText('E2E Branch')).toBeVisible();
    await expect(page.getByText('0500000000')).toBeVisible();
    await expect(page.getByText('Livraison et retrait disponibles')).toBeVisible();
  });

  test('sends a real customer message and stores measurable orchestration quality', async ({ page }) => {
    await page.goto(`/fr/web-order/${organizationId}?source=e2e`);

    await page.getByLabel('Message a l\'employe du magasin').fill('What do you sell?');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();

    await expect(page.getByText(/E2E Meal is available/)).toBeVisible();

    const client = new Client({ connectionString: getDatabaseUrl() });
    await client.connect();
    const result = await client.query(`
      select metadata
      from conversation_messages
      where organization_id = $1
        and direction = 'outbound'
        and metadata ? 'aiOrchestration'
      order by id desc
      limit 1
    `, [organizationId]);
    await client.end();

    const orchestration = result.rows[0]?.metadata?.aiOrchestration;

    expect(orchestration?.quality?.level).toBe('excellent');
    expect(orchestration?.quality?.score).toBe(100);
    expect(orchestration?.issues ?? []).toEqual([]);
    expect(orchestration?.systemDecisionReasons).toContain('cart_empty');
  });

  test('keeps fulfilled pickup state when the customer adds another item', async ({ page }) => {
    test.slow();

    const enabledButtonCount = async (label: string) => {
      return page.locator('button').filter({ hasText: label }).evaluateAll((nodes) => {
        return (nodes as HTMLButtonElement[]).filter(node => !node.disabled).length;
      });
    };
    const clickEnabledButton = async (label: string) => {
      await expect.poll(() => enabledButtonCount(label)).toBeGreaterThan(0);

      await page.locator('button').filter({ hasText: label }).evaluateAll((nodes) => {
        const button = (nodes as HTMLButtonElement[]).find(node => !node.disabled);

        if (!button) {
          throw new Error(`No enabled button found for ${label}`);
        }

        button.click();
      });
    };
    const clickEnabledButtonIfAvailable = async (label: string) => {
      await page.locator('button').filter({ hasText: label }).evaluateAll((nodes) => {
        (nodes as HTMLButtonElement[]).find(node => !node.disabled)?.click();
      });
    };
    const sendMessage = async (text: string) => {
      await page.getByLabel('Message a l\'employe du magasin').fill(text);
      await page.getByRole('button', { name: 'Envoyer le message' }).click();
    };

    await page.goto(`/fr/web-order/${organizationId}?source=e2e-checkout`);

    await sendMessage('I want E2E Meal');

    await expect(page.locator('button').filter({ hasText: 'E2E Meal' }).first()).toBeVisible();

    await page.locator('button').filter({ hasText: 'E2E Meal' }).first().click();

    await expect(page.getByText('Commande actuelle').first()).toBeVisible();
    await expect(page.getByText('E2E Meal', { exact: true }).last()).toBeVisible();

    await sendMessage('0500000000');

    await expect(page.getByRole('button', { name: 'Retrait en magasin' })).toBeVisible();

    await clickEnabledButton('Retrait en magasin');

    await expect(page.getByRole('button', { name: 'Retrait en magasin' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Livraison' })).toBeDisabled();
    await expect.poll(() => enabledButtonCount('Retrait en magasin')).toBe(0);
    await expect.poll(() => enabledButtonCount('Livraison')).toBe(0);

    await expect(page.getByRole('button', { name: 'Especes' })).toBeVisible();

    await expect.poll(async () => {
      const cashIsEnabled = await enabledButtonCount('Especes') > 0;
      const confirmIsVisible = await page.getByRole('button', { name: 'Oui, envoyer la commande' }).isVisible();

      return cashIsEnabled || confirmIsVisible;
    }).toBe(true);

    await clickEnabledButtonIfAvailable('Especes');

    await expect(page.getByRole('button', { name: 'Oui, envoyer la commande' })).toBeVisible();

    await clickEnabledButton('Ajouter une commande');
    await sendMessage('Add E2E Yogurt');

    await expect(page.locator('button').filter({ hasText: 'E2E Yogurt' }).last()).toBeVisible();

    await clickEnabledButton('E2E Yogurt');

    await expect(page.getByText('E2E Yogurt', { exact: true }).last()).toBeVisible();
    await expect.poll(() => enabledButtonCount('Retrait en magasin')).toBe(0);
    await expect.poll(() => enabledButtonCount('Livraison')).toBe(0);

    const client = new Client({ connectionString: getDatabaseUrl() });
    await client.connect();
    const result = await client.query(`
      select metadata
      from conversations
      where organization_id = $1
        and channel = 'web_chat_e2e-checkout'
      order by id desc
      limit 1
    `, [organizationId]);
    await client.end();

    const metadata = result.rows[0]?.metadata;

    expect(metadata?.customerDetails?.deliveryPreference).toBe('pickup');
    expect(metadata?.missingDetails ?? []).not.toContain('fulfillment_method');
    expect(metadata?.aiOrchestration?.systemDecision?.visibleSystemActions ?? [])
      .not
      .toContain('fulfillment_choices');
  });

  for (const viewport of [
    { height: 844, name: 'mobile', width: 390 },
    { height: 1024, name: 'tablet', width: 768 },
  ]) {
    test(`renders the web order chat without horizontal overflow on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await page.goto(`/fr/web-order/${organizationId}?source=e2e-${viewport.name}`);

      await expect(page.getByRole('heading', { name: /E2E Harmony Store/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();

      const overflowingElements = await page.evaluate(() => {
        const tolerance = 2;

        return Array.from(document.body.querySelectorAll<HTMLElement>('*'))
          .filter((element) => {
            if (element.classList.contains('sr-only')) {
              return false;
            }

            const rect = element.getBoundingClientRect();

            return rect.width > 0
              && rect.height > 0
              && (
                rect.left < -tolerance
                || rect.right > window.innerWidth + tolerance
                || element.scrollWidth > element.clientWidth + tolerance
              );
          })
          .slice(0, 10)
          .map(element => ({
            className: element.className.toString(),
            tagName: element.tagName,
            text: element.textContent?.trim().slice(0, 80) ?? '',
          }));
      });

      expect(overflowingElements).toEqual([]);
    });
  }

  test('a fresh customer context starts with no prior conversation history', async ({ page }) => {
    const uniqueSource = `e2e-isolation-${Date.now()}`;
    await page.goto(`/fr/web-order/${organizationId}?source=${uniqueSource}`);

    await expect(page.getByRole('heading', { name: /E2E Harmony Store/ })).toBeVisible();

    const messages = page.locator('[data-testid="chat-message"], [role="listitem"]');
    const messageCount = await messages.count();

    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    expect(messageCount).toBeLessThanOrEqual(1);
  });

  test('customer complaint message is acknowledged by the AI', async ({ page }) => {
    await page.goto(`/fr/web-order/${organizationId}?source=e2e-complaint-${Date.now()}`);

    await page.getByLabel('Message a l\'employe du magasin').fill('I have a complaint about my last order');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();

    await expect(page.getByText('We sincerely apologize')).toBeVisible({ timeout: 10000 });
  });

  test('two customers accessing the same store URL receive isolated chat sessions', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto(`/fr/web-order/${organizationId}?source=e2e-customer-a-${Date.now()}`);
      await pageB.goto(`/fr/web-order/${organizationId}?source=e2e-customer-b-${Date.now()}`);

      await expect(pageA.getByRole('heading', { name: /E2E Harmony Store/ })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: /E2E Harmony Store/ })).toBeVisible();

      await pageA.getByLabel('Message a l\'employe du magasin').fill('Customer A unique query');
      await pageA.getByRole('button', { name: 'Envoyer le message' }).click();

      await expect(pageA.getByText('Customer A unique query')).toBeVisible();

      const pageBContent = await pageB.content();

      expect(pageBContent).not.toContain('Customer A unique query');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

test.describe('Order tracking page', () => {
  let seededOrderId: number;

  test.beforeAll(async () => {
    seededOrderId = await seedOrder({ customerPhone: '0500000000', status: 'pending_store_review' });
  });

  test('shows phone verification message when no phone is provided', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/${seededOrderId}`);

    // Phone form must be present
    await expect(page.getByRole('button', { name: 'Suivre la commande' })).toBeVisible();
    // "Phone required" message appears instead of order details
    await expect(page.getByText(/t.l.phone est requise/i)).toBeVisible();
    // Order ID must NOT be revealed without authorization
    await expect(page.getByText(`#${seededOrderId}`)).toBeHidden();
  });

  test('shows not_found for a wrong phone number', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/${seededOrderId}?phone=0599999999`);

    await expect(page.getByText(/Aucune commande/i)).toBeVisible();
    await expect(page.getByText(`#${seededOrderId}`)).toBeHidden();
  });

  test('shows order details for an authorized phone number', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/${seededOrderId}?phone=0500000000`);

    // Order ID is revealed
    await expect(page.getByText(`#${seededOrderId}`)).toBeVisible();
    // Phone form remains available (to change phone)
    await expect(page.getByRole('button', { name: 'Suivre la commande' })).toBeVisible();
    // Order total is shown
    await expect(page.getByText('25.00')).toBeVisible();
  });

  test('feedback panel is visible and interactive for an authorized user', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/${seededOrderId}?phone=0500000000`);

    // Feedback panel title
    await expect(page.getByText('Noter cette commande')).toBeVisible();
    // Submit feedback button exists
    await expect(page.getByRole('button', { name: 'Envoyer l' })).toBeVisible();

    // Button is initially disabled (no rating or message entered)
    const sendButton = page.getByRole('button', { name: 'Envoyer l' });

    await expect(sendButton).toBeDisabled();
  });

  test('shows not_found for a nonexistent order ID with a valid phone', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/99999999?phone=0500000000`);

    await expect(page.getByText(/Aucune commande/i)).toBeVisible();
  });

  test('shows not_found for a non-numeric order ID', async ({ page }) => {
    await page.goto(`/fr/track/${organizationId}/not-a-number?phone=0500000000`);

    await expect(page.getByText(/Aucune commande|t.l.phone est requise/i)).toBeVisible();
  });
});

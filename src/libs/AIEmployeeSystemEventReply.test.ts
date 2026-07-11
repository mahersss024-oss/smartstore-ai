import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAIEmployeeSystemEventReply } from './AIEmployeeSystemEventReply';

const { mockGeneratePlatformAIText } = vi.hoisted(() => ({
  mockGeneratePlatformAIText: vi.fn(),
}));

vi.mock('./PlatformAIClient', () => ({
  generatePlatformAIText: mockGeneratePlatformAIText,
}));

const config = {
  apiKey: 'test-key',
  enabled: true,
  model: 'test-model',
  provider: 'openai' as const,
  systemPrompt: 'Be professional.',
};

describe('AIEmployeeSystemEventReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites a review request that describes the wrong order state', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Welcome. Your order will be reviewed by the store.')
      .mockResolvedValueOnce(JSON.stringify({
        reason: 'wrong_state_and_greeting',
        valid: false,
      }))
      .mockResolvedValueOnce(JSON.stringify({
        reply: 'Your order #67 is complete. Choose a rating from the WhatsApp options or write your note here.',
      }));

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'review_requested',
      locale: 'en',
      order: {
        id: 67,
        items: [],
        status: 'completed',
      },
      storeName: 'Test Store',
    });

    expect(reply).toBe(
      'Your order #67 is complete. Choose a rating from the WhatsApp options or write your note here.',
    );
  });

  it('keeps an accurate direct status update', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Your order #67 is ready for pickup.')
      .mockResolvedValueOnce(JSON.stringify({
        reason: '',
        valid: true,
      }));

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_ready_for_pickup',
      locale: 'en',
      order: {
        id: 67,
        items: [],
        status: 'ready_for_pickup',
      },
      storeName: 'Test Store',
    });

    expect(reply).toBe('Your order #67 is ready for pickup.');
  });

  it('falls back when a pickup order update claims delivery', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('تمت الموافقة على طلبك رقم 152. سيتم التواصل معك لتأكيد التوصيل.')
      .mockResolvedValueOnce(JSON.stringify({
        reason: '',
        valid: true,
      }))
      .mockResolvedValueOnce(JSON.stringify({
        reply: 'تمت الموافقة على طلبك رقم 152 وسيتم التواصل لتأكيد التوصيل.',
      }));

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_approved',
      locale: 'ar',
      order: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
        id: 152,
        items: [],
        paymentPreference: 'card_on_pickup',
        status: 'approved_by_store',
        totalPrice: '73.00',
      },
      storeName: 'بيت الكبسه الشعبي',
    });

    expect(reply).toBe('تمت الموافقة على طلبك رقم 152. الطلب استلام من الفرع، وسنخبرك عند جاهزيته.');
  });

  it('returns undefined when draft is empty', async () => {
    mockGeneratePlatformAIText.mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_approved',
      locale: 'en',
      order: { id: 10, items: [], status: 'approved_by_store' },
      storeName: 'Test Store',
    });

    expect(reply).toBeUndefined();
  });

  it('returns undefined when review result is neither valid nor invalid', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Your order #10 is ready.')
      .mockResolvedValueOnce('not json at all');

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_ready_for_pickup',
      locale: 'en',
      order: { id: 10, items: [], status: 'ready_for_pickup' },
      storeName: 'Test Store',
    });

    expect(reply).toBeUndefined();
  });

  it('falls back to hardcoded text when rewrite still conflicts for Arabic order_preparing', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('طلبك رقم 5 جاري التوصيل الآن.')
      .mockResolvedValueOnce(JSON.stringify({ valid: true }))
      .mockResolvedValueOnce(JSON.stringify({ reply: 'سيتم التوصيل قريبًا.' }));

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_preparing',
      locale: 'ar',
      order: {
        fulfillmentType: 'pickup',
        id: 5,
        items: [],
        status: 'preparing',
      },
      storeName: 'المطعم',
    });

    expect(reply).toBe('طلبك رقم 5 قيد التحضير الآن.');
  });

  it('uses Arabic fallback for order_ready_for_pickup', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Your order is ready.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'wrong_lang' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_ready_for_pickup',
      locale: 'ar',
      order: { id: 8, items: [], status: 'ready_for_pickup' },
      storeName: 'المطعم',
    });

    expect(reply).toContain('8');
    expect(reply).toContain('جاهز');
  });

  it('does not describe dine-in table orders as branch pickup', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('\u0637\u0644\u0628\u0643 \u0631\u0642\u0645 191 \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0641\u0631\u0639.')
      .mockResolvedValueOnce(JSON.stringify({ reason: '', valid: true }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_ready_for_pickup',
      locale: 'ar',
      order: {
        fulfillmentType: 'dine_in',
        id: 191,
        items: [],
        status: 'ready_for_pickup',
        tableNumber: '2',
      },
      storeName: 'Test Store',
    });

    expect(reply).toContain('191');
    expect(reply).toContain('2');
    expect(reply).toContain('\u0627\u0644\u0637\u0627\u0648\u0644\u0629');
    expect(reply).not.toContain('\u0627\u0633\u062A\u0644\u0627\u0645');
    expect(reply).not.toContain('\u0627\u0644\u0641\u0631\u0639');
  });

  it('uses Arabic fallback for review_requested', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Please review!')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'wrong_lang' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'review_requested',
      locale: 'ar',
      order: { id: 9, items: [], status: 'completed' },
      storeName: 'المطعم',
    });

    expect(reply).toContain('9');
    expect(reply).toContain('تقييم');
  });

  it('uses Arabic fallback for order_cancelled', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Cancelled.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'wrong_lang' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_cancelled',
      locale: 'ar',
      order: { id: 11, items: [], status: 'cancelled' },
      storeName: 'المطعم',
    });

    expect(reply).toContain('11');
    expect(reply).toContain('إلغاء');
  });

  it('uses English fallback for order_out_for_delivery with total', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('On the way!')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'missing_total' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_out_for_delivery',
      locale: 'en',
      order: { id: 20, items: [], status: 'out_for_delivery', totalPrice: '45.00 SAR' },
      storeName: 'Test Store',
    });

    expect(reply).toContain('20');
    expect(reply).toContain('45.00 SAR');
  });

  it('uses English fallback for order_preparing', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Preparing your order.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'test' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_preparing',
      locale: 'en',
      order: { id: 40, items: [], status: 'preparing' },
      storeName: 'Test Store',
    });

    expect(reply).toBe('Your order #40 is now being prepared.');
  });

  it('uses English fallback for review_requested', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Rate your order.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'test' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'review_requested',
      locale: 'en',
      order: { id: 41, items: [], status: 'completed' },
      storeName: 'Test Store',
    });

    expect(reply).toContain('41');
    expect(reply).toContain('complete');
  });

  it('uses English fallback for order_cancelled', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Order cancelled.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'test' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_cancelled',
      locale: 'en',
      order: { id: 42, items: [], status: 'cancelled' },
      storeName: 'Test Store',
    });

    expect(reply).toBe('Your order #42 has been cancelled.');
  });

  it('uses non-pickup Arabic fallback for order_approved', async () => {
    mockGeneratePlatformAIText
      .mockResolvedValueOnce('Approved.')
      .mockResolvedValueOnce(JSON.stringify({ valid: false, reason: 'wrong_lang' }))
      .mockResolvedValueOnce(null);

    const reply = await generateAIEmployeeSystemEventReply({
      assistantDisplayName: 'Agent',
      config,
      eventType: 'order_approved',
      locale: 'ar',
      order: { id: 30, items: [], status: 'approved_by_store' },
      storeName: 'المطعم',
    });

    expect(reply).toContain('30');
    expect(reply).toContain('سنبدأ');
  });
});

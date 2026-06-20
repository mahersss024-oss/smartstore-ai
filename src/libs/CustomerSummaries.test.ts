import { describe, expect, it } from 'vitest';
import { buildCustomerSummaries } from './CustomerSummaries';
import { ORDER_EVENT_TYPE } from './OrderWorkflow';

describe('CustomerSummaries', () => {
  it('summarizes large customer datasets without cross-linking identities', () => {
    const customerProfiles = Array.from({ length: 1000 }, (_, index) => ({
      displayName: `Customer ${index}`,
      email: `customer-${index}@example.test`,
      externalId: `guest-${index}`,
      id: index + 1,
      lastContactAt: new Date(`2026-06-06T00:${String(index % 60).padStart(2, '0')}:00.000Z`),
      metadata: index === 999 ? { archivedAt: '2026-06-06T00:00:00.000Z' } : {},
      phone: `050000${String(index).padStart(4, '0')}`,
    }));
    const orders = Array.from({ length: 3000 }, (_, index) => {
      const customerIndex = index % 999;

      return {
        archivedAt: index % 10 === 0 ? new Date('2026-06-06T02:00:00.000Z') : null,
        createdAt: new Date(`2026-06-06T01:${String(index % 60).padStart(2, '0')}:00.000Z`),
        customerEmail: `customer-${customerIndex}@example.test`,
        customerPhone: `050000${String(customerIndex).padStart(4, '0')}`,
        id: index + 1,
        totalPrice: '10.00',
      };
    });
    const reviews = orders.slice(0, 500).map(order => ({
      createdAt: new Date('2026-06-06T03:00:00.000Z'),
      customerId: null,
      orderId: order.id,
      rating: 5,
    }));
    const feedbackEvents = orders.slice(0, 200).map(order => ({
      createdAt: new Date('2026-06-06T04:00:00.000Z'),
      eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
      metadata: {
        customerMessage: `Issue for order ${order.id}`,
      },
      orderId: order.id,
    }));

    const summaries = buildCustomerSummaries({
      customerProfiles,
      fallbackName: 'Unknown',
      feedbackEvents,
      orders,
      reviews,
      showArchived: false,
    });

    expect(summaries).toHaveLength(999);
    expect(summaries.some(summary => summary.id === 1000)).toBe(false);

    const first = summaries.find(summary => summary.id === 1);

    expect(first).toMatchObject({
      averageRating: 5,
      feedbackCount: 1,
      ordersCount: 3,
      phone: '0500000000',
      totalSpent: 30,
    });
    expect(first?.orderIds).toContain(1);
    expect(first?.latestFeedback).toMatchObject({
      message: 'Issue for order 1',
      orderId: 1,
    });

    const second = summaries.find(summary => summary.id === 2);

    expect(second).toMatchObject({
      averageRating: 5,
      feedbackCount: 1,
      ordersCount: 3,
      phone: '0500000001',
      totalSpent: 30,
    });
  });

  it('links reviewed orders to the customer even when order contact fields differ', () => {
    const summaries = buildCustomerSummaries({
      customerProfiles: [{
        displayName: null,
        email: null,
        externalId: 'web-chat-guest',
        id: 531,
        lastContactAt: new Date('2026-06-07T00:02:23.000Z'),
        metadata: {},
        phone: '0549764152',
      }],
      fallbackName: 'Unknown',
      feedbackEvents: [],
      orders: [{
        archivedAt: null,
        createdAt: new Date('2026-06-07T00:02:24.000Z'),
        customerEmail: null,
        customerPhone: 'web-chat-guest',
        id: 137,
        totalPrice: '27.00',
      }],
      reviews: [{
        createdAt: new Date('2026-06-07T00:10:25.000Z'),
        customerId: 531,
        orderId: 137,
        rating: 5,
      }],
      showArchived: false,
    });

    expect(summaries[0]).toMatchObject({
      averageRating: 5,
      lastOrderAt: new Date('2026-06-07T00:02:24.000Z'),
      orderIds: [137],
      ordersCount: 1,
      totalSpent: 27,
    });
  });

  it('merges web and WhatsApp profiles for the same phone identity', () => {
    const summaries = buildCustomerSummaries({
      customerProfiles: [
        {
          displayName: 'Abu Marwan Web',
          email: null,
          externalId: 'web-chat-guest-1',
          id: 10,
          lastContactAt: new Date('2026-06-12T06:00:00.000Z'),
          metadata: {},
          phone: '0549764152',
        },
        {
          displayName: 'Abu Marwan WhatsApp',
          email: null,
          externalId: '966549764152',
          id: 20,
          lastContactAt: new Date('2026-06-12T07:00:00.000Z'),
          metadata: {},
          phone: '966549764152',
        },
      ],
      fallbackName: 'Unknown',
      feedbackEvents: [],
      orders: [
        {
          archivedAt: null,
          createdAt: new Date('2026-06-12T07:05:00.000Z'),
          customerEmail: null,
          customerPhone: '966549764152',
          id: 162,
          totalPrice: '20.00',
        },
      ],
      reviews: [
        {
          createdAt: new Date('2026-06-12T07:10:00.000Z'),
          customerId: 20,
          orderId: 162,
          rating: 5,
        },
      ],
      showArchived: false,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      averageRating: 5,
      id: 10,
      lastContactAt: new Date('2026-06-12T07:00:00.000Z'),
      orderIds: [162],
      ordersCount: 1,
      totalSpent: 20,
    });
  });

  it('skips reviews with no matching customer and non-complaint feedback events', () => {
    const summaries = buildCustomerSummaries({
      customerProfiles: [{
        displayName: 'Test Customer',
        email: null,
        externalId: 'web-guest-1',
        id: 1,
        lastContactAt: new Date('2026-06-12T06:00:00.000Z'),
        metadata: {},
        phone: '0500000001',
      }],
      fallbackName: 'Unknown',
      feedbackEvents: [
        {
          createdAt: new Date('2026-06-12T06:05:00.000Z'),
          eventType: ORDER_EVENT_TYPE.ORDER_APPROVED,
          metadata: {},
          orderId: 100,
        },
        {
          createdAt: new Date('2026-06-12T06:10:00.000Z'),
          eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
          metadata: {},
          orderId: 999,
        },
      ],
      orders: [{
        archivedAt: null,
        createdAt: new Date('2026-06-12T06:01:00.000Z'),
        customerEmail: null,
        customerPhone: '0500000001',
        id: 100,
        totalPrice: '15.00',
      }],
      reviews: [{
        createdAt: new Date('2026-06-12T06:02:00.000Z'),
        customerId: 999,
        orderId: 200,
        rating: 4,
      }],
      showArchived: false,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.averageRating).toBeNull();
    expect(summaries[0]?.feedbackCount).toBe(0);
  });

  it('surfaces WhatsApp reviews and feedback in the merged customer summary', () => {
    const summaries = buildCustomerSummaries({
      customerProfiles: [
        {
          displayName: 'Abu Marwan Web',
          email: null,
          externalId: 'web-chat-guest-1',
          id: 10,
          lastContactAt: new Date('2026-06-12T06:00:00.000Z'),
          metadata: {},
          phone: '0549764152',
        },
        {
          displayName: 'Abu Marwan WhatsApp',
          email: null,
          externalId: '966549764152',
          id: 20,
          lastContactAt: new Date('2026-06-12T09:00:00.000Z'),
          metadata: {},
          phone: '966549764152',
        },
      ],
      fallbackName: 'Unknown',
      feedbackEvents: [
        {
          createdAt: new Date('2026-06-12T09:15:00.000Z'),
          eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
          metadata: {
            customerMessage: 'الطلب تأخر لكن الخدمة ممتازة',
            source: 'whatsapp_chat_feedback',
            sourceChannel: 'whatsapp',
          },
          orderId: 162,
        },
      ],
      orders: [
        {
          archivedAt: null,
          createdAt: new Date('2026-06-12T09:05:00.000Z'),
          customerEmail: null,
          customerPhone: '966549764152',
          id: 162,
          totalPrice: '20.00',
        },
      ],
      reviews: [
        {
          createdAt: new Date('2026-06-12T09:12:00.000Z'),
          customerId: 20,
          orderId: 162,
          rating: 4,
        },
      ],
      showArchived: false,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      averageRating: 4,
      feedbackCount: 1,
      id: 10,
      latestFeedback: {
        message: 'الطلب تأخر لكن الخدمة ممتازة',
        orderId: 162,
      },
      latestRating: {
        orderId: 162,
        rating: 4,
      },
      orderIds: [162],
      ordersCount: 1,
      totalSpent: 20,
    });
  });
});

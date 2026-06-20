import { describe, expect, it } from 'vitest';
import { getStoreReadiness, getStoreReadinessItems } from './StoreReadiness';

const completeInput = {
  businessType: 'restaurant',
  contactChannels: {
    whatsapp: '+966500000000',
  },
  currency: 'SAR',
  deliveryMethodsCount: 1,
  location: {
    address: 'Riyadh',
  },
  paymentMethodsCount: 1,
  productsCount: 1,
  storeDescription: 'A complete store profile ready for customers.',
  storeName: 'Smart Store',
  timezone: 'Asia/Riyadh',
  welcomeMessage: 'Welcome to our store.',
};

describe('StoreReadiness', () => {
  it('marks a fully configured store as ready', () => {
    expect(getStoreReadiness(completeInput)).toMatchObject({
      completed: 11,
      score: 100,
      status: 'ready',
      total: 11,
    });
  });

  it('tracks missing items individually', () => {
    const items = getStoreReadinessItems({
      ...completeInput,
      productsCount: 0,
      welcomeMessage: '',
    });

    expect(items.find(item => item.key === 'welcome_message')?.isReady).toBe(false);
    expect(items.find(item => item.key === 'product_catalog')?.isReady).toBe(false);
    expect(items.filter(item => item.isReady)).toHaveLength(9);
  });

  it('returns not started when no setup is present', () => {
    expect(getStoreReadiness({
      deliveryMethodsCount: 0,
      paymentMethodsCount: 0,
      productsCount: 0,
    })).toMatchObject({
      completed: 0,
      score: 0,
      status: 'not_started',
      total: 11,
    });
  });

  it('accepts non-text metadata values without crashing', () => {
    const items = getStoreReadinessItems({
      ...completeInput,
      contactChannels: {
        ai: true,
        webOrders: false,
      },
      location: {
        city: 123,
        mapsUrl: true,
      },
    });

    expect(items.find(item => item.key === 'contact_channel')?.isReady).toBe(true);
    expect(items.find(item => item.key === 'location')?.isReady).toBe(false);
  });
});

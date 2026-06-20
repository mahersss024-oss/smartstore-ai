'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import * as z from 'zod';
import { db } from '@/libs/DB';
import { deliveryMethodsTable, paymentMethodsTable } from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

const paymentTemplates = [
  {
    provider: 'cash_on_delivery',
    type: 'offline',
    displayName: 'Cash on delivery',
    requiresOnlinePayment: false,
  },
  {
    provider: 'card_on_delivery',
    type: 'offline',
    displayName: 'Card on delivery',
    requiresOnlinePayment: false,
  },
  {
    provider: 'cash_on_pickup',
    type: 'offline',
    displayName: 'Pay at pickup',
    requiresOnlinePayment: false,
  },
  {
    provider: 'card_on_pickup',
    type: 'offline',
    displayName: 'Card at pickup',
    requiresOnlinePayment: false,
  },
] as const;
const paymentDeliveryPreferencesByProvider: Record<
  typeof paymentTemplates[number]['provider'],
  Array<'delivery' | 'pickup'>
> = {
  card_on_delivery: ['delivery'],
  card_on_pickup: ['pickup'],
  cash_on_delivery: ['delivery'],
  cash_on_pickup: ['pickup'],
};

const futureElectronicPaymentTemplates = [
  {
    provider: 'custom_payment_link',
    type: 'online',
    displayName: 'Custom payment link',
    requiresOnlinePayment: true,
  },
  {
    provider: 'apple_pay',
    type: 'wallet',
    displayName: 'Apple Pay',
    requiresOnlinePayment: true,
  },
  {
    provider: 'google_pay',
    type: 'wallet',
    displayName: 'Google Pay',
    requiresOnlinePayment: true,
  },
] as const;

const deliveryTemplates = [
  {
    type: 'local_delivery',
    displayName: 'Local delivery',
    fee: '0',
  },
  {
    type: 'pickup',
    displayName: 'Store pickup',
    fee: '0',
  },
  {
    type: 'dine_in',
    displayName: 'Dine-in / table service',
    fee: '0',
  },
  {
    type: 'curbside_pickup',
    displayName: 'Curbside pickup',
    fee: '0',
  },
  {
    type: 'courier_shipping',
    displayName: 'Courier shipping',
    fee: '0',
  },
  {
    type: 'scheduled_delivery',
    displayName: 'Scheduled delivery',
    fee: '0',
  },
  {
    type: 'digital',
    displayName: 'Digital delivery',
    fee: '0',
  },
] as const;

const feeSchema = z.coerce.number().min(0).max(99999999.99);

const getOptionalFormString = (formData: FormData, key: string) => {
  return String(formData.get(key) ?? '').trim() || undefined;
};

const getSupportedDeliveryPreferences = (
  formData: FormData,
  provider: typeof paymentTemplates[number]['provider'],
) => {
  const allowedPreferences = paymentDeliveryPreferencesByProvider[provider];
  const supportedDeliveryMethods: Array<'delivery' | 'pickup'> = [];

  if (
    allowedPreferences.includes('delivery')
    && formData.get(`payment_delivery_${provider}`) === 'on'
  ) {
    supportedDeliveryMethods.push('delivery');
  }

  if (
    allowedPreferences.includes('pickup')
    && formData.get(`payment_pickup_${provider}`) === 'on'
  ) {
    supportedDeliveryMethods.push('pickup');
  }

  return supportedDeliveryMethods.length > 0
    ? supportedDeliveryMethods
    : [];
};

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

export const savePaymentAndDeliverySettings = async (
  locale: string,
  formData: FormData,
) => {
  const organizationId = await getActiveOrganizationId();

  await db.transaction(async (tx) => {
    for (const paymentMethod of paymentTemplates) {
      const instructionScope = paymentMethod.provider.endsWith('_delivery')
        ? 'delivery'
        : 'pickup';
      const config = {
        instructions: getOptionalFormString(formData, `payment_instructions_${paymentMethod.provider}`)
          ?? getOptionalFormString(formData, `payment_instructions_${instructionScope}`),
      };
      const supportedDeliveryMethods = getSupportedDeliveryPreferences(formData, paymentMethod.provider);
      const isActive = formData.get(`payment_${paymentMethod.provider}`) === 'on'
        && supportedDeliveryMethods.length > 0;

      await tx
        .insert(paymentMethodsTable)
        .values({
          config,
          organizationId,
          provider: paymentMethod.provider,
          type: paymentMethod.type,
          displayName: paymentMethod.displayName,
          isActive,
          requiresOnlinePayment: paymentMethod.requiresOnlinePayment,
          supportedDeliveryMethods,
        })
        .onConflictDoUpdate({
          target: [paymentMethodsTable.organizationId, paymentMethodsTable.provider],
          set: {
            displayName: paymentMethod.displayName,
            type: paymentMethod.type,
            config,
            isActive,
            requiresOnlinePayment: paymentMethod.requiresOnlinePayment,
            supportedDeliveryMethods,
          },
        });
    }

    for (const paymentMethod of futureElectronicPaymentTemplates) {
      await tx
        .insert(paymentMethodsTable)
        .values({
          config: {
            activationStatus: 'planned',
            note: 'Reserved for future customer online payment activation.',
          },
          displayName: paymentMethod.displayName,
          isActive: false,
          organizationId,
          provider: paymentMethod.provider,
          requiresOnlinePayment: true,
          type: paymentMethod.type,
        })
        .onConflictDoUpdate({
          target: [paymentMethodsTable.organizationId, paymentMethodsTable.provider],
          set: {
            config: {
              activationStatus: 'planned',
              note: 'Reserved for future customer online payment activation.',
            },
            displayName: paymentMethod.displayName,
            isActive: false,
            requiresOnlinePayment: true,
            type: paymentMethod.type,
          },
        });
    }

    for (const deliveryMethod of deliveryTemplates) {
      const isActive = formData.get(`delivery_${deliveryMethod.type}`) === 'on';
      const fee = feeSchema.parse(
        String(formData.get(`delivery_fee_${deliveryMethod.type}`) ?? deliveryMethod.fee).trim() || deliveryMethod.fee,
      ).toFixed(2);
      const estimatedTime = String(formData.get(`delivery_time_${deliveryMethod.type}`) ?? '').trim();
      const config = {
        instructions: getOptionalFormString(formData, `delivery_instructions_${deliveryMethod.type}`),
      };

      await tx
        .insert(deliveryMethodsTable)
        .values({
          config,
          organizationId,
          type: deliveryMethod.type,
          displayName: deliveryMethod.displayName,
          isActive,
          fee,
          estimatedTime: estimatedTime || null,
        })
        .onConflictDoUpdate({
          target: [deliveryMethodsTable.organizationId, deliveryMethodsTable.type],
          set: {
            displayName: deliveryMethod.displayName,
            config,
            isActive,
            fee,
            estimatedTime: estimatedTime || null,
          },
        });
    }
  });

  revalidatePath(getI18nPath('/dashboard/payments', locale));
  revalidatePath(getI18nPath('/dashboard/settings', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath(`/admin/stores/${organizationId}`, locale));
};

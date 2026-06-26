import type { CSSProperties } from 'react';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WebOrderChat } from '@/features/customer/WebOrderChat';
import { WebOrderFeedbackPanel } from '@/features/customer/WebOrderFeedbackPanel';
import { Section } from '@/features/landing/Section';
import { normalizeAIEmployeeSettings } from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import { getStoreBrandThemeCssVariables } from '@/libs/StoreBrandTheme';
import { isStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import {
  deliveryMethodsTable,
  paymentMethodsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { normalizeCustomerChannelSource } from '@/utils/CustomerChannels';

// The web chat server action runs the AI reply path, which can chain several
// sequential model calls (reply generation, safety review, and a bounded repair
// cycle). Give the route headroom to finish before the platform terminates it.
export const maxDuration = 60;

type DeliveryConfig = {
  instructions?: string;
};

type PaymentChoiceKind = 'card' | 'cash';
type FulfillmentChoice = 'delivery' | 'dine_in' | 'pickup';

type StoreLocation = {
  address?: string;
  branchName?: string;
  city?: string;
  deliveryNotes?: string;
  district?: string;
  mapsUrl?: string;
  phone?: string;
  pickupInstructions?: string;
};

const deliveryLabelKeys = [
  'courier_shipping',
  'curbside_pickup',
  'digital',
  'dine_in',
  'local_delivery',
  'pickup',
  'scheduled_delivery',
] as const;

const getFulfillmentChoiceFromDeliveryType = (type: string): FulfillmentChoice | null => {
  if (type === 'dine_in') {
    return 'dine_in';
  }

  if (type === 'pickup' || type === 'curbside_pickup') {
    return 'pickup';
  }

  if (
    type === 'local_delivery'
    || type === 'courier_shipping'
    || type === 'digital'
    || type === 'scheduled_delivery'
  ) {
    return 'delivery';
  }

  return null;
};

const getPaymentChoiceKind = (provider: string): PaymentChoiceKind | null => {
  if (provider.startsWith('card_')) {
    return 'card';
  }

  if (provider.startsWith('cash_')) {
    return 'cash';
  }

  return null;
};

const getSupportedDeliveryPreferences = (value: unknown): Array<'delivery' | 'pickup'> => {
  return Array.isArray(value)
    ? value.filter((item): item is 'delivery' | 'pickup' => {
        return item === 'delivery' || item === 'pickup';
      })
    : [];
};

export default async function WebOrderPage(props: {
  params: Promise<{ locale: string; organizationId: string }>;
  searchParams: Promise<{ sent?: string; source?: string }>;
}) {
  const { locale, organizationId } = await props.params;
  const { sent, source } = await props.searchParams;
  const channelSource = normalizeCustomerChannelSource(source, 'website');
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'WebOrderPage',
  });
  const paymentsT = await getTranslations({
    locale,
    namespace: 'PaymentsPage',
  });
  const [settings] = await db
    .select({
      // Only the public-facing metadata sub-objects are loaded; this deliberately
      // excludes channelIntegrations (which holds the encrypted WhatsApp access token)
      // from a public, unauthenticated page query.
      metadata: sql<{
        aiEmployee?: unknown;
        brandTheme?: unknown;
        location?: StoreLocation;
      } | null>`jsonb_build_object(
        'aiEmployee', ${storeSettingsTable.metadata} -> 'aiEmployee',
        'brandTheme', ${storeSettingsTable.metadata} -> 'brandTheme',
        'location', ${storeSettingsTable.metadata} -> 'location'
      )`,
      logo: storeSettingsTable.logo,
      storeDescription: storeSettingsTable.storeDescription,
      storeName: storeSettingsTable.storeName,
      timezone: storeSettingsTable.timezone,
      welcomeMessage: storeSettingsTable.welcomeMessage,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const paymentMethods = await db
    .select()
    .from(paymentMethodsTable)
    .where(and(
      eq(paymentMethodsTable.organizationId, organizationId),
      eq(paymentMethodsTable.isActive, true),
      eq(paymentMethodsTable.requiresOnlinePayment, false),
      ne(paymentMethodsTable.provider, 'bank_transfer'),
    ))
    .orderBy(asc(paymentMethodsTable.id));
  const deliveryMethods = await db
    .select()
    .from(deliveryMethodsTable)
    .where(and(
      eq(deliveryMethodsTable.organizationId, organizationId),
      eq(deliveryMethodsTable.isActive, true),
    ))
    .orderBy(asc(deliveryMethodsTable.id));
  const storeName = settings?.storeName?.trim() || t('fallback_store_name');
  const webOrdersEnabled = await isStoreFeatureEnabled(organizationId, 'webOrders');
  const aiEnabled = await isStoreFeatureEnabled(organizationId, 'ai');
  const chatEnabled = webOrdersEnabled && aiEnabled;
  const metadata = settings?.metadata as {
    aiEmployee?: unknown;
    brandTheme?: unknown;
    location?: StoreLocation;
  } | null;
  const aiSettings = normalizeAIEmployeeSettings(metadata?.aiEmployee);
  const themeStyle = getStoreBrandThemeCssVariables(metadata?.brandTheme) as CSSProperties | undefined;
  const location = metadata?.location ?? {};
  const timeZone = settings?.timezone ?? 'Asia/Riyadh';
  const hasLocation = Object.values(location).some(Boolean);
  const getDeliveryLabel = (type: string, fallback: string) => {
    return deliveryLabelKeys.includes(type as typeof deliveryLabelKeys[number])
      ? paymentsT(type as typeof deliveryLabelKeys[number])
      : fallback;
  };
  const configuredFulfillmentTypes = Array.from(
    new Set(
      deliveryMethods
        .map(method => getFulfillmentChoiceFromDeliveryType(method.type))
        .filter((choice): choice is FulfillmentChoice => Boolean(choice)),
    ),
  );
  const availablePaymentKinds = paymentMethods.reduce<{
    delivery: PaymentChoiceKind[];
    pickup: PaymentChoiceKind[];
  }>((choices, method) => {
    const kind = getPaymentChoiceKind(method.provider);

    if (!kind) {
      return choices;
    }

    for (const deliveryPreference of getSupportedDeliveryPreferences(method.supportedDeliveryMethods)) {
      if (!choices[deliveryPreference].includes(kind)) {
        choices[deliveryPreference].push(kind);
      }
    }

    return choices;
  }, { delivery: [], pickup: [] });
  const availableFulfillmentTypes = configuredFulfillmentTypes.filter((choice) => {
    return choice === 'delivery'
      ? availablePaymentKinds.delivery.length > 0
      : availablePaymentKinds.pickup.length > 0;
  });
  const orderChatEnabled = chatEnabled && availableFulfillmentTypes.length > 0;

  return (
    <Section
      subtitle={t('subtitle')}
      title={t('title', { storeName })}
      description={settings?.storeDescription?.trim() || t('description')}
    >
      {sent === '1' && (
        <div className="
          mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-xl border
          border-emerald-200 bg-emerald-50 p-4 text-emerald-950
        "
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div>
            <div className="font-semibold">{t('sent_title')}</div>
            <p className="mt-1 text-sm/6 text-emerald-900">{t('sent_description')}</p>
          </div>
        </div>
      )}

      {!orderChatEnabled && (
        <div className="
          mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-5
          text-center text-amber-950
        "
        >
          <div className="font-semibold">{t('disabled_title')}</div>
          <p className="mt-2 text-sm/6">{t('disabled_description')}</p>
        </div>
      )}

      {orderChatEnabled && (
        <div
          className="
            mx-auto grid min-h-0 max-w-5xl gap-6
            lg:grid-cols-[minmax(0,1fr)_320px]
          "
          style={themeStyle}
        >
          <WebOrderChat
            availableFulfillmentTypes={availableFulfillmentTypes}
            availablePaymentKinds={availablePaymentKinds}
            agentLabel={aiSettings.displayName || t('chat_agent_label')}
            cartAddOrderLabel={t('chat_cart_add_order')}
            cartCurrentLabel={t('chat_cart_current')}
            cartDecreaseQuantityLabel={t('chat_cart_decrease_quantity')}
            cartDeliveryFeeLabel={t('chat_cart_delivery_fee')}
            cartIncreaseQuantityLabel={t('chat_cart_increase_quantity')}
            cartQuantityLabel={t('chat_cart_quantity')}
            cartRemoveItemLabel={t('chat_cart_remove_item')}
            cartRestoreCancelledLabel={t('chat_cart_restore_cancelled')}
            cartStartNewOrderLabel={t('chat_cart_start_new_order')}
            cartSubmittedLabel={t('chat_cart_submitted')}
            clearConversationConfirmLabel={t('chat_clear_conversation_confirm')}
            clearConversationLabel={t('chat_clear_conversation')}
            confirmAllProductsLabel={t('chat_confirm_all_products')}
            choiceCardLabel={t('chat_choice_card')}
            choiceCashLabel={t('chat_choice_cash')}
            choiceConfirmCancelLabel={t('chat_choice_confirm_cancel')}
            choiceConfirmSendLabel={t('chat_choice_confirm_send')}
            choiceRequiredPlaceholder={t('chat_choice_required_placeholder')}
            choiceDeliveryLabel={t('chat_choice_delivery')}
            choiceDineInLabel={t('chat_choice_dine_in')}
            choiceOtherLabel={t('chat_choice_other')}
            choicePickupLabel={t('chat_choice_pickup')}
            disabledText={t('chat_error')}
            inputLabel={t('chat_input_label')}
            inputPlaceholder={t('chat_placeholder')}
            locationMessagePrefix={t('chat_location_message_prefix')}
            locationUnavailableText={t('chat_location_unavailable')}
            locationLabel={t('chat_location')}
            locale={locale}
            organizationId={organizationId}
            sendLabel={t('chat_send')}
            source={channelSource}
            storeLogoUrl={settings?.logo?.trim() || null}
            storeName={storeName}
            timeZone={timeZone}
            welcomeMessage={aiSettings.welcomeMessage
              || settings?.welcomeMessage?.trim()
              || t('chat_welcome', { storeName })}
          />

          <aside className="
            min-h-0 space-y-4 text-start
            lg:h-[min(720px,calc(100vh-180px))] lg:min-h-[520px]
            lg:overflow-y-auto lg:overscroll-contain lg:pe-1
          "
          >
            {hasLocation && (
              <section className="
                rounded-2xl border border-primary/15 bg-background/80 p-5
                shadow-sm shadow-primary/10
              "
              >
                <h2 className="text-sm font-bold text-slate-950">
                  {t('store_location')}
                </h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {location.branchName && <p>{location.branchName}</p>}
                  {[location.city, location.district, location.address]
                    .filter(Boolean)
                    .length > 0 && (
                    <p>
                      {[location.city, location.district, location.address]
                        .filter(Boolean)
                        .join(' - ')}
                    </p>
                  )}
                  {location.phone && <p>{location.phone}</p>}
                  {location.pickupInstructions && <p>{location.pickupInstructions}</p>}
                  {location.deliveryNotes && <p>{location.deliveryNotes}</p>}
                  {location.mapsUrl && (
                    <a
                      href={location.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="
                        inline-flex max-w-full font-semibold break-all
                        text-primary underline-offset-4
                        hover:underline
                      "
                    >
                      {t('open_maps')}
                    </a>
                  )}
                </div>
              </section>
            )}

            <WebOrderFeedbackPanel
              description={t('feedback_description')}
              errorLabel={t('feedback_error')}
              messageLabel={t('feedback_message_label')}
              organizationId={organizationId}
              placeholder={t('feedback_placeholder')}
              ratingLabel={t('feedback_rating_label')}
              ratingOptionalLabel={t('feedback_rating_optional')}
              sendLabel={t('feedback_send')}
              source={channelSource}
              successLabel={t('feedback_success')}
              title={t('feedback_title')}
            />

            {deliveryMethods.length > 0 && (
              <section className="
                rounded-2xl border border-primary/15 bg-background/80 p-5
                shadow-sm shadow-primary/10
              "
              >
                <h2 className="text-sm font-bold text-slate-950">
                  {t('available_delivery_methods')}
                </h2>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  {deliveryMethods.map((method) => {
                    const config = (method.config ?? {}) as DeliveryConfig;

                    return (
                      <div
                        key={method.id}
                        className="
                          border-t border-primary/10 pt-3
                          first:border-t-0 first:pt-0
                        "
                      >
                        <p className="font-semibold text-slate-900">
                          {getDeliveryLabel(method.type, method.displayName)}
                        </p>
                        <p>{t('delivery_fee', { fee: method.fee })}</p>
                        {method.estimatedTime && (
                          <p>{t('estimated_time', { time: method.estimatedTime })}</p>
                        )}
                        {config.instructions && <p>{config.instructions}</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </Section>
  );
}

import type { PricingPlan } from '@/types/Subscription';
import { useTranslations } from 'next-intl';
import { PricingFeatureItem } from './PricingFeatureItem';

export const PricingFeatureList = (props: Pick<PricingPlan, 'features' | 'limits'>) => {
  const t = useTranslations('PricingFeatures');
  const hasAnyFeature = Object.values(props.features).some(Boolean)
    || props.limits.aiOrders > 0
    || props.limits.channels > 0
    || props.limits.products > 0
    || props.limits.storage > 0;

  if (!hasAnyFeature) {
    return (
      <PricingFeatureItem>
        {t('feature_no_included_features')}
      </PricingFeatureItem>
    );
  }

  return (
    <>
      <PricingFeatureItem>
        {t('feature_team_member', {
          number: props.limits.teamMember,
        })}
      </PricingFeatureItem>

      {props.features.webOrders && (
        <PricingFeatureItem>
          {t('feature_web_order')}
        </PricingFeatureItem>
      )}

      {props.features.webOrders && (
        <PricingFeatureItem>
          {t('feature_smart_link')}
        </PricingFeatureItem>
      )}

      {props.features.whatsapp && (
        <PricingFeatureItem>{t('feature_whatsapp')}</PricingFeatureItem>
      )}

      {props.features.onlinePayments && (
        <PricingFeatureItem>{t('feature_online_payments')}</PricingFeatureItem>
      )}

      {props.features.invoices && (
        <PricingFeatureItem>{t('feature_invoices')}</PricingFeatureItem>
      )}

      {props.features.advancedReports && (
        <PricingFeatureItem>{t('feature_advanced_reports')}</PricingFeatureItem>
      )}

      <PricingFeatureItem>
        {t('feature_storage', {
          number: props.limits.storage,
        })}
      </PricingFeatureItem>

      <PricingFeatureItem>
        {t('feature_transfer', {
          number: props.limits.aiOrders,
        })}
      </PricingFeatureItem>

      <PricingFeatureItem>
        {t('feature_products', {
          number: props.limits.products,
        })}
      </PricingFeatureItem>

      <PricingFeatureItem>
        {t('feature_channels', {
          number: props.limits.channels,
        })}
      </PricingFeatureItem>

      <PricingFeatureItem>{t('feature_email_support')}</PricingFeatureItem>
    </>
  );
};

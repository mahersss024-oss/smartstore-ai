import type { PricingPlan } from '@/types/Subscription';
import { useTranslations } from 'next-intl';
import { PricingFeatureList } from './PricingFeatureList';

export const PricingCard = (props: {
  plan: PricingPlan;
  button: React.ReactNode;
}) => {
  const tPlans = useTranslations('PricingPlans');
  const t = useTranslations('PricingCard');

  return (
    <div className="
      rounded-xl border border-border bg-white/68 px-6 py-8 text-center
      shadow-sm shadow-cyan-950/5
    "
    >
      <div className="text-lg font-semibold">
        {tPlans(`${props.plan.name}_plan_name`)}
      </div>

      <div className="mt-3 flex flex-col items-center justify-center gap-1">
        <div className="text-4xl font-bold">
          {t('plan_price', {
            usdPrice: props.plan.usdPrice,
          })}
        </div>

        <div className="text-sm font-semibold text-muted-foreground">
          {t('plan_price_sar', {
            price: props.plan.price,
          })}
        </div>

        <div className="text-sm text-muted-foreground">
          {t('plan_interval_month')}
        </div>
      </div>

      <div className="mt-2 mb-5 text-sm text-muted-foreground">
        {t(`${props.plan.name}_plan_description`)}
      </div>

      {props.button}

      <ul className="mt-8 space-y-3">
        <PricingFeatureList
          features={props.plan.features}
          limits={props.plan.limits}
        />
      </ul>
    </div>
  );
};

import type { EnumValues } from './Enum';
import type { PLAN_NAME } from '@/utils/PricingPlans';

type PlanName = EnumValues<typeof PLAN_NAME>;

export type PricingPlan = {
  features: {
    advancedReports: boolean;
    aiAgent: boolean;
    invoices: boolean;
    onlinePayments: boolean;
    webOrders: boolean;
    whatsapp: boolean;
  };
  name: PlanName;
  price: number;
  usdPrice: number;
  limits: {
    aiOrders: number;
    channels: number;
    products: number;
    teamMember: number;
    storage: number;
    /** @deprecated Use aiOrders instead. */
    transfer: number;
  };
};

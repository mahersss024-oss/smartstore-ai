import type { PricingPlan } from '@/types/Subscription';

/** Pricing plans */
export const PLAN_NAME = {
  FREE: 'free',
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro',
} as const;

const FreePlan: PricingPlan = {
  features: {
    advancedReports: false,
    aiAgent: false,
    invoices: false,
    onlinePayments: false,
    webOrders: false,
    whatsapp: false,
  },
  name: PLAN_NAME.FREE,
  price: 0,
  usdPrice: 0,
  limits: {
    aiOrders: 0,
    channels: 0,
    products: 0,
    teamMember: 1,
    storage: 0,
    transfer: 0,
  },
};

const StarterPlan: PricingPlan = {
  features: {
    advancedReports: true,
    aiAgent: true,
    invoices: true,
    onlinePayments: false,
    webOrders: true,
    whatsapp: true,
  },
  name: PLAN_NAME.STARTER,
  price: 149,
  usdPrice: 39.99,
  limits: {
    aiOrders: 300,
    channels: 2,
    products: 100,
    teamMember: 1,
    storage: 50,
    transfer: 25,
  },
};

const GrowthPlan: PricingPlan = {
  features: {
    advancedReports: true,
    aiAgent: true,
    invoices: true,
    onlinePayments: false,
    webOrders: true,
    whatsapp: true,
  },
  name: PLAN_NAME.GROWTH,
  price: 299,
  usdPrice: 79.99,
  limits: {
    aiOrders: 400,
    channels: 4,
    products: 300,
    teamMember: 3,
    storage: 100,
    transfer: 75,
  },
};

const ProPlan: PricingPlan = {
  features: {
    advancedReports: true,
    aiAgent: true,
    invoices: true,
    onlinePayments: false,
    webOrders: true,
    whatsapp: true,
  },
  name: PLAN_NAME.PRO,
  price: 599,
  usdPrice: 159.99,
  limits: {
    aiOrders: 500,
    channels: 10,
    products: 800,
    teamMember: 5,
    storage: 150,
    transfer: 200,
  },
};

export const PaidPlans = [StarterPlan, GrowthPlan, ProPlan];
export const AllPlans = [FreePlan, ...PaidPlans];

import Stripe from 'stripe';
import { Env } from '@/libs/Env';

export const getStripe = () => {
  if (!Env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured. Add STRIPE_SECRET_KEY to the environment.');
  }

  return new Stripe(Env.STRIPE_SECRET_KEY);
};

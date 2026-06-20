import twilio from 'twilio';
import { Env } from './Env';

let _client: ReturnType<typeof twilio> | null = null;

export const createTwilioClient = (accountSid: string, authToken: string) => {
  return twilio(accountSid, authToken);
};

export const getTwilioClient = () => {
  if (!Env.TWILIO_ACCOUNT_SID || !Env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are not configured');
  }

  if (!_client) {
    _client = createTwilioClient(Env.TWILIO_ACCOUNT_SID, Env.TWILIO_AUTH_TOKEN);
  }

  return _client;
};

const isTwilioConfigured = () => {
  return Boolean(Env.TWILIO_ACCOUNT_SID && Env.TWILIO_AUTH_TOKEN);
};

export const isTwilioVerifyConfigured = () => {
  return isTwilioConfigured() && Boolean(Env.TWILIO_VERIFY_SERVICE_SID);
};

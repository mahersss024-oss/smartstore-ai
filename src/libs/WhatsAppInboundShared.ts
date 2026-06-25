import { acquireWebhookProcessingLock } from './WebhookIdempotency';

// Provider-neutral helpers shared by every WhatsApp inbound processor.

const LOCK_WAIT_MS = 8_000;
const LOCK_POLL_MS = 500;

/** The conversation is already being processed by another delivery; retry later. */
export class ConversationBusyError extends Error {
  constructor() {
    super('WhatsApp conversation is already processing');
    this.name = 'ConversationBusyError';
  }
}

/** Processing did not complete (AI or send failure); the delivery must be retried. */
export class MessageRetryError extends Error {
  constructor(public readonly reason: string) {
    super(`WhatsApp message processing requires retry: ${reason}`);
    this.name = 'MessageRetryError';
  }
}

const NON_RETRYABLE_REPLIES: Record<string, string> = {
  ai_action_disabled: 'خدمة هذا الإجراء غير متاحة حاليًا في المتجر. فضلاً تواصل مع المتجر مباشرة.',
  invalid_message: 'لم أستطع قراءة الرسالة بشكل صحيح. فضلاً أعد إرسال طلبك بصيغة أوضح.',
  store_feature_disabled: 'خدمة الطلب عبر واتساب غير متاحة حاليًا لهذا المتجر.',
  store_subscription_inactive: 'خدمة الطلبات غير متاحة حاليًا لهذا المتجر.',
  subscription_limit_reached: 'وصل المتجر إلى حد الاستخدام الحالي. فضلاً جرّب لاحقًا أو تواصل مع المتجر مباشرة.',
  too_many_messages: 'وصلت رسائل كثيرة خلال وقت قصير. فضلاً انتظر لحظات ثم أرسل طلبك مرة أخرى.',
};

export const buildFallbackReply = (error: string) => {
  return NON_RETRYABLE_REPLIES[error]
    ?? 'تعذر إكمال الطلب عبر واتساب حاليًا. فضلاً جرّب لاحقًا أو تواصل مع المتجر مباشرة.';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const acquireConversationLock = async (
  params: Parameters<typeof acquireWebhookProcessingLock>[0],
) => {
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    const lock = await acquireWebhookProcessingLock(params);

    if (lock.acquired) {
      return lock;
    }

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      return lock;
    }

    await sleep(Math.min(LOCK_POLL_MS, remaining));
  }
};

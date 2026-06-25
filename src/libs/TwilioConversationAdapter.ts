import type {
  AIEmployeeFulfillmentChoice,
  AIEmployeePaymentChoiceKind,
} from './AIEmployeeCheckout';
import type { AIEmployeeSemanticHints } from './AIEmployeeSemanticHints';
import type { AIOrchestrationVisibleSystemAction } from './AIOrchestrationDiagnostics';
import type { ConversationSuggestedProduct } from './ConversationEngine';
import { and, eq } from 'drizzle-orm';
import { conversationsTable } from '@/models/Schema';
import { db } from './DB';

type TwilioConversationCart = {
  items?: Array<{
    name?: string;
    productId?: number;
  }>;
  status?: string;
};

type TwilioConversationCustomerDetails = {
  deliveryPreference?: 'delivery' | 'pickup';
};

export type TwilioConversationMetadata = {
  aiOrchestration?: {
    systemDecision?: {
      visibleSystemActions?: AIOrchestrationVisibleSystemAction[];
    };
  };
  currentCart?: TwilioConversationCart;
  customerDetails?: TwilioConversationCustomerDetails;
  lastSuggestedProducts?: ConversationSuggestedProduct[];
  visibleSystemActions?: AIOrchestrationVisibleSystemAction[];
};

type TwilioAIResult = {
  availableFulfillmentTypes?: unknown;
  availablePaymentKinds?: unknown;
  customerDetails?: unknown;
  replyToCustomer: string;
  suggestedProducts?: unknown;
  visibleSystemActions?: unknown;
};

type AvailablePaymentKinds = {
  delivery?: AIEmployeePaymentChoiceKind[];
  pickup?: AIEmployeePaymentChoiceKind[];
};

const normalizeArabicText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
};

const normalizedTokens = (value: string) => {
  const intentWords = new Set([
    'ابي',
    'ابغى',
    'اريد',
    'بدي',
    'طلب',
    'ودي',
    'want',
    // affirmative / confirmation words — irrelevant for product name matching
    'ايه',
    'ايوه',
    'اوك',
    'تمام',
    'نعم',
    'yes',
    'ok',
  ]);

  return normalizeArabicText(value)
    .split(/\s+/)
    .filter(token => token.length > 1 && !intentWords.has(token));
};

const includesAny = (message: string, values: string[]) => {
  const normalized = normalizeArabicText(message);

  return values.some(value => normalized.includes(normalizeArabicText(value)));
};

const isAffirmative = (message: string) => {
  const normalized = normalizeArabicText(message);

  return [
    'ايه',
    'ايوه',
    'اوك',
    'تمام',
    'نعم',
    'yes',
    'ok',
  ].includes(normalized);
};

// Convert Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits to ASCII
// so a numeric reply works regardless of the customer's keyboard.
const toAsciiDigits = (value: string) => {
  return Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;

    if (code >= 0x0660 && code <= 0x0669) {
      return String(code - 0x0660);
    }

    if (code >= 0x06F0 && code <= 0x06F9) {
      return String(code - 0x06F0);
    }

    return char;
  }).join('');
};

// The numbered list shown on WhatsApp invites "reply with the product name OR
// number". Resolve a 1-based selection from messages that are essentially just a
// number ("2", "رقم ٢", "الخيار 3.") — converting Arabic-Indic/Persian digits.
// Messages that merely contain a digit among other words (e.g. a quantity like
// "ابي ٢ برجر") are intentionally NOT treated as a numeric pick.
const parseNumericSelection = (
  message: string,
  optionCount: number,
): number | undefined => {
  const normalized = toAsciiDigits(message)
    .trim()
    .toLowerCase()
    .replace(/^(?:رقم|الرقم|الخيار|خيار|option|number|no\.?|#)\s*/u, '')
    .replace(/[.،)\-\s]+$/u, '')
    .trim();

  if (!/^\d{1,3}$/.test(normalized)) {
    return undefined;
  }

  const index = Number(normalized);

  return index >= 1 && index <= optionCount ? index : undefined;
};

const findSelectedSuggestedProduct = (
  message: string,
  products: ConversationSuggestedProduct[],
) => {
  if (products.length === 1 && isAffirmative(message)) {
    return products[0];
  }

  const numericSelection = parseNumericSelection(message, products.length);

  if (numericSelection) {
    return products[numericSelection - 1];
  }

  const messageTokens = normalizedTokens(message);

  if (messageTokens.length === 0) {
    return undefined;
  }

  const matches = products.filter((product) => {
    const productName = normalizeArabicText(product.name);

    return messageTokens.every(token => productName.includes(token));
  });

  return matches.length === 1 ? matches[0] : undefined;
};

const getVisibleActions = (metadata?: TwilioConversationMetadata) => {
  return metadata?.aiOrchestration?.systemDecision?.visibleSystemActions
    ?? metadata?.visibleSystemActions
    ?? [];
};

const isVisibleSystemAction = (
  value: unknown,
): value is AIOrchestrationVisibleSystemAction => {
  return typeof value === 'string' && [
    'cart_controls',
    'final_confirmation',
    'fulfillment_choices',
    'location_share',
    'payment_choices',
    'product_choices',
    'restore_cancelled_cart',
  ].includes(value);
};

export const readVisibleSystemActions = (value: unknown) => {
  return Array.isArray(value)
    ? value.filter(isVisibleSystemAction)
    : [];
};

export const readSuggestedProducts = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((product): product is ConversationSuggestedProduct => {
    if (!product || typeof product !== 'object') {
      return false;
    }

    const candidate = product as Partial<ConversationSuggestedProduct>;

    return typeof candidate.id === 'number'
      && typeof candidate.name === 'string'
      && typeof candidate.price === 'string';
  });
};

export const readFulfillmentChoices = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((choice): choice is AIEmployeeFulfillmentChoice => {
    return choice === 'delivery' || choice === 'dine_in' || choice === 'pickup';
  });
};

export const readPaymentKinds = (value: unknown): AvailablePaymentKinds => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const readKinds = (kinds: unknown) => Array.isArray(kinds)
    ? kinds.filter((kind): kind is AIEmployeePaymentChoiceKind => {
        return kind === 'card' || kind === 'cash';
      })
    : [];

  return {
    delivery: readKinds(candidate.delivery),
    pickup: readKinds(candidate.pickup),
  };
};

export const readCustomerDetails = (value: unknown): TwilioConversationCustomerDetails => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const deliveryPreference = (value as Record<string, unknown>).deliveryPreference;

  return deliveryPreference === 'delivery' || deliveryPreference === 'pickup'
    ? { deliveryPreference }
    : {};
};

export const resolveTwilioSemanticHints = (params: {
  message: string;
  metadata?: TwilioConversationMetadata;
}): AIEmployeeSemanticHints | undefined => {
  const actions = getVisibleActions(params.metadata);
  const suggestedProducts = params.metadata?.lastSuggestedProducts ?? [];

  if (actions.includes('product_choices')) {
    const selected = findSelectedSuggestedProduct(params.message, suggestedProducts);

    if (selected) {
      return {
        selectedProductId: selected.id,
        systemEvent: {
          source: 'web_order_ui',
          type: 'product_selected',
        },
      };
    }
  }

  if (actions.includes('fulfillment_choices')) {
    if (includesAny(params.message, ['توصيل', 'وصل الطلب', 'delivery'])) {
      return {
        deliveryPreference: 'delivery',
        fulfillmentType: 'delivery',
        systemEvent: {
          source: 'web_order_ui',
          type: 'fulfillment_selected',
        },
      };
    }

    if (includesAny(params.message, ['استلام', 'الفرع', 'المحل', 'pickup'])) {
      return {
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'fulfillment_selected',
        },
      };
    }

    if (includesAny(params.message, ['محلي', 'داخل المطعم', 'داخل الفرع', 'dine in'])) {
      return {
        deliveryPreference: 'pickup',
        fulfillmentType: 'dine_in',
        systemEvent: {
          source: 'web_order_ui',
          type: 'fulfillment_selected',
        },
      };
    }
  }

  if (actions.includes('payment_choices')) {
    const deliveryPreference = params.metadata?.customerDetails?.deliveryPreference;

    if (includesAny(params.message, ['كاش', 'نقد', 'نقدي', 'cash'])) {
      return {
        paymentPreference: deliveryPreference === 'delivery'
          ? 'cash_on_delivery'
          : 'cash_on_pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'payment_selected',
        },
      };
    }

    if (includesAny(params.message, ['بطاقه', 'بطاقة', 'مدى', 'card'])) {
      return {
        paymentPreference: deliveryPreference === 'delivery'
          ? 'card_on_delivery'
          : 'card_on_pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'payment_selected',
        },
      };
    }
  }

  if (
    actions.includes('final_confirmation')
    && includesAny(params.message, [
      'ارسل الطلب',
      'إرسال الطلب',
      'ارسال الطلب',
      'اكد الطلب',
      'أكد الطلب',
      'تاكيد الطلب',
      'تأكيد الطلب',
      'نعم',
      'تمام',
      'confirm',
      'send order',
    ])
  ) {
    return {
      customerConfirmedOrder: true,
      systemEvent: {
        source: 'web_order_ui',
        type: 'order_confirmed',
      },
    };
  }

  return undefined;
};

export const loadTwilioConversationMetadata = async (params: {
  externalThreadId: string;
  organizationId: string;
}) => {
  const [conversation] = await db
    .select({ metadata: conversationsTable.metadata })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.organizationId, params.organizationId),
        eq(conversationsTable.channel, 'whatsapp'),
        eq(conversationsTable.externalThreadId, params.externalThreadId),
      ),
    )
    .limit(1);

  return (conversation?.metadata ?? undefined) as TwilioConversationMetadata | undefined;
};

export const replaceWebOnlyInstructions = (reply: string) => {
  return reply
    // "من/في الخيارات الظاهرة [لك] [على الشاشة]" — keep preposition
    .replace(
      /(من|في)\s+الخيارات\s+الظاهرة(?:\s+لك)?(?:\s+على\s+الشاشة)?/gu,
      'من الخيارات التالية',
    )
    // "الخيارات الظاهرة [لك] [قدامك/أمامك] [عالشاشة/على الشاشة]"
    .replace(
      /الخيارات\s+الظاهرة(?:\s+لك)?(?:\s+(?:قدامك|أمامك))?(?:\s+(?:عالشاشة|على\s+الشاشة))?/gu,
      'الخيارات التالية',
    )
    // "الخيارات [التي] [قدامك/أمامك] [عالشاشة/على الشاشة]"
    .replace(
      /الخيارات\s+(?:التي\s+)?(?:قدامك|أمامك)\s+(?:عالشاشة|على\s+الشاشة)/gu,
      'الخيارات التالية',
    )
    .replace(/عالشاشة|على\s+الشاشة/gu, '')
    .replace(/بالضغط\s+عليها?/gu, 'باختياره')
    .replace(/اضغط\s+عليها?/gu, 'اكتب اسمه')
    .replace(/اضغط\s+على\s+زر/gu, 'اكتب');
};

const buildProductChoices = (products: ConversationSuggestedProduct[]) => {
  if (products.length === 0) {
    return undefined;
  }

  const lines = products.map((product, index) => {
    const price = Number(product.price);
    const formattedPrice = Number.isFinite(price) ? ` - ${price.toFixed(2)} ريال` : '';

    return `${index + 1}. ${product.name}${formattedPrice}`;
  });

  return `لإضافة المنتج، اكتب اسمه كما هو:\n${lines.join('\n')}`;
};

const buildFulfillmentChoices = (choices: AIEmployeeFulfillmentChoice[]) => {
  const labels = choices.map((choice) => {
    if (choice === 'delivery') {
      return 'توصيل';
    }

    if (choice === 'pickup') {
      return 'استلام من الفرع';
    }

    return 'محلي داخل الفرع';
  });

  return labels.length > 0
    ? `اختر طريقة الاستلام بكتابة أحد الخيارات:\n${labels.join(' | ')}`
    : undefined;
};

const buildPaymentChoices = (params: {
  customerDetails?: TwilioConversationCustomerDetails;
  paymentKinds?: AvailablePaymentKinds;
}) => {
  const preference = params.customerDetails?.deliveryPreference ?? 'pickup';
  const kinds = params.paymentKinds?.[preference] ?? [];
  const labels = kinds.map(kind => (kind === 'cash' ? 'كاش' : 'بطاقة'));

  return labels.length > 0
    ? `اختر طريقة الدفع بكتابة أحد الخيارات:\n${labels.join(' | ')}`
    : undefined;
};

export const buildTwilioOutboundBody = (result: TwilioAIResult) => {
  const reply = replaceWebOnlyInstructions(result.replyToCustomer.trim());
  const actions = readVisibleSystemActions(result.visibleSystemActions);
  const customerDetails = readCustomerDetails(result.customerDetails);
  const sections: string[] = [];

  if (actions.includes('product_choices')) {
    const productChoices = buildProductChoices(
      readSuggestedProducts(result.suggestedProducts),
    );

    if (productChoices) {
      sections.push(productChoices);
    }
  }

  if (actions.includes('fulfillment_choices')) {
    const fulfillmentChoices = buildFulfillmentChoices(
      readFulfillmentChoices(result.availableFulfillmentTypes),
    );

    if (fulfillmentChoices) {
      sections.push(fulfillmentChoices);
    }
  }

  if (actions.includes('payment_choices')) {
    const paymentChoices = buildPaymentChoices({
      customerDetails,
      paymentKinds: readPaymentKinds(result.availablePaymentKinds),
    });

    if (paymentChoices) {
      sections.push(paymentChoices);
    }
  }

  if (actions.includes('location_share')) {
    sections.push('أرسل عنوان التوصيل أو شارك موقعك في رسالة واتساب.');
  }

  if (actions.includes('final_confirmation')) {
    sections.push('لتأكيد الطلب اكتب: إرسال الطلب');
  }

  return [reply, ...sections].filter(Boolean).join('\n\n');
};

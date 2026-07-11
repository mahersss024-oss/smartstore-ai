import type { AIEmployeeConversationCart } from '@/libs/AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from '@/libs/AIEmployeeCheckout';
import type { AIOrchestrationVisibleSystemAction } from '@/libs/AIOrchestrationDiagnostics';

const isArabicLocale = (locale?: string) => locale?.toLowerCase().startsWith('ar') ?? false;
const isFrenchLocale = (locale?: string) => locale?.toLowerCase().startsWith('fr') ?? false;

export const buildAIEmployeeStateFallbackReply = (params: {
  cart?: AIEmployeeConversationCart;
  customerDetails: AIEmployeeCustomerDetails;
  locale?: string;
  orderId?: null | number;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}) => {
  const hasCartItems = Boolean(params.cart?.items.length);
  const isArabic = isArabicLocale(params.locale);
  const isFrench = isFrenchLocale(params.locale);

  if (params.orderId) {
    if (isArabic) {
      return `تم استلام طلبك رقم #${params.orderId}. الطلب الآن عند المتجر للمراجعة والمتابعة.`;
    }

    if (isFrench) {
      return `Votre commande #${params.orderId} a bien ete recue. Le magasin va maintenant la verifier et la suivre.`;
    }

    return `Your order #${params.orderId} has been received. The store will review and follow it now.`;
  }

  if (params.visibleSystemActions.includes('location_share')) {
    if (isArabic) {
      return 'تم اختيار التوصيل. شارك موقعك الحالي لنكمل الطلب.';
    }

    if (isFrench) {
      return 'La livraison est selectionnee. Partagez votre position actuelle pour continuer.';
    }

    return 'Delivery is selected. Share your current location to continue.';
  }

  if (params.visibleSystemActions.includes('payment_choices')) {
    if (isArabic) {
      return 'وصلت بيانات الاستلام. اختر طريقة الدفع المناسبة لك لنكمل الطلب.';
    }

    if (isFrench) {
      return 'Les informations de reception sont pretes. Choisissez le mode de paiement qui vous convient pour continuer.';
    }

    return 'The fulfillment details are ready. Choose your preferred payment method to continue.';
  }

  if (params.visibleSystemActions.includes('final_confirmation')) {
    if (isArabic) {
      return 'الطلب جاهز للمراجعة. تأكد من التفاصيل ثم أرسله للمتجر عند جاهزيتك.';
    }

    if (isFrench) {
      return 'La commande est prete pour verification. Confirmez les details puis envoyez-la au magasin quand vous etes pret.';
    }

    return 'The order is ready for review. Check the details, then send it to the store when you are ready.';
  }

  if (params.visibleSystemActions.includes('fulfillment_choices') && hasCartItems) {
    if (isArabic) {
      return 'السلة جاهزة. اختر طريقة الاستلام المناسبة لك لنكمل الطلب.';
    }

    if (isFrench) {
      return 'Le panier est pret. Choisissez le mode de reception qui vous convient pour continuer.';
    }

    return 'Your cart is ready. Choose the fulfillment method that works best for you to continue.';
  }

  if (params.visibleSystemActions.includes('product_choices')) {
    if (isArabic) {
      return 'اختر المنتج المناسب من الخيارات الظاهرة لك، أو اكتب لي توضيحاً إذا كنت تقصد شيئاً آخر.';
    }

    if (isFrench) {
      return 'Choisissez le produit qui vous convient parmi les options affichees, ou precisez si vous cherchez autre chose.';
    }

    return 'Choose the right product from the visible options, or tell me more if you meant something else.';
  }

  if (hasCartItems) {
    if (isArabic) {
      return 'تم تحديث السلة. راجعها واختر الخطوة المناسبة لك.';
    }

    if (isFrench) {
      return 'Le panier a ete mis a jour. Verifiez-le et choisissez la prochaine etape.';
    }

    return 'The cart has been updated. Review it and choose the next step.';
  }

  if (isArabic) {
    return 'لم أتمكن من فهم طلبك. هل يمكنك توضيح ما تريده؟';
  }

  if (isFrench) {
    return 'Je n\'ai pas pu comprendre votre demande. Pouvez-vous preciser ce que vous souhaitez?';
  }

  return 'I wasn\'t able to understand your request. Could you clarify what you need?';
};

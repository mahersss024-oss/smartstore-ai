'use client';

import type { ChatMessage, FulfillmentChoice, PaymentChoiceKind, RemoteMessage, WebChatResponseData } from './WebOrderChatState';
import type { AIEmployeeSemanticHints } from '@/libs/AIEmployeeSemanticHints';
import { MapPin, Send, ShoppingBag, Trash2, UserRound } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { formatDateTime } from '@/libs/DateTime';
import { normalizeWebOrderSourceChannel } from '@/utils/CustomerChannels';
import { getWebChatMessages, requestPhoneOtp, sendWebChatMessage, verifyPhoneOtp } from './WebChatActions';
import {
  appendWebOrderChatMessage,
  buildWebOrderSafeReplyText,
  createWebOrderChatId,
  getAvailableWebOrderPaymentKinds,
  getLatestWebOrderAssistantMessage,
  getWebOrderPaymentPreferenceForChoice,
  hasWebOrderFulfillmentChoice,
  mergeWebOrderChatMessages,
  normalizeRemoteWebOrderMessage,
  normalizeWebOrderCancelledCartSnapshot,
  normalizeWebOrderChatCart,
  normalizeWebOrderCustomerDetails,
  normalizeWebOrderMissingDetails,
  normalizeWebOrderProducts,
  normalizeWebOrderVisibleSystemActions,
  webOrderChatRequiresChoiceResponse,
} from './WebOrderChatState';
import {
  createWebOrderGuestId,
  createWebOrderThreadId,
  getWebOrderCustomerIdServerSnapshot,
  getWebOrderCustomerIdSnapshot,
  getWebOrderThreadIdServerSnapshot,
  getWebOrderThreadIdSnapshot,
  readStoredWebOrderGuestId,
  readStoredWebOrderThreadId,
  subscribeToWebOrderGuestId,
  writeStoredWebOrderGuestId,
  writeStoredWebOrderThreadId,
} from './WebOrderGuestIdentity';

type WebOrderChatProps = {
  availableFulfillmentTypes: FulfillmentChoice[];
  availablePaymentKinds: {
    delivery: PaymentChoiceKind[];
    pickup: PaymentChoiceKind[];
  };
  agentLabel: string;
  otpCodeLabel?: string;
  otpCodePlaceholder?: string;
  otpErrorLabel?: string;
  otpPhoneLabel?: string;
  otpPhonePlaceholder?: string;
  otpSendLabel?: string;
  otpVerifyLabel?: string;
  requirePhoneVerification?: boolean;
  cartAddOrderLabel: string;
  cartCurrentLabel: string;
  cartDecreaseQuantityLabel: string;
  cartDeliveryFeeLabel: string;
  cartIncreaseQuantityLabel: string;
  cartQuantityLabel: string;
  cartRemoveItemLabel: string;
  cartRestoreCancelledLabel: string;
  cartStartNewOrderLabel: string;
  cartSubmittedLabel: string;
  clearConversationConfirmLabel: string;
  clearConversationLabel: string;
  confirmAllProductsLabel: string;
  disabledText: string;
  choiceCardLabel: string;
  choiceCashLabel: string;
  choiceConfirmCancelLabel: string;
  choiceConfirmSendLabel: string;
  choiceRequiredPlaceholder: string;
  choiceDeliveryLabel: string;
  choiceDineInLabel: string;
  choiceOtherLabel: string;
  choicePickupLabel: string;
  inputLabel: string;
  inputPlaceholder: string;
  initialTableNumber?: string;
  locationMessagePrefix: string;
  locationUnavailableText: string;
  locationLabel: string;
  locale: string;
  organizationId: string;
  sendLabel: string;
  source: string;
  storeLogoUrl?: null | string;
  tableNumberLabel: string;
  tableNumberPlaceholder: string;
  tableNumberRequiredLabel: string;
  storeName: string;
  timeZone?: string;
  welcomeMessage: string;
};

const getAvatarInitial = (value: string) => {
  return value.trim().charAt(0).toUpperCase() || 'S';
};

const AssistantAvatar = (props: {
  agentLabel: string;
  storeLogoUrl?: null | string;
  storeName: string;
}) => {
  const avatarLabel = props.agentLabel || props.storeName;

  return (
    <div className="
      flex size-9 shrink-0 items-center justify-center overflow-hidden
      rounded-lg bg-primary/10 text-xs font-bold text-primary
    "
    >
      {props.storeLogoUrl
        ? (
            // eslint-disable-next-line next/no-img-element -- Store logos can be merchant-provided external URLs.
            <img
              alt={props.storeName}
              src={props.storeLogoUrl}
              className="size-full object-cover"
            />
          )
        : getAvatarInitial(avatarLabel)}
    </div>
  );
};

const renderMessageText = (text: string) => {
  const urlPattern = /https?:\/\/\S+/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      segments.push(text.slice(lastIndex, startIndex));
    }

    segments.push(
      <a
        key={`${url}-${startIndex}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline underline-offset-2"
      >
        {url}
      </a>,
    );

    lastIndex = startIndex + url.length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return segments.length > 0 ? segments : text;
};

export function WebOrderChat(props: WebOrderChatProps) {
  const sourceChannel = normalizeWebOrderSourceChannel(props.source);
  const isTableOrder = sourceChannel === 'web_chat_table';
  const threadScope = `${props.organizationId}:${sourceChannel}`;
  const getThreadSnapshot = useCallback(
    () => getWebOrderThreadIdSnapshot(threadScope),
    [threadScope],
  );
  const customerId = useSyncExternalStore(
    subscribeToWebOrderGuestId,
    getWebOrderCustomerIdSnapshot,
    getWebOrderCustomerIdServerSnapshot,
  );
  const storedThreadId = useSyncExternalStore(
    subscribeToWebOrderGuestId,
    getThreadSnapshot,
    getWebOrderThreadIdServerSnapshot,
  );
  const threadId = storedThreadId;
  const [message, setMessage] = useState('');
  const [tableNumber, setTableNumber] = useState(
    () => props.initialTableNumber?.trim().slice(0, 50) ?? '',
  );
  const [showTableNumberError, setShowTableNumberError] = useState(false);
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);
  const [isSendingLocation, setIsSendingLocation] = useState(false);
  const welcomeMessage = useMemo<ChatMessage>(() => ({
    id: 'welcome',
    sender: 'ai',
    text: props.welcomeMessage,
  }), [props.welcomeMessage]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    welcomeMessage,
  ]);
  const [isPending, startTransition] = useTransition();
  const [otpStep, setOtpStep] = useState<'phone' | 'code' | 'done'>(
    props.requirePhoneVerification ? 'phone' : 'done',
  );
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSessionId] = useState(() => createWebOrderChatId());
  const [isOtpPending, startOtpTransition] = useTransition();
  const deleteArmedTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pendingSubmissionRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const latestCart = useMemo(() => {
    const latestCartMessage = [...messages].reverse().find(item => item.cart);

    return latestCartMessage?.cart && latestCartMessage.cart.items.length > 0
      ? latestCartMessage.cart
      : undefined;
  }, [messages]);
  const latestAssistantMessage = useMemo(
    () => getLatestWebOrderAssistantMessage(messages, { currentCart: latestCart }),
    [latestCart, messages],
  );
  const mustChooseFromOptions = webOrderChatRequiresChoiceResponse(latestAssistantMessage);
  const latestMessageId = latestAssistantMessage?.id;
  const latestVisibleSystemActions = latestAssistantMessage?.visibleSystemActions ?? [];
  const canUseGlobalLocationButton = !isTableOrder && (
    !mustChooseFromOptions
    || latestVisibleSystemActions.includes('location_share')
  );
  const normalizedTableNumber = tableNumber.trim().slice(0, 50);
  const tableNumberMissing = isTableOrder && normalizedTableNumber.length === 0;

  const scrollToLatestMessage = (behavior: ScrollBehavior = 'smooth') => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;

      if (!container) {
        return;
      }

      container.scrollTo({
        behavior,
        top: container.scrollHeight,
      });
    });
  };

  useEffect(() => {
    let guestId = readStoredWebOrderGuestId();

    if (!guestId) {
      guestId = createWebOrderGuestId();
      writeStoredWebOrderGuestId(guestId);
    }

    if (!readStoredWebOrderThreadId(threadScope)) {
      writeStoredWebOrderThreadId(threadScope, `web-chat-${guestId}`);
    }
  }, [threadScope]);

  useEffect(() => {
    scrollToLatestMessage();
  }, [messages]);

  useEffect(() => {
    if (isPending) {
      scrollToLatestMessage();
    }
  }, [isPending]);

  useEffect(() => {
    return () => {
      if (deleteArmedTimeoutRef.current) {
        window.clearTimeout(deleteArmedTimeoutRef.current);
      }
    };
  }, []);

  const updateAutoScrollPreference = () => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight
      - container.scrollTop
      - container.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (!threadId) {
      return;
    }

    let isMounted = true;

    const syncMessages = async () => {
      const response = await getWebChatMessages({
        customerExternalId: customerId || threadId,
        externalThreadId: threadId,
        organizationId: props.organizationId,
        source: sourceChannel,
      });

      if (!isMounted || !response.ok) {
        return;
      }

      const remoteMessages = (response.data as RemoteMessage[])
        .map(normalizeRemoteWebOrderMessage)
        .filter((item): item is ChatMessage => Boolean(item));

      setMessages(current => mergeWebOrderChatMessages(current, remoteMessages));
    };

    syncMessages().catch(() => {});
    const intervalId = window.setInterval(() => {
      syncMessages().catch(() => {});
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [customerId, props.organizationId, sourceChannel, threadId]);

  const handleSendOtp = () => {
    if (isOtpPending) {
      return;
    }

    setOtpError('');
    startOtpTransition(async () => {
      const result = await requestPhoneOtp({
        organizationId: props.organizationId,
        phone: otpPhone.trim(),
        sessionId: otpSessionId,
      });

      if (result.ok) {
        setOtpStep('code');
      } else {
        setOtpError(props.otpErrorLabel ?? 'Failed to send code. Check the phone number and try again.');
      }
    });
  };

  const handleVerifyOtp = () => {
    if (isOtpPending) {
      return;
    }

    setOtpError('');
    startOtpTransition(async () => {
      const result = await verifyPhoneOtp({
        code: otpCode.trim(),
        organizationId: props.organizationId,
        phone: otpPhone.trim(),
        sessionId: otpSessionId,
      });

      if (result.ok) {
        setOtpStep('done');
      } else {
        setOtpError(props.otpErrorLabel ?? 'Invalid or expired code. Please try again.');
      }
    });
  };

  const submitMessage = (
    messageBody?: string,
    semanticHints?: AIEmployeeSemanticHints,
    options?: {
      suppressCustomerEcho?: boolean;
    },
  ) => {
    if (mustChooseFromOptions && !messageBody) {
      return;
    }

    const body = (messageBody ?? message).trim();
    if (tableNumberMissing) {
      setShowTableNumberError(true);
      return;
    }

    if (!body || !threadId || isPending || pendingSubmissionRef.current) {
      return;
    }

    pendingSubmissionRef.current = true;
    const clientSubmissionId = createWebOrderChatId();
    const tableOrderSemanticHints = isTableOrder
      ? {
          deliveryPreference: 'pickup' as const,
          fulfillmentType: 'dine_in' as const,
          tableNumber: normalizedTableNumber,
        }
      : {};
    setMessage('');
    shouldAutoScrollRef.current = true;
    if (!options?.suppressCustomerEcho) {
      setMessages(current => appendWebOrderChatMessage(current, {
        clientSubmissionId,
        createdAt: new Date().toISOString(),
        id: createWebOrderChatId(),
        sender: 'customer',
        text: body,
      }));
    }

    startTransition(async () => {
      try {
        const response = await sendWebChatMessage({
          body,
          clientSubmissionId,
          customer: {
            externalId: customerId || threadId,
          },
          externalThreadId: threadId,
          locale: props.locale,
          organizationId: props.organizationId,
          semanticHints: {
            ...semanticHints,
            ...tableOrderSemanticHints,
          },
          source: sourceChannel,
          suppressCustomerEcho: options?.suppressCustomerEcho,
        });

        if (!response.ok) {
          setMessages(current => appendWebOrderChatMessage(current, {
            createdAt: new Date().toISOString(),
            id: createWebOrderChatId(),
            sender: 'ai',
            text: props.disabledText,
          }));
          return;
        }

        const data = response.data as unknown as WebChatResponseData;
        const responseCart = normalizeWebOrderChatCart(data.currentCart);
        const cancelledCartSnapshot = normalizeWebOrderCancelledCartSnapshot(
          data.cancelledCartSnapshot,
        );
        const normalizedProducts = normalizeWebOrderProducts(data.suggestedProducts);
        const visibleSystemActions = normalizeWebOrderVisibleSystemActions(
          data.visibleSystemActions,
        );
        const replyText = data.replyToCustomer.trim();
        const cartMutationType = typeof data.cartMutation?.type === 'string'
          ? data.cartMutation.type
          : 'none';
        const visibleActionsChanged = JSON.stringify([...visibleSystemActions].sort())
          !== JSON.stringify([...latestVisibleSystemActions].sort());
        const hasStructuredVisualContinuation = Boolean(responseCart)
          || Boolean(cancelledCartSnapshot)
          || normalizedProducts.length > 0
          || visibleActionsChanged;
        const safeReplyText = buildWebOrderSafeReplyText({
          fallbackText: props.disabledText,
          hasStructuredVisualContinuation,
          replyText,
        });

        if (!safeReplyText && !responseCart && !cancelledCartSnapshot && normalizedProducts.length === 0) {
          setMessages(current => appendWebOrderChatMessage(current, {
            createdAt: new Date().toISOString(),
            id: createWebOrderChatId(),
            sender: 'ai',
            text: props.disabledText,
          }));
          return;
        }

        if (
          !safeReplyText
          && cartMutationType === 'none'
          && !cancelledCartSnapshot
          && normalizedProducts.length === 0
          && !visibleActionsChanged
        ) {
          setMessages(current => appendWebOrderChatMessage(current, {
            createdAt: new Date().toISOString(),
            id: createWebOrderChatId(),
            sender: 'ai',
            text: props.disabledText,
          }));
          return;
        }

        setMessages(current => appendWebOrderChatMessage(current, {
          cart: responseCart,
          cancelledCartSnapshot,
          createdAt: new Date().toISOString(),
          customerDetails: normalizeWebOrderCustomerDetails(data.customerDetails),
          id: createWebOrderChatId(),
          missingDetails: normalizeWebOrderMissingDetails(data.missingDetails),
          orderId: data.orderId,
          products: normalizedProducts,
          remoteId: typeof data.responseMessageId === 'number'
            ? data.responseMessageId
            : undefined,
          sender: 'ai',
          text: safeReplyText,
          visibleSystemActions,
        }));
      } catch {
        setMessages(current => appendWebOrderChatMessage(current, {
          createdAt: new Date().toISOString(),
          id: createWebOrderChatId(),
          sender: 'ai',
          text: props.disabledText,
        }));
      } finally {
        pendingSubmissionRef.current = false;
      }
    });
  };

  const submitSystemAction = (
    semanticHints: AIEmployeeSemanticHints,
    systemEventType: NonNullable<AIEmployeeSemanticHints['systemEvent']>['type'],
  ) => {
    submitMessage('system_action', {
      ...semanticHints,
      systemEvent: {
        source: 'web_order_ui',
        type: systemEventType,
      },
    }, { suppressCustomerEcho: true });
  };

  const appendLocalAssistantMessage = (text: string) => {
    setMessages(current => appendWebOrderChatMessage(current, {
      createdAt: new Date().toISOString(),
      id: createWebOrderChatId(),
      sender: 'ai',
      text,
    }));
  };

  const allowFreeTextForLatestChoice = () => {
    const latestMessage = latestAssistantMessage;

    if (!latestMessage || latestMessage.sender !== 'ai') {
      return;
    }

    setMessages(current => current.map((item) => {
      return item.id === latestMessage.id
        ? { ...item, freeTextAllowed: true }
        : item;
    }));
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  const sendCurrentLocation = () => {
    if (!threadId || isPending || isSendingLocation) {
      return;
    }

    if (!navigator.geolocation) {
      appendLocalAssistantMessage(props.locationUnavailableText);
      return;
    }

    setIsSendingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const locationMessage = [
          props.locationMessagePrefix,
          mapUrl,
        ].join('\n');

        setIsSendingLocation(false);
        submitMessage(locationMessage, {
          customerAddress: mapUrl,
          systemEvent: {
            source: 'web_order_ui',
            type: 'location_shared',
          },
        });
      },
      () => {
        setIsSendingLocation(false);
        appendLocalAssistantMessage(props.locationUnavailableText);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      },
    );
  };

  const deleteConversation = () => {
    if (!threadId || isPending) {
      return;
    }

    if (!isDeleteArmed) {
      setIsDeleteArmed(true);
      deleteArmedTimeoutRef.current = window.setTimeout(() => {
        setIsDeleteArmed(false);
      }, 3000);
      return;
    }

    if (deleteArmedTimeoutRef.current) {
      window.clearTimeout(deleteArmedTimeoutRef.current);
      deleteArmedTimeoutRef.current = null;
    }

    const stableCustomerId = customerId || getWebOrderCustomerIdSnapshot();

    if (!stableCustomerId) {
      setIsDeleteArmed(false);
      return;
    }

    writeStoredWebOrderThreadId(
      threadScope,
      createWebOrderThreadId(stableCustomerId),
    );
    shouldAutoScrollRef.current = true;
    setIsDeleteArmed(false);
    setMessage('');
    setMessages([
      {
        ...welcomeMessage,
        id: `welcome-${createWebOrderChatId()}`,
      },
    ]);
  };

  if (props.requirePhoneVerification && otpStep !== 'done') {
    return (
      <section className="
        flex h-[min(720px,calc(100vh-180px))] min-h-[520px] flex-col
        items-center justify-center gap-6 overflow-hidden rounded-xl border
        border-primary/15 bg-background p-8 text-start shadow-sm
        shadow-primary/10
      "
      >
        <div className="
          flex size-12 items-center justify-center rounded-xl bg-primary/10
        "
        >
          <UserRound className="size-6 text-primary" />
        </div>
        <div className="w-full max-w-xs space-y-4">
          {otpStep === 'phone' && (
            <>
              <div>
                <label
                  htmlFor="otp-phone"
                  className="mb-1 block text-sm font-semibold text-slate-800"
                >
                  {props.otpPhoneLabel ?? 'Your phone number'}
                </label>
                <input
                  id="otp-phone"
                  type="tel"
                  autoComplete="tel"
                  value={otpPhone}
                  onChange={event => setOtpPhone(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSendOtp();
                    }
                  }}
                  placeholder={props.otpPhonePlaceholder ?? '+1 555 000 0000'}
                  disabled={isOtpPending}
                  className="
                    w-full rounded-lg border border-primary/20 bg-background/90
                    px-3 py-2 text-sm transition outline-none
                    focus:border-primary
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
                />
              </div>
              {otpError && (
                <p className="text-xs font-medium text-red-600">{otpError}</p>
              )}
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isOtpPending || !otpPhone.trim()}
                className="
                  w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium
                  text-primary-foreground transition
                  disabled:cursor-wait disabled:opacity-65
                "
              >
                {isOtpPending ? '...' : (props.otpSendLabel ?? 'Send code')}
              </button>
            </>
          )}
          {otpStep === 'code' && (
            <>
              <div>
                <label
                  htmlFor="otp-code"
                  className="mb-1 block text-sm font-semibold text-slate-800"
                >
                  {props.otpCodeLabel ?? 'Verification code'}
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={event => setOtpCode(event.target.value.replace(/\D/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleVerifyOtp();
                    }
                  }}
                  placeholder={props.otpCodePlaceholder ?? '000000'}
                  disabled={isOtpPending}
                  className="
                    w-full rounded-lg border border-primary/20 bg-background/90
                    px-3 py-2 text-sm tracking-widest transition outline-none
                    focus:border-primary
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
                />
              </div>
              {otpError && (
                <p className="text-xs font-medium text-red-600">{otpError}</p>
              )}
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={isOtpPending || otpCode.length < 4}
                className="
                  w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium
                  text-primary-foreground transition
                  disabled:cursor-wait disabled:opacity-65
                "
              >
                {isOtpPending ? '...' : (props.otpVerifyLabel ?? 'Verify')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpStep('phone');
                  setOtpCode('');
                  setOtpError('');
                }}
                disabled={isOtpPending}
                className="
                  w-full text-center text-xs text-primary underline
                  underline-offset-2
                "
              >
                ←
                {' '}
                {props.otpPhoneLabel ?? 'Change number'}
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="
      flex h-[min(720px,calc(100vh-180px))] min-h-[520px] flex-col
      overflow-hidden rounded-xl border border-primary/15 bg-background
      text-start shadow-sm shadow-primary/10
    "
    >
      <div className="
        flex items-center justify-between gap-3 border-b border-primary/10 px-4
        py-3
      "
      >
        <div>
          <h2 className="text-sm font-bold text-slate-950">{props.storeName}</h2>
          <p className="text-xs font-medium text-primary">{props.agentLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={deleteConversation}
            disabled={isPending}
            aria-label={props.clearConversationLabel}
            title={isDeleteArmed ? props.clearConversationConfirmLabel : props.clearConversationLabel}
            className="
              flex size-9 items-center justify-center rounded-lg border
              border-primary/15 bg-background/80 text-primary transition
              hover:border-red-200 hover:bg-red-50 hover:text-red-600
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            <Trash2 className="size-4" />
          </button>
          {latestCart && (
            <div className="
              flex items-center gap-2 rounded-lg border border-primary/15
              bg-background/80 px-3 py-2 text-xs font-semibold text-primary
            "
            >
              <ShoppingBag className="size-4" />
              <span>{latestCart.items.length}</span>
              <span>{(latestCart.total ?? latestCart.subtotal).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {isTableOrder && (
        <div className="border-b border-primary/10 px-4 py-3">
          <label
            htmlFor="web-chat-table-number"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            {props.tableNumberLabel}
          </label>
          <input
            id="web-chat-table-number"
            value={tableNumber}
            maxLength={50}
            aria-invalid={showTableNumberError && tableNumberMissing}
            aria-describedby={showTableNumberError && tableNumberMissing
              ? 'web-chat-table-number-error'
              : undefined}
            onChange={(event) => {
              const nextValue = event.target.value.slice(0, 50);
              setTableNumber(nextValue);
              if (nextValue.trim()) {
                setShowTableNumberError(false);
              }
            }}
            placeholder={props.tableNumberPlaceholder}
            className="
              h-10 w-full rounded-lg border border-primary/15 bg-background/90
              px-3 text-sm transition outline-none
              focus:border-primary
            "
          />
          {showTableNumberError && tableNumberMissing && (
            <p
              id="web-chat-table-number-error"
              className="mt-1 text-xs font-semibold text-red-600"
            >
              {props.tableNumberRequiredLabel}
            </p>
          )}
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={updateAutoScrollPreference}
        className="
          min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5
        "
      >
        {messages.map((item) => {
          const isLatestInteractiveMessage = item.id === latestMessageId;
          const displayText = item.text;
          const visibleSystemActions = item.visibleSystemActions ?? [];
          const canChooseProducts = visibleSystemActions.includes('product_choices');
          const canControlCart = visibleSystemActions.includes('cart_controls');
          const canRestoreCancelledCart = visibleSystemActions.includes('restore_cancelled_cart');
          const shouldChooseFulfillment = visibleSystemActions.includes('fulfillment_choices');
          const shouldShareLocation = visibleSystemActions.includes('location_share');
          const shouldChoosePayment = visibleSystemActions.includes('payment_choices');
          const shouldConfirmOrder = visibleSystemActions.includes('final_confirmation');
          const timestamp = formatDateTime(item.createdAt, props.locale, props.timeZone);
          const hasVisibleContent = displayText.length > 0
            || Boolean(item.cart?.items.length)
            || Boolean(item.cancelledCartSnapshot && canRestoreCancelledCart)
            || Boolean(item.products?.length && canChooseProducts)
            || shouldShareLocation
            || visibleSystemActions.length > 0;

          if (!hasVisibleContent) {
            return null;
          }

          return (
            <div
              key={item.id}
              className={`
                flex gap-3
                ${item.sender === 'customer' ? 'justify-end' : 'justify-start'}
              `}
            >
              {item.sender === 'ai' && (
                <AssistantAvatar
                  agentLabel={props.agentLabel}
                  storeLogoUrl={props.storeLogoUrl}
                  storeName={props.storeName}
                />
              )}
              <div className={`
                max-w-[82%] rounded-xl px-4 py-3 text-sm/6
                ${item.sender === 'customer'
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent/80 text-slate-900'}
              `}
              >
                {displayText.length > 0
                  ? (
                      <p className="wrap-break-word whitespace-pre-line">
                        {renderMessageText(displayText)}
                      </p>
                    )
                  : null}

                {timestamp && (
                  <time
                    dateTime={item.createdAt}
                    className={`
                      mt-2 block text-[11px]
                      ${item.sender === 'customer'
                    ? 'text-primary-foreground/75'
                    : 'text-slate-500'}
                    `}
                  >
                    {timestamp}
                  </time>
                )}

                {item.products && item.products.length > 0 && canChooseProducts && (
                  <div className="mt-3 grid gap-3">
                    {item.products.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => submitSystemAction({
                          selectedProductId: product.id,
                        }, 'product_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        aria-label={product.name}
                        className="
                          grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-lg
                          border border-primary/10 bg-background/90 p-2
                          text-start text-slate-900 transition
                          hover:border-primary/40 hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-70
                        "
                      >
                        <div className="
                          flex aspect-square items-center justify-center
                          overflow-hidden rounded-md bg-accent/70
                        "
                        >
                          {product.image
                            ? (
                                // eslint-disable-next-line next/no-img-element -- Product images may be external URLs, local uploads, or database-backed data URLs.
                                <img
                                  alt={product.name}
                                  src={product.image}
                                  className="size-full object-cover"
                                />
                              )
                            : <ShoppingBag className="size-5 text-slate-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{product.name}</div>
                          <div className="
                            mt-1 text-xs font-semibold text-primary
                          "
                          >
                            {product.price}
                          </div>
                          {product.salesReason && (
                            <p className="
                              mt-1 line-clamp-2 text-xs/5 text-slate-600
                            "
                            >
                              {product.salesReason}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {item.products.length > 1 && !item.freeTextAllowed && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({ addAllSuggestedProducts: true }, 'all_products_confirmed')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-primary/10 px-3
                          py-2 text-sm font-semibold text-primary transition
                          hover:bg-primary/20
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.confirmAllProductsLabel}
                      </button>
                    )}
                    {!item.freeTextAllowed && (
                      <button
                        type="button"
                        onClick={allowFreeTextForLatestChoice}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-sm font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceOtherLabel}
                      </button>
                    )}
                  </div>
                )}

                {item.cart && item.cart.items.length > 0 && (
                  <div className="
                    mt-3 rounded-lg border border-primary/15 bg-background/90
                    p-3 text-slate-900
                  "
                  >
                    <div className="
                      mb-2 flex items-center gap-2 text-xs font-bold
                    "
                    >
                      <ShoppingBag className="size-4" />
                      <span>{item.cart.status === 'submitted' ? props.cartSubmittedLabel : props.cartCurrentLabel}</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-700">
                      {item.cart.items.map(cartItem => (
                        <div
                          key={cartItem.productId}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate">{cartItem.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {cartItem.unitPrice.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="
                              min-w-12 text-end font-semibold text-slate-900
                            "
                            >
                              {(cartItem.quantity * cartItem.unitPrice).toFixed(2)}
                            </span>
                            {canControlCart
                              && item.cart?.status === 'collecting'
                              && isLatestInteractiveMessage && (
                              <button
                                type="button"
                                onClick={() => submitSystemAction({
                                  replaceExistingQuantity: true,
                                  requestedQuantity: Math.max(1, cartItem.quantity - 1),
                                  selectedProductId: cartItem.productId,
                                }, 'cart_quantity_changed')}
                                disabled={isPending || cartItem.quantity <= 1}
                                aria-label={props.cartDecreaseQuantityLabel}
                                className="
                                  flex size-6 items-center justify-center
                                  rounded-md border border-primary/15
                                  bg-background/90 font-bold text-slate-700
                                  transition
                                  hover:bg-accent/70
                                  disabled:cursor-not-allowed
                                  disabled:opacity-40
                                "
                              >
                                -
                              </button>
                            )}
                            <span>
                              x
                              {cartItem.quantity}
                            </span>
                            {canControlCart
                              && item.cart?.status === 'collecting'
                              && isLatestInteractiveMessage && (
                              <select
                                value={cartItem.quantity}
                                onChange={(event) => {
                                  submitSystemAction({
                                    replaceExistingQuantity: true,
                                    requestedQuantity: Number(event.target.value),
                                    selectedProductId: cartItem.productId,
                                  }, 'cart_quantity_changed');
                                }}
                                disabled={isPending}
                                aria-label={props.cartQuantityLabel}
                                className="
                                  h-7 rounded-md border border-primary/15
                                  bg-background/90 px-1 text-xs font-semibold
                                  text-slate-700
                                  disabled:cursor-not-allowed
                                  disabled:opacity-40
                                "
                              >
                                {Array.from({ length: 10 }, (_, index) => index + 1)
                                  .concat(cartItem.quantity > 10 ? [cartItem.quantity] : [])
                                  .filter((quantity, index, quantities) => {
                                    return quantities.indexOf(quantity) === index;
                                  })
                                  .map(quantity => (
                                    <option key={quantity} value={quantity}>
                                      {quantity}
                                    </option>
                                  ))}
                              </select>
                            )}
                            {canControlCart
                              && item.cart?.status === 'collecting'
                              && isLatestInteractiveMessage && (
                              <button
                                type="button"
                                onClick={() => submitSystemAction({
                                  replaceExistingQuantity: true,
                                  requestedQuantity: Math.min(99, cartItem.quantity + 1),
                                  selectedProductId: cartItem.productId,
                                }, 'cart_quantity_changed')}
                                disabled={isPending || cartItem.quantity >= 99}
                                aria-label={props.cartIncreaseQuantityLabel}
                                className="
                                  flex size-6 items-center justify-center
                                  rounded-md border border-primary/15
                                  bg-background/90 font-bold text-slate-700
                                  transition
                                  hover:bg-accent/70
                                  disabled:cursor-not-allowed
                                  disabled:opacity-40
                                "
                              >
                                +
                              </button>
                            )}
                            {canControlCart
                              && item.cart?.status === 'collecting'
                              && isLatestInteractiveMessage && (
                              <button
                                type="button"
                                onClick={() => submitSystemAction({
                                  removeCartItemProductId: cartItem.productId,
                                }, 'cart_item_removed')}
                                disabled={isPending}
                                aria-label={props.cartRemoveItemLabel}
                                className="
                                  flex size-6 items-center justify-center
                                  rounded-md border border-red-200
                                  bg-background/90 text-red-700 transition
                                  hover:bg-red-50
                                  disabled:cursor-not-allowed
                                  disabled:opacity-40
                                "
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {Number(item.cart.deliveryFee ?? 0) > 0 && (
                      <div className="
                        mt-2 flex items-center justify-between gap-3 border-t
                        border-primary/10 pt-2 text-xs text-slate-600
                      "
                      >
                        <span>{props.cartDeliveryFeeLabel}</span>
                        <span>{Number(item.cart.deliveryFee ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="
                      mt-2 border-t border-primary/10 pt-2 text-xs font-bold
                      text-slate-950
                    "
                    >
                      {(item.cart.total ?? item.cart.subtotal).toFixed(2)}
                    </div>
                    {canControlCart
                      && item.cart.status === 'collecting'
                      && isLatestInteractiveMessage && (
                      <button
                        type="button"
                        onClick={allowFreeTextForLatestChoice}
                        disabled={isPending}
                        className="
                          mt-3 w-full rounded-lg border border-primary/20
                          bg-background/90 px-3 py-2 text-xs font-semibold
                          text-primary transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.cartAddOrderLabel}
                      </button>
                    )}
                  </div>
                )}

                {item.sender === 'ai'
                  && !item.cart?.items.length
                  && item.cancelledCartSnapshot
                  && canRestoreCancelledCart
                  && isLatestInteractiveMessage && (
                  <div className="
                    mt-3 rounded-lg border border-primary/15 bg-background/90
                    p-3 text-slate-900
                  "
                  >
                    <div className="
                      mb-2 flex items-center gap-2 text-xs font-bold
                    "
                    >
                      <ShoppingBag className="size-4" />
                      <span>{props.cartCurrentLabel}</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-700">
                      {item.cancelledCartSnapshot.cart.items.map(cartItem => (
                        <div
                          key={cartItem.productId}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="truncate">{cartItem.name}</span>
                          <span className="shrink-0">
                            x
                            {cartItem.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="
                      mt-2 border-t border-primary/10 pt-2 text-xs font-bold
                      text-slate-950
                    "
                    >
                      {item.cancelledCartSnapshot.cart.subtotal.toFixed(2)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => submitSystemAction({ restoreCancelledCart: true }, 'cart_restored')}
                        disabled={isPending}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.cartRestoreCancelledLabel}
                      </button>
                      <button
                        type="button"
                        onClick={allowFreeTextForLatestChoice}
                        disabled={isPending}
                        className="
                          rounded-lg border border-primary/15 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.cartStartNewOrderLabel}
                      </button>
                    </div>
                  </div>
                )}

                {item.sender === 'ai'
                  && shouldChooseFulfillment && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hasWebOrderFulfillmentChoice(props.availableFulfillmentTypes, 'delivery') && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({
                          deliveryPreference: 'delivery',
                          fulfillmentType: 'delivery',
                        }, 'fulfillment_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceDeliveryLabel}
                      </button>
                    )}
                    {hasWebOrderFulfillmentChoice(props.availableFulfillmentTypes, 'pickup') && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({
                          deliveryPreference: 'pickup',
                          fulfillmentType: 'pickup',
                        }, 'fulfillment_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choicePickupLabel}
                      </button>
                    )}
                    {hasWebOrderFulfillmentChoice(props.availableFulfillmentTypes, 'dine_in') && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({
                          deliveryPreference: 'pickup',
                          fulfillmentType: 'dine_in',
                        }, 'fulfillment_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceDineInLabel}
                      </button>
                    )}
                    {!item.freeTextAllowed && (
                      <button
                        type="button"
                        onClick={allowFreeTextForLatestChoice}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceOtherLabel}
                      </button>
                    )}
                  </div>
                )}

                {item.sender === 'ai'
                  && shouldShareLocation && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={sendCurrentLocation}
                      disabled={isPending || isSendingLocation || !isLatestInteractiveMessage}
                      className="
                        inline-flex items-center gap-2 rounded-lg border
                        border-primary/20 bg-background/90 px-3 py-2 text-xs
                        font-semibold text-primary transition
                        hover:bg-accent/70
                        disabled:cursor-not-allowed disabled:opacity-60
                      "
                    >
                      <MapPin className="size-3.5" />
                      {props.locationLabel}
                    </button>
                  </div>
                )}

                {item.sender === 'ai'
                  && shouldChoosePayment && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getAvailableWebOrderPaymentKinds(
                      props.availablePaymentKinds,
                      item.customerDetails,
                    ).includes('cash') && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({
                          paymentPreference: getWebOrderPaymentPreferenceForChoice(
                            item.customerDetails,
                            'cash',
                          ),
                        }, 'payment_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceCashLabel}
                      </button>
                    )}
                    {getAvailableWebOrderPaymentKinds(
                      props.availablePaymentKinds,
                      item.customerDetails,
                    ).includes('card') && (
                      <button
                        type="button"
                        onClick={() => submitSystemAction({
                          paymentPreference: getWebOrderPaymentPreferenceForChoice(
                            item.customerDetails,
                            'card',
                          ),
                        }, 'payment_selected')}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceCardLabel}
                      </button>
                    )}
                    {!item.freeTextAllowed && (
                      <button
                        type="button"
                        onClick={allowFreeTextForLatestChoice}
                        disabled={isPending || !isLatestInteractiveMessage}
                        className="
                          rounded-lg border border-primary/20 bg-background/90
                          px-3 py-2 text-xs font-semibold text-primary
                          transition
                          hover:bg-accent/70
                          disabled:cursor-not-allowed disabled:opacity-60
                        "
                      >
                        {props.choiceOtherLabel}
                      </button>
                    )}
                  </div>
                )}

                {item.sender === 'ai'
                  && shouldConfirmOrder && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={allowFreeTextForLatestChoice}
                      disabled={isPending || !isLatestInteractiveMessage}
                      className="
                        rounded-lg border border-primary/15 bg-background/90
                        px-3 py-2 text-xs font-semibold text-primary transition
                        hover:bg-accent/70
                        disabled:cursor-not-allowed disabled:opacity-60
                      "
                    >
                      {props.cartAddOrderLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitSystemAction({ customerConfirmedOrder: true }, 'order_confirmed')}
                      disabled={isPending || !isLatestInteractiveMessage}
                      className="
                        rounded-lg border border-primary/20 bg-background/90
                        px-3 py-2 text-xs font-semibold text-primary transition
                        hover:bg-accent/70
                        disabled:cursor-not-allowed disabled:opacity-60
                      "
                    >
                      {props.choiceConfirmSendLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitSystemAction({ customerCancelledOrder: true }, 'order_cancelled')}
                      disabled={isPending || !isLatestInteractiveMessage}
                      className="
                        rounded-lg border border-red-200 bg-background/90 px-3
                        py-2 text-xs font-semibold text-red-700 transition
                        hover:bg-red-50
                        disabled:cursor-not-allowed disabled:opacity-60
                      "
                    >
                      {props.choiceConfirmCancelLabel}
                    </button>
                  </div>
                )}
              </div>
              {item.sender === 'customer' && (
                <div className="
                  flex size-9 shrink-0 items-center justify-center rounded-lg
                  bg-primary text-primary-foreground
                "
                >
                  <UserRound className="size-4" />
                </div>
              )}
            </div>
          );
        })}

        {isPending && (
          <div className="flex gap-3">
            <AssistantAvatar
              agentLabel={props.agentLabel}
              storeLogoUrl={props.storeLogoUrl}
              storeName={props.storeName}
            />
            <div className="
              rounded-xl bg-accent/70 px-4 py-3 text-sm text-slate-600
            "
            >
              ...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-primary/10 p-4">
        <label htmlFor="web-chat-message" className="sr-only">
          {props.inputLabel}
        </label>
        <div className="flex gap-2">
          {!isTableOrder && (
            <button
              type="button"
              onClick={sendCurrentLocation}
              disabled={!threadId || isPending || isSendingLocation || !canUseGlobalLocationButton}
              aria-label={props.locationLabel}
              title={props.locationLabel}
              className="
                flex size-11 shrink-0 items-center justify-center rounded-lg
                border border-primary/15 bg-background/90 text-primary
                transition
                hover:border-primary/40 hover:bg-accent/70 hover:text-primary
                disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              <MapPin className="size-4" />
            </button>
          )}
          <textarea
            ref={inputRef}
            id="web-chat-message"
            autoComplete="off"
            value={message}
            rows={1}
            disabled={isPending || mustChooseFromOptions}
            onChange={event => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitMessage();
              }
            }}
            placeholder={mustChooseFromOptions ? props.choiceRequiredPlaceholder : props.inputPlaceholder}
            className="
              max-h-28 min-h-11 flex-1 resize-none rounded-lg border
              border-primary/15 bg-background/90 px-3 py-2 text-sm transition
              outline-none
              focus:border-primary
              disabled:cursor-not-allowed disabled:bg-accent/60
              disabled:text-slate-400
            "
          />
          <button
            type="button"
            onClick={() => submitMessage()}
            disabled={!threadId || isPending || mustChooseFromOptions || !message.trim()}
            aria-label={props.sendLabel}
            className="
              flex size-11 shrink-0 items-center justify-center rounded-lg
              bg-primary text-primary-foreground transition
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

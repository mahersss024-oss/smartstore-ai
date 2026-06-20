import { and, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import {
  assertCanTransitionOrderStatus,
  ORDER_EVENT_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/libs/OrderWorkflow';
import { fetchMoyasarInvoice, isMoyasarConfigured } from '@/libs/payments/Moyasar';
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from '@/libs/RequestBody';
import { invoicesTable, orderEventsTable, ordersTable } from '@/models/Schema';

const CUSTOMER_ONLINE_PAYMENTS_ENABLED = false;
const MAX_CALLBACK_BODY_BYTES = 64 * 1024;

const readCallbackPayload = async (request: Request) => {
  const contentType = request.headers.get('content-type') ?? '';
  const rawBody = await readRequestTextWithLimit(
    request,
    MAX_CALLBACK_BODY_BYTES,
  );

  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody) as Record<string, unknown>;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  throw new TypeError('Unsupported callback content type');
};

export const POST = async (request: Request) => {
  if (!CUSTOMER_ONLINE_PAYMENTS_ENABLED) {
    return NextResponse.json(
      { error: 'Customer online payments are not active yet' },
      { status: 503 },
    );
  }

  if (!isMoyasarConfigured()) {
    return NextResponse.json(
      { error: 'Moyasar is not configured' },
      { status: 503 },
    );
  }

  let payload: Record<string, unknown>;

  try {
    payload = await readCallbackPayload(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: 'Callback payload is too large' },
        { status: 413 },
      );
    }

    return NextResponse.json(
      { error: 'Invalid callback payload' },
      { status: 400 },
    );
  }

  const invoiceId = String(payload.id ?? '').trim();

  if (!invoiceId) {
    return NextResponse.json(
      { error: 'Missing Moyasar invoice id' },
      { status: 400 },
    );
  }

  const invoice = await fetchMoyasarInvoice(invoiceId);
  const orderId = Number(invoice.metadata?.orderId);
  const organizationId = invoice.metadata?.organizationId;

  if (!Number.isInteger(orderId) || !organizationId) {
    return NextResponse.json(
      { error: 'Missing invoice metadata' },
      { status: 400 },
    );
  }

  if (invoice.status === 'paid') {
    const [order] = await db
      .select({
        paymentStatus: ordersTable.paymentStatus,
        status: ordersTable.status,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          isNull(ordersTable.archivedAt),
        ),
      )
      .limit(1);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 },
      );
    }

    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      return NextResponse.json({ received: true });
    }

    if (order.status !== ORDER_STATUS.CONFIRMED) {
      assertCanTransitionOrderStatus(order.status, ORDER_STATUS.CONFIRMED);
    }

    await db.transaction(async (tx) => {
      const claimedOrder = await tx
        .update(ordersTable)
        .set({
          paymentStatus: PAYMENT_STATUS.PAID,
          status: ORDER_STATUS.CONFIRMED,
        })
        .where(
          and(
            eq(ordersTable.id, orderId),
            eq(ordersTable.organizationId, organizationId),
            eq(ordersTable.status, order.status),
            eq(ordersTable.paymentStatus, order.paymentStatus),
          ),
        )
        .returning({ id: ordersTable.id });

      if (!claimedOrder[0]) {
        return;
      }

      await tx
        .update(invoicesTable)
        .set({
          paidAt: sql`localtimestamp`,
          paymentStatus: PAYMENT_STATUS.PAID,
          status: 'paid',
        })
        .where(
          and(
            eq(invoicesTable.orderId, orderId),
            eq(invoicesTable.organizationId, organizationId),
          ),
        );

      await tx.insert(orderEventsTable).values({
        actorType: 'payment_provider',
        eventType: order.status === ORDER_STATUS.CONFIRMED
          ? ORDER_EVENT_TYPE.ORDER_UPDATED
          : ORDER_EVENT_TYPE.STATUS_CHANGED,
        fromStatus: order.status,
        metadata: {
          moyasarInvoiceId: invoiceId,
          paymentStatus: PAYMENT_STATUS.PAID,
        },
        orderId,
        organizationId,
        summary: 'Payment received and order confirmed.',
        toStatus: ORDER_STATUS.CONFIRMED,
      });
    });
  }

  return NextResponse.json({ received: true });
};

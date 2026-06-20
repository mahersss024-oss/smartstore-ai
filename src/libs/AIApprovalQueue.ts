const AI_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
const AI_APPROVAL_TYPES = ['product_drafts'] as const;

type AIApprovalStatus = typeof AI_APPROVAL_STATUSES[number];
export type AIApprovalType = typeof AI_APPROVAL_TYPES[number];

export type AIApprovalRequest = {
  approvedAt?: string;
  createdAt: string;
  id: string;
  payload: unknown;
  status: AIApprovalStatus;
  summary: string;
  title: string;
  type: AIApprovalType;
};

export type AIApprovalQueue = {
  items: AIApprovalRequest[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const isApprovalStatus = (value: unknown): value is AIApprovalStatus => {
  return typeof value === 'string'
    && AI_APPROVAL_STATUSES.includes(value as AIApprovalStatus);
};

const isApprovalType = (value: unknown): value is AIApprovalType => {
  return typeof value === 'string'
    && AI_APPROVAL_TYPES.includes(value as AIApprovalType);
};

export const normalizeAIApprovalQueue = (input: unknown): AIApprovalQueue => {
  if (!isRecord(input) || !Array.isArray(input.items)) {
    return { items: [] };
  }

  const items: AIApprovalRequest[] = [];

  for (const item of input.items) {
    if (!isRecord(item)) {
      continue;
    }

    if (
      typeof item.id !== 'string'
      || typeof item.createdAt !== 'string'
      || typeof item.title !== 'string'
      || typeof item.summary !== 'string'
      || !isApprovalStatus(item.status)
      || !isApprovalType(item.type)
    ) {
      continue;
    }

    items.push({
      approvedAt: typeof item.approvedAt === 'string' ? item.approvedAt : undefined,
      createdAt: item.createdAt,
      id: item.id,
      payload: item.payload,
      status: item.status,
      summary: item.summary,
      title: item.title,
      type: item.type,
    });
  }

  return {
    items: items.slice(0, 50),
  };
};

export const createAIApprovalRequest = (params: {
  createdAt: string;
  id: string;
  payload: unknown;
  summary: string;
  title: string;
  type: AIApprovalType;
}): AIApprovalRequest => {
  return {
    createdAt: params.createdAt,
    id: params.id,
    payload: params.payload,
    status: 'pending',
    summary: params.summary,
    title: params.title,
    type: params.type,
  };
};

export const approveLatestPendingApproval = (
  queue: AIApprovalQueue,
  type: AIApprovalType,
  approvedAt: string,
): AIApprovalQueue => {
  let approved = false;

  return {
    items: queue.items.map((item) => {
      if (!approved && item.type === type && item.status === 'pending') {
        approved = true;

        return {
          ...item,
          approvedAt,
          status: 'approved',
        };
      }

      return item;
    }),
  };
};

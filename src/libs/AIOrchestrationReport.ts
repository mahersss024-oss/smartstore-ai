import type { AIOrchestrationQuality } from './AIOrchestrationDiagnostics';

export type AIOrchestrationReportRecord = {
  conversationId?: null | number;
  createdAt?: Date | string;
  id: number;
  organizationId?: string;
  trace?: {
    issues?: string[];
    quality?: AIOrchestrationQuality;
    systemDecisionReasons?: string[];
  } | null;
};

export type AIOrchestrationReport = {
  averageScore: number | null;
  issueCounts: Array<{ count: number; key: string }>;
  levelCounts: Record<AIOrchestrationQuality['level'], number>;
  penaltyCounts: Array<{ count: number; key: string }>;
  reasonCounts: Array<{ count: number; key: string }>;
  recordCount: number;
  scoredRecordCount: number;
  weakestRecords: Array<{
    conversationId?: null | number;
    createdAt?: Date | string;
    id: number;
    issues: string[];
    penalties: string[];
    score: number;
  }>;
};

const emptyLevelCounts = (): Record<AIOrchestrationQuality['level'], number> => ({
  critical: 0,
  excellent: 0,
  healthy: 0,
  warning: 0,
});

const increment = (counts: Map<string, number>, key: string) => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const toSortedCounts = (counts: Map<string, number>) => {
  return Array.from(counts.entries())
    .map(([key, count]) => ({ count, key }))
    .sort((left, right) => {
      return right.count - left.count || left.key.localeCompare(right.key);
    });
};

export const buildAIOrchestrationReport = (
  records: AIOrchestrationReportRecord[],
): AIOrchestrationReport => {
  const issueCounts = new Map<string, number>();
  const penaltyCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  const levelCounts = emptyLevelCounts();
  const weakestRecords: AIOrchestrationReport['weakestRecords'] = [];
  let scoredRecordCount = 0;
  let scoreTotal = 0;

  for (const record of records) {
    const trace = record.trace;

    for (const issue of trace?.issues ?? []) {
      increment(issueCounts, issue);
    }

    for (const reason of trace?.systemDecisionReasons ?? []) {
      increment(reasonCounts, reason);
    }

    const quality = trace?.quality;

    if (!quality) {
      continue;
    }

    scoredRecordCount += 1;
    scoreTotal += quality.score;
    levelCounts[quality.level] += 1;

    for (const penalty of quality.penalties) {
      increment(penaltyCounts, penalty);
    }

    weakestRecords.push({
      conversationId: record.conversationId,
      createdAt: record.createdAt,
      id: record.id,
      issues: trace?.issues ?? [],
      penalties: quality.penalties,
      score: quality.score,
    });
  }

  weakestRecords.sort((left, right) => {
    return left.score - right.score || right.id - left.id;
  });

  return {
    averageScore: scoredRecordCount > 0
      ? Number((scoreTotal / scoredRecordCount).toFixed(2))
      : null,
    issueCounts: toSortedCounts(issueCounts),
    levelCounts,
    penaltyCounts: toSortedCounts(penaltyCounts),
    reasonCounts: toSortedCounts(reasonCounts),
    recordCount: records.length,
    scoredRecordCount,
    weakestRecords: weakestRecords.slice(0, 10),
  };
};

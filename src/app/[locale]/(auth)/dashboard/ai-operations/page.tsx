import { auth } from '@clerk/nextjs/server';
import { count, eq } from 'drizzle-orm';
import {
  Bot,
  CheckCircle2,
  CircleDotDashed,
  ClipboardCheck,
  MessageSquareText,
  PlayCircle,
  PlugZap,
  RadioTower,
  Sparkles,
  Star,
  Workflow,
  Zap,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';
import { saveAIEmployeeSettings } from '@/features/dashboard/AIEmployeeSettingsActions';
import {
  approveAIProductDrafts,
  generateAIProductDrafts,
} from '@/features/dashboard/AISetupAssistantActions';
import { runAIEmployeeSimulation } from '@/features/dashboard/AISimulationActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import {
  AI_HANDOFF_KEYS,
  AI_PERMISSION_KEYS,
  AI_SALES_STYLES,
  AI_TARGET_COUNTRIES,
  AI_TONES,
  normalizeAIEmployeeSettings,
} from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import {
  SUPPORTED_AI_DIALECTS,
  SUPPORTED_AI_LANGUAGES,
} from '@/libs/PlatformAIPolicy';
import { hasConfiguredValue } from '@/libs/StoreReadiness';
import {
  conversationsTable,
  customerReviewsTable,
  storeSettingsTable,
} from '@/models/Schema';

type StoreSettingsMetadata = {
  aiApprovalQueue?: {
    items?: {
      createdAt: string;
      id: string;
      status: 'approved' | 'pending' | 'rejected';
      summary: string;
      title: string;
      type: 'product_drafts';
    }[];
  };
  aiEmployee?: unknown;
  aiSetupAssistant?: {
    productDrafts?: {
      category?: string;
      description?: string;
      image?: string;
      name: string;
      price: number;
      tags?: string[];
    }[];
  };
  aiSimulation?: {
    lastResult?: {
      createdAt: string;
      message: string;
      missingDetails: string[];
      recommendedProducts: {
        category: null | string;
        id: number;
        image: null | string;
        name: string;
        price: string;
      }[];
      reply: string;
    };
  };
  contactChannels?: Record<string, unknown>;
};

const normalizeProductDrafts = (value: StoreSettingsMetadata['aiSetupAssistant']) => {
  return Array.isArray(value?.productDrafts)
    ? value.productDrafts.filter((draft) => {
        return draft
          && typeof draft.name === 'string'
          && typeof draft.price === 'number';
      })
    : [];
};

const normalizePendingApprovals = (value: StoreSettingsMetadata['aiApprovalQueue']) => {
  return Array.isArray(value?.items)
    ? value.items.filter((item) => {
        return item
          && item.status === 'pending'
          && typeof item.id === 'string'
          && typeof item.title === 'string';
      })
    : [];
};

const normalizeLastSimulation = (value: StoreSettingsMetadata['aiSimulation']) => {
  const result = value?.lastResult;

  if (
    !result
    || typeof result.message !== 'string'
    || typeof result.reply !== 'string'
    || !Array.isArray(result.recommendedProducts)
  ) {
    return undefined;
  }

  return {
    ...result,
    recommendedProducts: result.recommendedProducts.filter((product) => {
      return product
        && typeof product.id === 'number'
        && typeof product.name === 'string'
        && typeof product.price === 'string';
    }),
  };
};

export default async function AIOperationsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    aiSettingsError?: string;
    simulation?: string;
    setupAssistant?: string;
  }>;
}) {
  const { locale } = await props.params;
  const { aiSettingsError, setupAssistant, simulation } = await props.searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'AIOperationsPage',
  });
  const { orgId } = await auth();
  const [conversationStats] = orgId
    ? await db
        .select({ total: count(conversationsTable.id) })
        .from(conversationsTable)
        .where(eq(conversationsTable.organizationId, orgId))
    : [{ total: 0 }];
  const [reviewStats] = orgId
    ? await db
        .select({ total: count(customerReviewsTable.id) })
        .from(customerReviewsTable)
        .where(eq(customerReviewsTable.organizationId, orgId))
    : [{ total: 0 }];
  const [storeSettings] = orgId
    ? await db
        .select({ metadata: storeSettingsTable.metadata })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1)
    : [];
  const metadata = storeSettings?.metadata as StoreSettingsMetadata | null;
  const contactChannels = metadata?.contactChannels ?? {};
  const aiSettings = normalizeAIEmployeeSettings(metadata?.aiEmployee);
  const productDrafts = normalizeProductDrafts(metadata?.aiSetupAssistant);
  const pendingApprovals = normalizePendingApprovals(metadata?.aiApprovalQueue);
  const lastSimulation = normalizeLastSimulation(metadata?.aiSimulation);
  const channelTemplates = [
    {
      isActive: true,
      label: t('channel_web'),
    },
    {
      isActive: Boolean(orgId),
      label: t('channel_smart_link'),
    },
    {
      isActive: hasConfiguredValue(contactChannels.whatsapp),
      label: 'WhatsApp',
    },
  ];
  const agentSteps = [
    t('agent_step_receive'),
    t('agent_step_analyze'),
    t('agent_step_create_order'),
    t('agent_step_follow_up'),
    t('agent_step_review'),
  ];
  const activeChannelsCount = channelTemplates.filter(channel => channel.isActive).length;
  const readinessPercent = Math.round((activeChannelsCount / channelTemplates.length) * 100);

  return (
    <>
      <TitleBar title={t('title_bar')} description={t('title_bar_description')} />

      {setupAssistant && (
        <div className="
          mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {t('setup_assistant_error_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {setupAssistant === 'limit'
              ? t('setup_assistant_error_limit')
              : setupAssistant === 'invalid'
                ? t('setup_assistant_error_invalid')
                : setupAssistant === 'duplicate'
                  ? t('setup_assistant_error_duplicate')
                  : t('setup_assistant_error_empty')}
          </p>
        </div>
      )}

      {aiSettingsError === 'readiness' && (
        <div className="
          mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {t('readiness_error_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t('readiness_error_description')}
          </p>
        </div>
      )}

      {simulation === 'empty' && (
        <div className="
          mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {t('simulation_error_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t('simulation_error_empty')}
          </p>
        </div>
      )}

      <form
        action={saveAIEmployeeSettings.bind(null, locale)}
        className="mb-6 dashboard-panel rounded-xl border p-6"
      >
        <div className="
          flex flex-col gap-4
          lg:flex-row lg:items-start lg:justify-between
        "
        >
          <div>
            <h2 className="text-xl font-bold">{t('settings_title')}</h2>
            <p className="mt-2 max-w-3xl text-sm/6 text-muted-foreground">
              {t('settings_description')}
            </p>
          </div>

          <label className="
            inline-flex w-fit dashboard-surface items-center gap-3 rounded-lg
            border px-4 py-3 text-sm font-semibold
          "
          >
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={aiSettings.enabled}
            />
            {t('ai_enabled')}
          </label>
        </div>

        <div className="
          mt-6 grid gap-4
          md:grid-cols-2
          xl:grid-cols-3
        "
        >
          <label className="grid gap-2 text-sm font-medium">
            {t('display_name')}
            <input
              name="displayName"
              autoComplete="name"
              defaultValue={aiSettings.displayName}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('target_country')}
            <select
              name="targetCountry"
              defaultValue={aiSettings.targetCountry}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {AI_TARGET_COUNTRIES.map(country => (
                <option key={country} value={country}>
                  {t(`country_${country}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('language')}
            <select
              name="language"
              defaultValue={aiSettings.language}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {SUPPORTED_AI_LANGUAGES.map(language => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('dialect')}
            <select
              name="dialect"
              defaultValue={aiSettings.dialect}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {SUPPORTED_AI_DIALECTS.map(dialect => (
                <option key={dialect.id} value={dialect.id}>
                  {dialect.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('fallback_language')}
            <select
              name="fallbackLanguage"
              defaultValue={aiSettings.fallbackLanguage}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {SUPPORTED_AI_LANGUAGES.map(language => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('tone')}
            <select
              name="tone"
              defaultValue={aiSettings.tone}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {AI_TONES.map(tone => (
                <option key={tone} value={tone}>
                  {t(`tone_${tone}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {t('sales_style')}
            <select
              name="salesStyle"
              defaultValue={aiSettings.salesStyle}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {AI_SALES_STYLES.map(style => (
                <option key={style} value={style}>
                  {t(`sales_${style}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 grid gap-2 text-sm font-medium">
          {t('ai_welcome_message')}
          <textarea
            name="welcomeMessage"
            autoComplete="off"
            rows={3}
            defaultValue={aiSettings.welcomeMessage}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
        </label>

        <div className="
          mt-6 grid gap-4
          lg:grid-cols-3
        "
        >
          <section className="dashboard-surface rounded-xl border p-4">
            <h3 className="font-semibold">{t('permissions_title')}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              {AI_PERMISSION_KEYS.map(permission => (
                <label key={permission} className="flex items-center gap-2">
                  <input
                    name={`permission_${permission}`}
                    type="checkbox"
                    defaultChecked={aiSettings.permissions[permission]}
                  />
                  {t(`permission_${permission}`)}
                </label>
              ))}
            </div>
          </section>

          <section className="dashboard-surface rounded-xl border p-4">
            <h3 className="font-semibold">{t('handoff_title')}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              {AI_HANDOFF_KEYS.map(rule => (
                <label key={rule} className="flex items-center gap-2">
                  <input
                    name={`handoff_${rule}`}
                    type="checkbox"
                    defaultChecked={aiSettings.handoffRules[rule]}
                  />
                  {t(`handoff_${rule}`)}
                </label>
              ))}
            </div>
          </section>

          <section className="dashboard-surface rounded-xl border p-4">
            <h3 className="font-semibold">{t('approval_title')}</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  name="approvalRequiredForSetupChanges"
                  type="checkbox"
                  defaultChecked={aiSettings.approvalRequiredForSetupChanges}
                />
                {t('approval_setup')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  name="approvalRequiredForCatalogChanges"
                  type="checkbox"
                  defaultChecked={aiSettings.approvalRequiredForCatalogChanges}
                />
                {t('approval_catalog')}
              </label>
              <p className="mt-2 text-xs/5 text-muted-foreground">
                {t('approval_note')}
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <PendingSubmitButton
            className="
              rounded-lg bg-primary px-4 py-2 text-sm font-semibold
              text-primary-foreground transition-opacity
              hover:opacity-90
              disabled:cursor-wait disabled:opacity-65
            "
          >
            {t('save_ai_settings')}
          </PendingSubmitButton>
        </div>
      </form>

      <section className="
        mb-6 grid gap-4
        xl:grid-cols-[1fr_0.9fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{t('simulation_title')}</h2>
              <p className="mt-2 max-w-2xl text-sm/6 text-muted-foreground">
                {t('simulation_description')}
              </p>
            </div>
            <PlayCircle className="size-5 text-muted-foreground" />
          </div>

          <form
            action={runAIEmployeeSimulation.bind(null, locale)}
            className="mt-5 grid gap-3"
          >
            <label className="grid gap-2 text-sm font-medium">
              {t('simulation_message')}
              <textarea
                name="simulationMessage"
                rows={5}
                placeholder={t('simulation_placeholder')}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <div>
              <PendingSubmitButton
                className="
                  dashboard-pill rounded-lg border px-4 py-2 text-sm
                  font-semibold transition-colors
                  hover:bg-accent
                  disabled:cursor-wait disabled:opacity-65
                "
              >
                {t('simulation_run')}
              </PendingSubmitButton>
            </div>
          </form>
        </div>

        <div className="dashboard-panel rounded-xl border p-6">
          <h3 className="font-semibold">{t('simulation_result')}</h3>
          {lastSimulation
            ? (
                <div className="mt-4 grid gap-4">
                  <div className="dashboard-surface rounded-xl border p-4">
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t('simulation_customer_message')}
                    </div>
                    <p className="mt-2 text-sm">{lastSimulation.message}</p>
                  </div>
                  <div className="dashboard-surface rounded-xl border p-4">
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t('simulation_ai_reply')}
                    </div>
                    <p className="mt-2 text-sm/6">{lastSimulation.reply}</p>
                  </div>
                  {lastSimulation.recommendedProducts.length > 0 && (
                    <div className="grid gap-2">
                      <div className="
                        text-xs font-semibold text-muted-foreground
                      "
                      >
                        {t('simulation_products')}
                      </div>
                      {lastSimulation.recommendedProducts.map(product => (
                        <div
                          key={product.id}
                          className="
                            flex items-center justify-between gap-3 rounded-lg
                            border bg-background/60 px-3 py-2 text-sm
                          "
                        >
                          <span className="font-medium">{product.name}</span>
                          <span className="text-muted-foreground">{product.price}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            : (
                <p className="mt-3 text-sm/6 text-muted-foreground">
                  {t('simulation_empty')}
                </p>
              )}
        </div>
      </section>

      <section className="mb-6 dashboard-panel rounded-xl border p-6">
        <div className="
          flex flex-col gap-4
          lg:flex-row lg:items-start lg:justify-between
        "
        >
          <div>
            <h2 className="text-xl font-bold">{t('setup_assistant_title')}</h2>
            <p className="mt-2 max-w-3xl text-sm/6 text-muted-foreground">
              {t('setup_assistant_description')}
            </p>
          </div>
        </div>

        <form
          action={generateAIProductDrafts.bind(null, locale)}
          className="mt-5 grid gap-3"
        >
          <label className="grid gap-2 text-sm font-medium">
            {t('setup_assistant_products_input')}
            <textarea
              name="productDraftInput"
              rows={6}
              placeholder={t('setup_assistant_products_placeholder')}
              className="
                dashboard-pill rounded-lg border px-3 py-2 font-mono text-sm
              "
            />
          </label>

          <div>
            <PendingSubmitButton
              className="
                dashboard-pill rounded-lg border px-4 py-2 text-sm font-semibold
                transition-colors
                hover:bg-accent
                disabled:cursor-wait disabled:opacity-65
              "
            >
              {t('setup_assistant_generate')}
            </PendingSubmitButton>
          </div>
        </form>

        {productDrafts.length > 0 && (
          <div className="mt-6 dashboard-surface rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" />
                <h3 className="font-semibold">{t('approval_queue_title')}</h3>
              </div>
              <form action={approveAIProductDrafts.bind(null, locale)}>
                <PendingSubmitButton
                  className="
                    rounded-lg bg-primary px-4 py-2 text-sm font-semibold
                    text-primary-foreground transition-opacity
                    hover:opacity-90
                    disabled:cursor-wait disabled:opacity-65
                  "
                >
                  {t('setup_assistant_approve')}
                </PendingSubmitButton>
              </form>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('approval_queue_pending', {
                count: pendingApprovals.length,
              })}
            </p>

            <div className="mt-4 grid gap-3">
              {productDrafts.map(draft => (
                <article
                  key={`${draft.name}-${draft.price}`}
                  className="rounded-lg border bg-background/60 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">{draft.name}</div>
                    <span className="rounded-full border px-2.5 py-1 text-xs">
                      {draft.price}
                    </span>
                    {draft.category && (
                      <span className="rounded-full border px-2.5 py-1 text-xs">
                        {draft.category}
                      </span>
                    )}
                  </div>
                  {draft.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {draft.description}
                    </p>
                  )}
                  {draft.tags && draft.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.tags.map(tag => (
                        <span
                          key={tag}
                          className="
                            rounded-full border px-2.5 py-1 text-xs
                            text-muted-foreground
                          "
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-panel rounded-xl border p-6">
        <div className="
          grid gap-4
          md:grid-cols-3
        "
        >
          <div className="dashboard-surface rounded-xl border p-5">
            <div className="
              mb-4 flex size-10 items-center justify-center rounded-md
              bg-primary/10
            "
            >
              <MessageSquareText className="size-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">{conversationStats?.total ?? 0}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t('conversations')}</div>
          </div>

          <div className="dashboard-surface rounded-xl border p-5">
            <div className="
              mb-4 flex size-10 items-center justify-center rounded-md
              bg-primary/10
            "
            >
              <Star className="size-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">{reviewStats?.total ?? 0}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t('reviews')}</div>
          </div>

          <div className="dashboard-surface rounded-xl border p-5">
            <div className="
              mb-4 flex size-10 items-center justify-center rounded-md
              bg-primary/10
            "
            >
              <PlugZap className="size-5 text-primary" />
            </div>
            <div className="text-3xl font-bold">
              {activeChannelsCount}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{t('active_channels')}</div>
          </div>
        </div>
      </section>

      <section className="
        mt-6 grid gap-4
        lg:grid-cols-[1.1fr_0.9fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{t('channels_title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('channels_description')}</p>
            </div>
            <PlugZap className="size-5 text-muted-foreground" />
          </div>

          <div className="mt-5 grid gap-3">
            {channelTemplates.map(template => (
              <div
                key={template.label}
                className="
                  flex dashboard-surface items-center justify-between rounded-xl
                  border px-4 py-3
                "
              >
                <div>
                  <div className="text-sm font-semibold">{template.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {template.isActive ? t('connected') : t('not_connected')}
                  </div>
                </div>
                <span
                  className={
                    template.isActive
                      ? 'size-2.5 rounded-full bg-emerald-500'
                      : 'size-2.5 rounded-full bg-muted-foreground/30'
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="
          relative dashboard-panel overflow-hidden rounded-xl border p-6
        "
        >
          <div className="
            pointer-events-none absolute inset-0 bg-linear-to-br
            from-cyan-500/10 via-transparent to-emerald-500/10
          "
          />
          <div className="
            pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r
            from-transparent via-primary/45 to-transparent
          "
          />

          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="
                  mb-3 inline-flex items-center gap-2 rounded-full border
                  border-primary/20 bg-background/70 px-3 py-1 text-xs
                  font-semibold text-primary shadow-sm backdrop-blur-sm
                "
                >
                  <Sparkles className="size-3.5 text-cyan-500" />
                  {t('agent_visual_badge')}
                </div>
                <h3 className="text-lg font-semibold">{t('agent_title')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('agent_description')}</p>
              </div>
              <div className="
                flex size-11 dashboard-surface shrink-0 items-center
                justify-center rounded-full border
              "
              >
                <Bot className="size-5 text-primary" />
              </div>
            </div>

            <div className="
              mt-6 grid gap-3
              sm:grid-cols-3
            "
            >
              <div className="dashboard-surface rounded-xl border p-4">
                <RadioTower className="mb-3 size-4 text-cyan-600" />
                <div className="text-2xl font-bold">
                  {activeChannelsCount}
                  /
                  {channelTemplates.length}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t('active_channels')}</div>
              </div>
              <div className="dashboard-surface rounded-xl border p-4">
                <MessageSquareText className="mb-3 size-4 text-blue-600" />
                <div className="text-2xl font-bold">{conversationStats?.total ?? 0}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('conversations')}</div>
              </div>
              <div className="dashboard-surface rounded-xl border p-4">
                <Zap className="mb-3 size-4 text-emerald-600" />
                <div className="text-2xl font-bold">
                  {readinessPercent}
                  %
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t('readiness')}</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">{t('agent_path')}</span>
                <span className="text-muted-foreground">
                  {agentSteps.length}
                  {' '}
                  {t('steps')}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="
                    h-full rounded-full bg-linear-to-r from-cyan-500
                    via-blue-500 to-emerald-500
                  "
                  style={{ width: `${Math.max(readinessPercent, 12)}%` }}
                />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {agentSteps.map((step, index) => (
                <div
                  key={step}
                  className="
                    group flex dashboard-surface items-center gap-3 rounded-xl
                    border px-4 py-3 transition-all duration-200
                    hover:-translate-y-0.5 hover:border-primary/35
                  "
                >
                  <div className="
                    flex size-9 shrink-0 items-center justify-center
                    rounded-full bg-primary text-xs font-bold
                    text-primary-foreground shadow-sm shadow-primary/20
                  "
                  >
                    0
                    {index + 1}
                  </div>
                  <span className="text-sm font-medium">{step}</span>
                  {index < activeChannelsCount
                    ? (
                        <CheckCircle2 className="
                          ml-auto size-4 text-emerald-600
                          rtl:mr-auto rtl:ml-0
                        "
                        />
                      )
                    : (
                        <CircleDotDashed className="
                          ml-auto size-4 text-muted-foreground
                          rtl:mr-auto rtl:ml-0
                        "
                        />
                      )}
                </div>
              ))}
            </div>

            <div className="
              mt-6 rounded-xl border bg-background/65 p-4 shadow-sm
              backdrop-blur-sm
            "
            >
              <div className="
                mb-2 flex items-center gap-2 text-sm font-semibold
              "
              >
                <Workflow className="size-4" />
                {t('next_step_title')}
              </div>
              <p className="text-sm/6 text-muted-foreground">{t('next_step_description')}</p>
            </div>
          </div>
        </div>

      </section>
    </>
  );
}

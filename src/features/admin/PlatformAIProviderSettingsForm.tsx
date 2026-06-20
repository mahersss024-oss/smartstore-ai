'use client';

import { useMemo, useState } from 'react';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';

type AIProviderId = 'deepseek' | 'openai' | 'openai_compatible';

type PlatformAIProviderSettingsFormProps = {
  action: (formData: FormData) => Promise<void>;
  apiKeyPreview?: string;
  baseUrl?: string;
  canManageService: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  labels: {
    activation: string;
    apiBaseUrl: string;
    apiKeyHint: string;
    apiKey: string;
    clearApiKey: string;
    enableModel: string;
    model: string;
    provider: string;
    save: string;
    systemPrompt: string;
  };
  model: string;
  provider: AIProviderId;
  systemPrompt: string;
};

const providerDefaults: Record<AIProviderId, {
  baseUrl: string;
  model: string;
}> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  openai: {
    baseUrl: '',
    model: 'gpt-4.1-mini',
  },
  openai_compatible: {
    baseUrl: '',
    model: '',
  },
};

export const PlatformAIProviderSettingsForm = (
  props: PlatformAIProviderSettingsFormProps,
) => {
  const [provider, setProvider] = useState<AIProviderId>(props.provider);
  const [model, setModel] = useState(props.model);
  const [baseUrl, setBaseUrl] = useState(props.baseUrl ?? '');
  const baseUrlIsEditable = provider !== 'openai';
  const baseUrlPlaceholder = useMemo(() => {
    if (provider === 'deepseek') {
      return providerDefaults.deepseek.baseUrl;
    }

    if (provider === 'openai_compatible') {
      return 'https://api.example.com/v1';
    }

    return '';
  }, [provider]);

  const handleProviderChange = (nextProvider: AIProviderId) => {
    const defaults = providerDefaults[nextProvider];

    setProvider(nextProvider);
    setModel(defaults.model);
    setBaseUrl(defaults.baseUrl);
  };

  return (
    <form
      action={props.action}
      className="
        mt-5 grid dashboard-surface gap-4 rounded-xl border p-4
        lg:grid-cols-4
      "
    >
      <label className="grid gap-2 text-sm font-medium">
        {props.labels.provider}
        <select
          name="provider"
          value={provider}
          disabled={!props.canManageService}
          onChange={event => handleProviderChange(event.target.value as AIProviderId)}
          className="
            dashboard-pill rounded-lg border px-3 py-2 text-sm
            disabled:cursor-not-allowed disabled:opacity-55
          "
        >
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openai_compatible">OpenAI-compatible</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-medium">
        {props.labels.model}
        <input
          name="model"
          autoComplete="off"
          value={model}
          disabled={!props.canManageService}
          onChange={event => setModel(event.target.value)}
          className="
            dashboard-pill rounded-lg border px-3 py-2 text-sm
            disabled:cursor-not-allowed disabled:opacity-55
          "
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        {props.labels.apiBaseUrl}
        <input
          name="baseUrl"
          autoComplete="url"
          value={baseUrl}
          disabled={!props.canManageService || !baseUrlIsEditable}
          onChange={event => setBaseUrl(event.target.value)}
          placeholder={baseUrlPlaceholder}
          className="
            dashboard-pill rounded-lg border px-3 py-2 text-sm
            disabled:cursor-not-allowed disabled:opacity-55
          "
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        {props.labels.apiKey}
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={props.apiKeyPreview ?? 'sk-...'}
          disabled={!props.canManageService}
          className="
            dashboard-pill rounded-lg border px-3 py-2 text-sm
            disabled:cursor-not-allowed disabled:opacity-55
          "
        />
        <span className="text-xs text-muted-foreground">
          {props.apiKeyPreview
            ? props.labels.apiKeyHint.replace('{preview}', props.apiKeyPreview)
            : props.labels.apiKeyHint.replace('{preview}', 'sk-...')}
        </span>
      </label>

      <div className="grid gap-2 text-sm font-medium">
        {props.labels.activation}
        <div className="grid gap-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={props.enabled}
              disabled={!props.canManageService}
            />
            {props.labels.enableModel}
          </label>
          <label className="flex items-center gap-2">
            <input
              name="clearApiKey"
              type="checkbox"
              disabled={!props.canManageService || !props.hasApiKey}
            />
            {props.labels.clearApiKey}
          </label>
        </div>
      </div>

      <label className="
        grid gap-2 text-sm font-medium
        lg:col-span-4
      "
      >
        {props.labels.systemPrompt}
        <textarea
          name="systemPrompt"
          defaultValue={props.systemPrompt}
          rows={5}
          disabled={!props.canManageService}
          className="
            dashboard-pill rounded-lg border px-3 py-2 text-sm
            disabled:cursor-not-allowed disabled:opacity-55
          "
        />
      </label>

      <div className="flex items-end">
        <PendingSubmitButton
          disabled={!props.canManageService}
          className="
            w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold
            text-primary-foreground transition-opacity
            hover:opacity-90
            disabled:cursor-not-allowed disabled:opacity-55
          "
        >
          {props.labels.save}
        </PendingSubmitButton>
      </div>
    </form>
  );
};

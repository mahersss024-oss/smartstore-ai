import type { PlatformAIProviderConfig } from './PlatformAIProviderConfig';
import { logger } from './Logger';
import { assertSafeOutboundUrl, fetchWithTimeout } from './OutboundHttp';

type GeneratePlatformAITextParams = {
  input: string;
  instructions: string;
};

const extractOpenAIText = (payload: unknown) => {
  const response = payload as {
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
      type?: string;
    }>;
    output_text?: string;
  };

  if (typeof response.output_text === 'string') {
    return response.output_text.trim();
  }

  return response.output
    ?.flatMap(item => item.content ?? [])
    .map(item => item.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join('\n')
    .trim();
};

const extractChatCompletionText = (payload: unknown) => {
  const response = payload as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return response.choices?.[0]?.message?.content?.trim();
};

const getChatCompletionsBaseUrl = (config: PlatformAIProviderConfig) => {
  if (config.provider === 'deepseek') {
    return config.baseUrl ?? 'https://api.deepseek.com';
  }

  return config.baseUrl;
};

const readSafeResponseError = async (
  response: Response,
  apiKey?: string,
) => {
  try {
    const text = await response.text();
    const withoutConfiguredKey = apiKey
      ? text.split(apiKey).join('[REDACTED]')
      : text;

    return withoutConfiguredKey.replace(/sk-[\w-]+/g, 'sk-***').slice(0, 1000);
  } catch {
    return undefined;
  }
};

const logAIProviderFailure = async (
  config: PlatformAIProviderConfig,
  response: Response,
) => {
  logger.warn('Platform AI provider request failed', {
    baseUrl: config.provider === 'openai' ? 'https://api.openai.com' : config.baseUrl,
    error: await readSafeResponseError(response, config.apiKey),
    model: config.model,
    provider: config.provider,
    status: response.status,
    statusText: response.statusText,
  });
};

export const generatePlatformAIText = async (
  config: PlatformAIProviderConfig,
  params: GeneratePlatformAITextParams,
) => {
  if (!config.enabled || !config.apiKey) {
    return undefined;
  }

  const requestHeaders = new Headers();
  requestHeaders.set('Authorization', `Bearer ${config.apiKey}`);
  requestHeaders.set('Content-Type', 'application/json');

  if (config.provider === 'openai') {
    const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text: params.input,
                type: 'input_text',
              },
            ],
            role: 'user',
          },
        ],
        instructions: params.instructions,
        model: config.model,
      }),
      headers: requestHeaders,
      method: 'POST',
    });

    if (!response.ok) {
      await logAIProviderFailure(config, response);

      return undefined;
    }

    return extractOpenAIText(await response.json()) || undefined;
  }

  const baseUrl = getChatCompletionsBaseUrl(config);

  if (!baseUrl) {
    logger.warn('Platform AI provider base URL is missing', {
      model: config.model,
      provider: config.provider,
    });

    return undefined;
  }

  try {
    await assertSafeOutboundUrl(baseUrl, {
      allowLocalDevelopment: process.env.NODE_ENV !== 'production',
    });
  } catch (error) {
    logger.warn('Platform AI provider base URL was blocked', {
      error: error instanceof Error ? error.message : 'unsafe_outbound_url',
      model: config.model,
      provider: config.provider,
    });

    return undefined;
  }

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      messages: [
        {
          content: params.instructions,
          role: 'system',
        },
        {
          content: params.input,
          role: 'user',
        },
      ],
      model: config.model,
      stream: false,
    }),
    headers: requestHeaders,
    method: 'POST',
  });

  if (!response.ok) {
    await logAIProviderFailure(config, response);

    return undefined;
  }

  return extractChatCompletionText(await response.json()) || undefined;
};

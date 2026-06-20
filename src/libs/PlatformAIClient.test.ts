import type { PlatformAIProviderConfig } from './PlatformAIProviderConfig';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertSafeOutboundUrl,
  mockFetchWithTimeout,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockAssertSafeOutboundUrl: vi.fn(),
  mockFetchWithTimeout: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('./Logger', () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}));

vi.mock('./OutboundHttp', () => ({
  assertSafeOutboundUrl: mockAssertSafeOutboundUrl,
  fetchWithTimeout: mockFetchWithTimeout,
}));

const createConfig = (
  overrides: Partial<PlatformAIProviderConfig> = {},
): PlatformAIProviderConfig => ({
  apiKey: 'sk-provider-secret',
  enabled: true,
  model: 'gpt-4.1-mini',
  provider: 'openai',
  systemPrompt: 'Follow platform rules.',
  ...overrides,
});

describe('PlatformAIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertSafeOutboundUrl.mockResolvedValue(new URL('https://api.example.com'));
  });

  it('does not call a provider when the configuration is disabled', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');

    await expect(generatePlatformAIText(
      createConfig({ enabled: false }),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('extracts text from a successful OpenAI response', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      output_text: '  Safe response  ',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(generatePlatformAIText(
      createConfig(),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBe('Safe response');

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends platform instructions through the OpenAI Responses instructions field', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      output_text: 'Safe response',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await generatePlatformAIText(
      createConfig(),
      {
        input: 'Customer message',
        instructions: 'SYSTEM RULES: keep store state authoritative.',
      },
    );

    const [, init] = mockFetchWithTimeout.mock.calls[0]!;

    expect(JSON.parse(String(init.body))).toMatchObject({
      input: [
        {
          content: [
            {
              text: 'Customer message',
              type: 'input_text',
            },
          ],
          role: 'user',
        },
      ],
      instructions: 'SYSTEM RULES: keep store state authoritative.',
      model: 'gpt-4.1-mini',
    });
  });

  it('sends platform instructions as the system message for DeepSeek and compatible chat providers', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: 'Safe response',
          },
        },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await generatePlatformAIText(
      createConfig({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        provider: 'deepseek',
      }),
      {
        input: 'Customer message',
        instructions: 'SYSTEM RULES: keep store state authoritative.',
      },
    );

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );

    const [, init] = mockFetchWithTimeout.mock.calls[0]!;

    expect(JSON.parse(String(init.body))).toMatchObject({
      messages: [
        {
          content: 'SYSTEM RULES: keep store state authoritative.',
          role: 'system',
        },
        {
          content: 'Customer message',
          role: 'user',
        },
      ],
      model: 'deepseek-chat',
      stream: false,
    });
  });

  it('extracts text from OpenAI output array format when output_text is absent', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      output: [
        {
          content: [
            { text: 'First chunk', type: 'output_text' },
            { text: 'Second chunk', type: 'output_text' },
          ],
          type: 'message',
        },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(generatePlatformAIText(
      createConfig(),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBe('First chunk\nSecond chunk');
  });

  it('returns undefined and logs when openai_compatible provider has no base URL', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');

    await expect(generatePlatformAIText(
      createConfig({
        baseUrl: undefined,
        model: 'custom-model',
        provider: 'openai_compatible',
      }),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Platform AI provider base URL is missing',
      expect.objectContaining({ provider: 'openai_compatible' }),
    );
  });

  it('returns no text for a successful response with an invalid payload', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({
      unexpected: true,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(generatePlatformAIText(
      createConfig(),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();
  });

  it('redacts provider keys from logged HTTP failure bodies', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockFetchWithTimeout.mockResolvedValue(new Response(
      'Authentication failed for sk-provider-secret',
      {
        status: 401,
        statusText: 'Unauthorized',
      },
    ));

    await expect(generatePlatformAIText(
      createConfig(),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Platform AI provider request failed',
      expect.objectContaining({
        error: 'Authentication failed for [REDACTED]',
        status: 401,
      }),
    );
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain('sk-provider-secret');
  });

  it('redacts configured provider keys that do not use an sk prefix', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    const apiKey = 'custom-provider-token-value';
    mockFetchWithTimeout.mockResolvedValue(new Response(
      `Credential ${apiKey} is invalid`,
      {
        status: 401,
        statusText: 'Unauthorized',
      },
    ));

    await expect(generatePlatformAIText(
      createConfig({
        apiKey,
        baseUrl: 'https://api.example.com',
        provider: 'openai_compatible',
      }),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Platform AI provider request failed',
      expect.objectContaining({
        error: 'Credential [REDACTED] is invalid',
        status: 401,
      }),
    );
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(apiKey);
  });

  it('blocks an unsafe compatible-provider endpoint before sending a request', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    mockAssertSafeOutboundUrl.mockRejectedValue(
      new Error('Outbound URL resolves to a private network'),
    );

    await expect(generatePlatformAIText(
      createConfig({
        baseUrl: 'https://internal.example.test',
        model: 'custom-model',
        provider: 'openai_compatible',
      }),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).resolves.toBeUndefined();

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Platform AI provider base URL was blocked',
      expect.objectContaining({
        error: 'Outbound URL resolves to a private network',
      }),
    );
  });

  it('propagates provider timeouts so the orchestration fallback can handle them', async () => {
    const { generatePlatformAIText } = await import('./PlatformAIClient');
    const timeoutError = new DOMException('The operation timed out', 'TimeoutError');
    mockFetchWithTimeout.mockRejectedValue(timeoutError);

    await expect(generatePlatformAIText(
      createConfig(),
      { input: 'Hello', instructions: 'Reply briefly.' },
    )).rejects.toBe(timeoutError);
  });
});

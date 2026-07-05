import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { WhapiQrConnectButton } from './WhapiQrConnectButton';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
  }),
}));

const renderButton = async () => {
  await render(
    <WhapiQrConnectButton
      title="ربط واتساب عبر QR"
      description="اختبار الربط"
      buttonLabel="إظهار QR"
      errorLabel="تعذر الربط"
      pendingLabel="قيد التجهيز"
      refreshLabel="تحديث بعد المسح"
    />,
  );
};

describe('WhapiQrConnectButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rechecks the managed channel when the refresh-after-scan button is clicked', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response(JSON.stringify({
        channelId: 'channel_123',
        qrDataUrl: 'data:image/png;base64,QR',
        webhookReady: true,
      }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }));

    vi.stubGlobal('fetch', fetchMock);
    mocks.refresh.mockClear();

    await renderButton();

    await userEvent.click(page.getByRole('button', { name: /إظهار QR/ }));

    await expect.element(page.getByRole('img', { name: 'ربط واتساب عبر QR' })).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: /تحديث بعد المسح/ }));

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenLastCalledWith('/api/whapi/connect/qr', {
      credentials: 'same-origin',
      method: 'POST',
    });

    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows a clear subscription message when Whapi needs more active days', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response(JSON.stringify({
        channelId: 'channel_123',
        pending: true,
        pendingReason: 'subscription_expired',
        retryAfterSeconds: 5,
      }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 202,
      }));

    vi.stubGlobal('fetch', fetchMock);
    mocks.refresh.mockClear();

    await render(
      <WhapiQrConnectButton
        title="Connect WhatsApp"
        buttonLabel="Show QR"
        errorLabel="Could not connect"
        issueLabels={{
          subscription_expired: 'WhatsApp connection needs more active days.',
        }}
        pendingLabel="Preparing"
        refreshLabel="Refresh after scan"
      />,
    );

    await userEvent.click(page.getByRole('button', { name: /Show QR/ }));

    await expect.element(page.getByText(/WhatsApp connection needs more active days/)).toBeVisible();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  TWILIO_VERIFY_SERVICE_SID: undefined as string | undefined,
}));

const {
  mockGetTwilioClient,
  mockServices,
  mockVerificationChecksCreate,
  mockVerificationsCreate,
} = vi.hoisted(() => {
  const verificationsCreate = vi.fn();
  const verificationChecksCreate = vi.fn();
  const services = vi.fn(() => ({
    verificationChecks: { create: verificationChecksCreate },
    verifications: { create: verificationsCreate },
  }));

  return {
    mockGetTwilioClient: vi.fn(() => ({ verify: { v2: { services } } })),
    mockServices: services,
    mockVerificationChecksCreate: verificationChecksCreate,
    mockVerificationsCreate: verificationsCreate,
  };
});

vi.mock('./Env', () => ({ Env: mockEnv }));
vi.mock('./TwilioClient', () => ({ getTwilioClient: mockGetTwilioClient }));

const VERIFY_SERVICE_SID = `VA${'a'.repeat(32)}`;

describe('TwilioVerify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.TWILIO_VERIFY_SERVICE_SID = VERIFY_SERVICE_SID;
  });

  describe('sendOtp', () => {
    it('returns not_configured when the verify service is missing', async () => {
      mockEnv.TWILIO_VERIFY_SERVICE_SID = undefined;
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp('+966500000001')).resolves.toEqual({
        error: 'not_configured',
        success: false,
      });
      expect(mockGetTwilioClient).not.toHaveBeenCalled();
    });

    it('normalizes a bare number, targets the verify service, and sends via SMS', async () => {
      mockVerificationsCreate.mockResolvedValue({ status: 'pending' });
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp(' 966 500 000 001 ')).resolves.toEqual({ success: true });
      expect(mockServices).toHaveBeenCalledWith(VERIFY_SERVICE_SID);
      expect(mockVerificationsCreate).toHaveBeenCalledWith({
        channel: 'sms',
        to: '+966500000001',
      });
    });

    it('preserves an already E.164-formatted number', async () => {
      mockVerificationsCreate.mockResolvedValue({ status: 'pending' });
      const { sendOtp } = await import('./TwilioVerify');

      await sendOtp('+14155552671');

      expect(mockVerificationsCreate).toHaveBeenCalledWith({
        channel: 'sms',
        to: '+14155552671',
      });
    });

    it('rejects an empty phone before calling Twilio', async () => {
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp('   ')).resolves.toEqual({
        error: 'invalid_phone',
        success: false,
      });
      expect(mockVerificationsCreate).not.toHaveBeenCalled();
    });

    it('rejects a phone shorter than 8 characters', async () => {
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp('123')).resolves.toEqual({
        error: 'invalid_phone',
        success: false,
      });
      expect(mockVerificationsCreate).not.toHaveBeenCalled();
    });

    it('returns send_failed when Twilio does not report a pending status', async () => {
      mockVerificationsCreate.mockResolvedValue({ status: 'canceled' });
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp('+966500000001')).resolves.toEqual({
        error: 'send_failed',
        success: false,
      });
    });

    it.each([60203, 60212])(
      'maps Twilio rate-limit code %i to rate_limited',
      async (code) => {
        mockVerificationsCreate.mockRejectedValue({ code });
        const { sendOtp } = await import('./TwilioVerify');

        await expect(sendOtp('+966500000001')).resolves.toEqual({
          error: 'rate_limited',
          success: false,
        });
      },
    );

    it('maps unknown Twilio errors to send_failed', async () => {
      mockVerificationsCreate.mockRejectedValue({ code: 12345 });
      const { sendOtp } = await import('./TwilioVerify');

      await expect(sendOtp('+966500000001')).resolves.toEqual({
        error: 'send_failed',
        success: false,
      });
    });
  });

  describe('checkOtp', () => {
    it('returns not_configured when the verify service is missing', async () => {
      mockEnv.TWILIO_VERIFY_SERVICE_SID = undefined;
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('+966500000001', '123456')).resolves.toEqual({
        error: 'not_configured',
        success: false,
      });
      expect(mockGetTwilioClient).not.toHaveBeenCalled();
    });

    it('rejects an empty phone as invalid_code', async () => {
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('   ', '123456')).resolves.toEqual({
        error: 'invalid_code',
        success: false,
      });
      expect(mockVerificationChecksCreate).not.toHaveBeenCalled();
    });

    it.each(['12', 'abcdef', '123456789'])(
      'rejects a malformed code %s without calling Twilio',
      async (code) => {
        const { checkOtp } = await import('./TwilioVerify');

        await expect(checkOtp('+966500000001', code)).resolves.toEqual({
          error: 'invalid_code',
          success: false,
        });
        expect(mockVerificationChecksCreate).not.toHaveBeenCalled();
      },
    );

    it('approves a valid code and targets the verify service', async () => {
      mockVerificationChecksCreate.mockResolvedValue({ status: 'approved' });
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('+966500000001', ' 123456 ')).resolves.toEqual({ success: true });
      expect(mockServices).toHaveBeenCalledWith(VERIFY_SERVICE_SID);
      expect(mockVerificationChecksCreate).toHaveBeenCalledWith({
        code: '123456',
        to: '+966500000001',
      });
    });

    it('maps an expired verification to expired', async () => {
      mockVerificationChecksCreate.mockResolvedValue({ status: 'expired' });
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('+966500000001', '123456')).resolves.toEqual({
        error: 'expired',
        success: false,
      });
    });

    it('maps any other status to invalid_code', async () => {
      mockVerificationChecksCreate.mockResolvedValue({ status: 'pending' });
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('+966500000001', '123456')).resolves.toEqual({
        error: 'invalid_code',
        success: false,
      });
    });

    it('returns check_failed when Twilio throws', async () => {
      mockVerificationChecksCreate.mockRejectedValue(new Error('network'));
      const { checkOtp } = await import('./TwilioVerify');

      await expect(checkOtp('+966500000001', '123456')).resolves.toEqual({
        error: 'check_failed',
        success: false,
      });
    });
  });
});

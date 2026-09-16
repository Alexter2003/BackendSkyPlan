import { ConfigService } from '@nestjs/config';
import { ResendMailService } from '../../../src/modules/mail/resend-mail.service.js';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe('ResendMailService', () => {
  const payload = {
    to: 'test@skyplan.dev',
    username: 'testuser',
    confirmationCode: 'abc123',
  };

  beforeEach(() => {
    sendMock.mockReset();
  });

  function createService(
    config: Partial<Record<string, string>>,
  ): ResendMailService {
    const configService = {
      get: vi.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return new ResendMailService(configService);
  }

  it('sends with MAIL_FROM, the recipient and a body containing the confirmation code', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const service = createService({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'SkyPlan <no-reply@skyplan.alexvyumes-dev.com>',
    });

    await service.sendConfirmationEmail(payload);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SkyPlan <no-reply@skyplan.alexvyumes-dev.com>',
        to: payload.to,
        html: expect.stringContaining(payload.confirmationCode),
        text: expect.stringContaining(payload.confirmationCode),
      }),
    );
  });

  it('uses the default from address when MAIL_FROM is not set', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const service = createService({ RESEND_API_KEY: 're_test' });

    await service.sendConfirmationEmail(payload);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SkyPlan <no-reply@skyplan.alexvyumes-dev.com>',
      }),
    );
  });

  it('throws when the Resend SDK returns an error', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid API key' },
    });
    const service = createService({ RESEND_API_KEY: 're_test' });

    await expect(service.sendConfirmationEmail(payload)).rejects.toThrow(
      'invalid API key',
    );
  });
});

import { Injectable, Logger } from '@nestjs/common';
import type {
  ConfirmationEmail,
  MailPort,
} from './interfaces/mail-port.interface.js';

// Mock implementation: no real email provider is wired up yet. Logs the
// confirmation code instead of sending anything, so the registration flow
// stays testable end-to-end until a real provider (nodemailer, Resend, ...)
// is picked and swapped in via MailModule's provider registration.
@Injectable()
export class MockMailService implements MailPort {
  private readonly logger = new Logger(MockMailService.name);

  async sendConfirmationEmail(payload: ConfirmationEmail): Promise<void> {
    await Promise.resolve();
    this.logger.log(
      `[MOCK] Confirmation email for ${payload.to} (${payload.username}) — code: ${payload.confirmationCode}`,
    );
  }
}
